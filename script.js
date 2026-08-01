// script.js

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
  // Parse command-line arguments
  const { values } = parseArgs({ options, allowPositionals: true });
  const cdpUrl = `http://localhost:${values.port}`;

  // Quick connectivity test mode
  if (values.check) {
    const ok = await testConnection(cdpUrl);
    process.exit(ok ? 0 : 1);
  }

  const startTime = Date.now();
  const runId = new Date().toISOString().replace(/[:.]/g, "-");

  const logsDir = values.logs;
  const historyDir = values.history;
  const listsDir = values.lists;

  // Ensure working directories exist
  fs.ensureDirSync(logsDir);
  fs.ensureDirSync(historyDir);

  // Validate input directory; create and halt if missing or empty
  const listsDirExisted = fs.existsSync(listsDir);
  fs.ensureDirSync(listsDir);
  const filesInListsDir = fs.readdirSync(listsDir);

  if (!listsDirExisted || filesInListsDir.length === 0) {
    console.error(`\n✗ No input files found in "${listsDir}".`);
    console.error(`  Created directory: ${path.resolve(listsDir)}`);
    console.error(`  Please drop your Google Takeout CSV or JSON files there and run again.\n`);
    process.exit(1);
  }

  // Setup run-specific execution logs (MOVED HERE BEFORE MAIN LOOP)
  const savedLog = path.join(logsDir, `saved-run-${runId}.txt`);
  const skippedLog = path.join(logsDir, `skipped-run-${runId}.txt`);
  const failedLog = path.join(logsDir, `failed-run-${runId}.txt`);

  // Load and parse Takeout files from input directory
  const placesByList = loadPlaces(listsDir);

  // Connect to active Chrome instance via CDP
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

  // Process each Google Maps list
  for (const [list, places] of Object.entries(placesByList)) {
    const historyFile = path.join(historyDir, `${list}.txt`);
    const history = loadLines(historyFile);

    let savedCount = 0, skippedCount = 0, failedCount = 0;
    const processingTimes = [];

    console.log(`\n==============================\nList: ${list} (${places.length} places)\n==============================`);

    // Loop through individual places in current list
    for (const [index, { name, note, url }] of places.entries()) {
      // Skip if URL was processed in a prior run
      if (history.has(url)) {
        skippedCount++;
        appendLine(skippedLog, `${name} | ${list} | ${url}`);
        console.log(`↪ Skipping [${index + 1}/${places.length}] ${name} (in history)`);
        continue;
      }

      const placeStart = Date.now();
      console.log(`[${index + 1}/${places.length}] ${name}\n${url}`);

      // Navigate to Google Maps place page
      if (!(await gotoPlace(page, url))) {
        failedCount++;
        appendLine(failedLog, `${name} | ${list} | ${url}`);
        console.log("✗ Failed loading\n");
        processingTimes.push((Date.now() - placeStart) / 1000);
        continue;
      }

      // Save place and attach note if available
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

        // Record URL in local history
        history.add(url);
        appendLine(historyFile, url);
      } catch (err) {
        failedCount++;
        appendLine(failedLog, `${name} | ${list} | ${url} | ${err.message}`);
        console.log(`✗ Failed saving: ${err.message}`);
      }

      // Calculate runtime metrics & rolling ETA
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

  // Summary output
  const totalTime = (Date.now() - startTime) / 1000;
  console.log(`\n==============================\nFinished\n==============================`);
  console.log(`Saved: ${totalSaved} | Skipped: ${totalSkipped} | Failed: ${totalFailed}`);
  console.log(`Total time: ${formatTime(totalTime)}`);

  await browser.close();
})();