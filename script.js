#!/usr/bin/env node

const { chromium } = require("playwright");
const fs = require("fs-extra");
const path = require("path");
const { parseArgs } = require("util");

const { formatTime, appendLine, loadLines, loadPlaces } = require("./utils");
const { gotoPlace, savePlace, addNote } = require("./maps");

// CLI Flags configuration
const options = {
  port:    { type: "string",  short: "p", default: "9222" },
  check:   { type: "boolean", short: "c", default: false },
  lists:   { type: "string",  short: "l", default: "./lists" },
  history: { type: "string",  short: "h", default: "./history" },
  logs:    { type: "string",  short: "o", default: "./logs" },
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
    console.error("Run Chrome: google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/maps-chrome\n");
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

  // Ensure execution folder exists for this run
  fs.ensureDirSync(currentRunDir);

  const savedLog = path.join(currentRunDir, "saved.txt");
  const skippedLog = path.join(currentRunDir, "skipped.txt");

  const placesByList = loadPlaces(listsDir);

  let browser;
  try {
    browser = await chromium.connectOverCDP(cdpUrl);
  } catch (err) {
    console.error(`\n✗ Failed connecting on port ${values.port}. Run 'node script.js --check'\n`);
    process.exit(1);
  }

  const page = browser.contexts()[0]?.pages()[0];
  if (!page) {
    console.error("✗ No open tabs in Chrome.");
    process.exit(1);
  }

  let totalSaved = 0, totalSkipped = 0, totalFailed = 0;
  const missingLists = [];
  const failedListFiles = [];

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

        failedCount++;
        fs.ensureDirSync(failuresDir);
        appendLine(listFailedLog, `${name} | ${url} | Error: ${err.message}`);
        if (!failedListFiles.includes(listFailedLog)) failedListFiles.push(listFailedLog);

        console.log(`✗ Failed saving: ${err.message}`);
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