#!/usr/bin/env node

const { chromium } = require("playwright");
const fs = require("fs-extra");
const path = require("path");
const { parseArgs } = require("util");

const { formatTime, appendLine, loadLines, loadPlaces } = require("./utils");
const { gotoPlace, savePlace, addNote } = require("./maps");

// CLI Flags configuration
const options = {
  port:              { type: "string",  short: "p", default: "9222" },
  check:             { type: "boolean", short: "c", default: false },
  lists:             { type: "string",  short: "l", default: "./lists" },
  history:           { type: "string",  short: "h", default: "./history" },
  logs:              { type: "string",  short: "o", default: "./logs" },
  flush:             { type: "string",  short: "f", default: "50" },
  "starred-list":    { type: "string",  default: "Starred places" },
  "saved-places-file": { type: "string", default: "Saved Places.json" },
};

// Verifies CDP connection to Chrome without running the full import process
async function testConnection(cdpUrl) {
  console.log(`Connecting to Chrome at ${cdpUrl}...`);
  try {
    const browser = await chromium.connectOverCDP(cdpUrl);
    const pages = browser.contexts()[0]?.pages() || [];
    console.log(`✓ Connected! Tabs: ${pages.length}`);
    await browser.close();
    return true;
  } catch (err) {
    console.error(`\n✗ Connection failed: ${err.message}`);
    console.error("Run Chrome (Linux): google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/maps-chrome");
    console.error("Run Chrome (Mac [Untested]): /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/maps-chrome");
    console.error('Run Chrome (Windows [Untested]): "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\\Google\\Chrome\\MapsUser"');
    console.error("You may need to open a new terminal once Chrome is running\n");
    return false;
  }
}

