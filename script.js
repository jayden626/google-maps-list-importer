// script.js

const { chromium } = require("playwright");
const fs = require("fs-extra");
const path = require("path");

const {
  formatTime,
  appendLine,
  loadLines,
  loadPlaces,
} = require("./utils");

const {
  gotoPlace,
  savePlace,
  addNote,
} = require("./maps");

(async () => {
  const startTime = Date.now();
  const runId = new Date().toISOString().replace(/[:.]/g, "-");

  const logsDirectory = "./logs";
  const listDirectory = "./saved-lists";
  const importDirectory = "./import";

  fs.ensureDirSync(logsDirectory);
  fs.ensureDirSync(listDirectory);

  const savedLog = path.join(logsDirectory, `saved-run-${runId}.txt`);
  const skippedLog = path.join(logsDirectory, `skipped-run-${runId}.txt`);
  const failedLog = path.join(logsDirectory, `failed-run-${runId}.txt`);

  const placesByList = loadPlaces(importDirectory);

  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const page = browser.contexts()[0].pages()[0];

  let totalSaved = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const [list, places] of Object.entries(placesByList)) {
    const historyFile = path.join(listDirectory, `${list}.txt`);
    const history = loadLines(historyFile);

    let savedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    // Stores processing times in seconds for actual network/page actions (excludes history skips)
    const processingTimes = [];

    console.log("\n==============================");
    console.log(`List: ${list} (${places.length} places)`);
    console.log("==============================");

    for (const [index, { name, note, url }] of places.entries()) {
      if (history.has(url)) {
        skippedCount++;
        appendLine(skippedLog, `${name} | ${list} | ${url}`);
        console.log(`↪ Skipping [${index + 1}/${places.length}] ${name} (already in history)`);
        continue;
      }

      const placeStart = Date.now();

      console.log(`[${index + 1}/${places.length}] ${name}\n${url}`);

      if (!(await gotoPlace(page, url))) {
        failedCount++;
        appendLine(failedLog, `${name} | ${list} | ${url}`);
        console.log("✗ Failed loading\n");

        // Count failed loading towards timing
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
            await addNote(page, note);
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
        failedCount++;
        appendLine(failedLog, `${name} | ${list} | ${url} | ${err.message}`);
        console.log(`✗ Failed saving: ${err.message}`);
      }

      const placeTimeSec = (Date.now() - placeStart) / 1000;
      processingTimes.push(placeTimeSec);

      // --- ETA Calculation ---
      const avgTimeSec =
        processingTimes.reduce((sum, t) => sum + t, 0) / processingTimes.length;
      
      const remainingItems = places.length - (index + 1);
      const etaSeconds = remainingItems * avgTimeSec;

      console.log(
        `Time ${placeTimeSec.toFixed(1)}s | ` +
          `Saved ${savedCount} | ` +
          `Skipped ${skippedCount} | ` +
          `Failed ${failedCount} | ` +
          `List ETA: ${formatTime(etaSeconds)}\n`
      );
    }

    totalSaved += savedCount;
    totalSkipped += skippedCount;
    totalFailed += failedCount;

    console.log("\n------------------------------");
    console.log(`Finished list: ${list}`);
    console.log(`Saved: ${savedCount} | Skipped: ${skippedCount} | Failed: ${failedCount}`);
    console.log("------------------------------");
  }

  const totalTime = (Date.now() - startTime) / 1000;

  console.log("\n==============================");
  console.log("Finished");
  console.log("==============================");
  console.log(`Saved: ${totalSaved} | Skipped: ${totalSkipped} | Failed: ${totalFailed}`);
  console.log(`Total time: ${formatTime(totalTime)}`);

  const totalPlaces = Object.values(placesByList).reduce(
    (sum, list) => sum + list.length,
    0,
  );

  if (totalPlaces) {
    console.log(`Average: ${formatTime(totalTime / totalPlaces)}/place`);
  }

  await browser.close();
})();