(async () => {
  const { values } = parseArgs({ options, allowPositionals: true });
  const cdpUrl = `http://localhost:${values.port}`;

  if (values.check) {
    const ok = await testConnection(cdpUrl);
    process.exit(ok ? 0 : 1);
  }

  if (path.basename(process.cwd()).toLowerCase() === "lists" && values.lists === "./lists") {
    console.error(`✗ You are already inside a "lists" directory. Move up one folder with 'cd ..' or run with '--lists .'`);
    process.exit(1);
  }

  const startTime = Date.now();
  const runId = new Date().toISOString().replace(/[:.]/g, "-");

  const logsDir = values.logs;
  const historyDir = values.history;
  const listsDir = values.lists;

  // Dedicated directory for this specific run: logs/run_{runID}/
  const currentRunDir = path.join(logsDir, `run_${runId}`);
  const failuresDir = path.join(currentRunDir, "failures");

  fs.ensureDirSync(logsDir);
  fs.ensureDirSync(historyDir);

  const listsDirExisted = fs.existsSync(listsDir);
  fs.ensureDirSync(listsDir);
  const filesInListsDir = fs.readdirSync(listsDir);

  if (!listsDirExisted || filesInListsDir.length === 0) {
    console.error(`\n✗ No input files found in "${listsDir}".`);
    console.error(`  Created directory: ${path.resolve(listsDir)}`);
    console.error(`  Please drop your Google Takeout CSV or JSON files there and run again.\n`);
    process.exit(1);
  }

  fs.ensureDirSync(currentRunDir);
  const savedLog = path.join(currentRunDir, "saved.txt");
  const skippedLog = path.join(currentRunDir, "skipped.txt");

  const placesByList = loadPlaces(listsDir, {
    targetList: values["starred-list"],
    jsonFileName: values["saved-places-file"],
  });

  let browser;
  try {
    browser = await chromium.connectOverCDP(cdpUrl);
  } catch (err) {
    console.error(`\n✗ Failed connecting on port ${values.port}. Run 'npx google-maps-list-importer --check'\n`);
    process.exit(1);
  }

  let page = browser.contexts()[0]?.pages()[0];
  if (!page) {
    console.error("✗ No open tabs in Chrome.");
    process.exit(1);
  }

  // Ready to start, write logs to file
  const runLogStream = fs.createWriteStream(path.join(currentRunDir, "output.log"), { flags: "a" });
  const origStdout = process.stdout.write.bind(process.stdout);
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk, encoding, callback) => {
    runLogStream.write(chunk, encoding);
    return origStdout(chunk, encoding, callback);
  };
  process.stderr.write = (chunk, encoding, callback) => {
    runLogStream.write(chunk, encoding);
    return origStderr(chunk, encoding, callback);
  };

  // Start importing
  let totalSaved = 0, totalSkipped = 0, totalFailed = 0;
  const missingLists = [];
  const failedListFiles = [];
  const flushInterval = parseInt(values.flush, 10) || 50;

  for (const [list, places] of Object.entries(placesByList)) {
    const historyFile = path.join(historyDir, `${list}.txt`);
    const history = loadLines(historyFile);

    // List-specific log inside failures/
    const listFailedLog = path.join(failuresDir, `${list}.txt`);

    let savedCount = 0, skippedCount = 0, failedCount = 0;
    const processingTimes = [];

    console.log(`\n==============================\nList: ${list} (${places.length} places)\n==============================`);

    for (const [index, { name, note, url }] of places.entries()) {
      if (history.has(url)) {
        skippedCount++;
        appendLine(skippedLog, `${name} | ${list} | ${url}`);
        console.log(`↪ Skipping [${index + 1}/${places.length}] ${name} (in history)`);
        continue;
      }

      // Recycle tab every xx places to save memory.
      const totalProcessed = totalSaved + savedCount + totalFailed + failedCount;
      if (totalProcessed > 0 && totalProcessed % flushInterval === 0) {
        try {
          const oldPage = page;
          page = await page.context().newPage();
          await oldPage.close().catch(() => {});
        } catch (err) {
          console.warn(`Failed to flush page: ${err.message}`);
        }
      }

      const placeStart = Date.now();
      console.log(`[${index + 1}/${places.length}] ${name}\n${url}`);

      if (!(await gotoPlace(page, url))) {
        failedCount++;
        fs.ensureDirSync(failuresDir);
        appendLine(listFailedLog, `${name} | ${url} | Reason: Page load failed`);
        if (!failedListFiles.includes(listFailedLog)) failedListFiles.push(listFailedLog);

        console.log("✗ Failed loading\n");
        processingTimes.push((Date.now() - placeStart) / 1000);
        continue;
      }

      try {
        const newlySaved = await savePlace(page, list);
        if (newlySaved) {
          savedCount++;
          appendLine(savedLog, `${name} | ${list} | ${url}`);
          console.log(`✓ Saved to "${list}"`);
          if (note) {
            await addNote(page, note, list);
            console.log("✓ Note added");
          }
        } else {
          skippedCount++;
          appendLine(skippedLog, `${name} | ${list} | ${url}`);
          console.log(`↪ Already saved in "${list}"`);
        }

        history.add(url);
        appendLine(historyFile, url);
      } catch (err) {
        if (err.message.includes("ListNotFound")) {
          console.error(`\n⚠ WARNING: List "${list}" does not exist on your Google Maps account.`);
          console.error(`  Skipping remaining ${places.length - index} place(s) in this list...\n`);
          
          missingLists.push(list);
          fs.ensureDirSync(failuresDir);
          appendLine(listFailedLog, `[LIST MISSING] "${list}" does not exist. Halting on: ${name} (${url})`);
          if (!failedListFiles.includes(listFailedLog)) failedListFiles.push(listFailedLog);
          break;
        }

        if (err.message.includes("PlaceUnavailable")) {
          console.log(`✗ Place unavailable or dead link (empty save menu)`);
        } else {
          console.log(`✗ Failed saving: ${err.message}`);
        }

        failedCount++;
        history.add(url);
        appendLine(historyFile, url);
        fs.ensureDirSync(failuresDir);
        appendLine(listFailedLog, `${name} | ${url} | Error: ${err.message}`);
        if (!failedListFiles.includes(listFailedLog)) failedListFiles.push(listFailedLog);
      }

      const placeTimeSec = (Date.now() - placeStart) / 1000;
      processingTimes.push(placeTimeSec);

      const avgTimeSec = processingTimes.reduce((sum, t) => sum + t, 0) / processingTimes.length;
      const etaSeconds = (places.length - (index + 1)) * avgTimeSec;

      console.log(`Time ${placeTimeSec.toFixed(1)}s | Saved ${savedCount} | Skipped ${skippedCount} | Failed ${failedCount} | ETA: ${formatTime(etaSeconds)}\n`);
    }

    totalSaved += savedCount;
    totalSkipped += skippedCount;
    totalFailed += failedCount;

    console.log(`\n------------------------------\nFinished list: ${list}\nSaved: ${savedCount} | Skipped: ${skippedCount} | Failed: ${failedCount}\n------------------------------`);
  }

  const totalTime = (Date.now() - startTime) / 1000;
  console.log(`\n==============================\nFinished\n==============================`);
  console.log(`Saved: ${totalSaved} | Skipped: ${totalSkipped} | Failed: ${totalFailed}`);
  console.log(`Total time: ${formatTime(totalTime)}`);

  // Warning for missing Google Maps lists
  if (missingLists.length > 0) {
    console.log(`\n==============================`);
    console.log(`⚠ MISSING LISTS ACTION REQUIRED`);
    console.log(`==============================`);
    console.log(`The following list(s) do not exist in your Google Maps account:`);
    for (const missingList of missingLists) {
      console.log(`  - "${missingList}"`);
    }
    console.log(`\nPlease create these lists on Google Maps and re-run the script to import them.`);
  }

  // Instructions for reviewing failures
  if (failedListFiles.length > 0) {
    console.log(`\n==============================`);
    console.log(`⚠ FAILED ITEMS REVIEW`);
    console.log(`==============================`);
    console.log(`Some items failed to save during this run.`);
    console.log(`Failure logs for this run are located at:\n  ${path.resolve(failuresDir)}/`);
    console.log(`\nPlease manually check each failed log file:`);
    for (const logPath of failedListFiles) {
      console.log(`  - ${path.basename(logPath)}`);
    }
    console.log(`\nOpen each link manually in your browser to verify or save the place.`);
  }

  await browser.close();
})();