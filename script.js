const { chromium } = require("playwright");
const fs = require("fs");

const {
  sleep,
  formatTime,
  timestamp,
  appendLine,
  loadLines,
  findFiles,
  extractSavedPlaces,
  extractCSV,
} = require("./utils");

const { addToList } = require("./maps");

(async () => {
  const startTime = Date.now();

  let savedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let retryCount = 0;

  const path = require("path");

  const runId = timestamp();

  const logsDirectory = "./logs";

  if (!fs.existsSync(logsDirectory)) {
    fs.mkdirSync(logsDirectory);
  }

  const savedLog = path.join(logsDirectory, `saved-run-${runId}.txt`);
  const skippedLog = path.join(logsDirectory, `skipped-run-${runId}.txt`);
  const failedLog = path.join(logsDirectory, `failed-run-${runId}.txt`);

  const importDirectory = "./import";
  const savedPlacesFile = "saved-places-all.txt";
  const listDirectory = "./saved-lists";

  if (!fs.existsSync(listDirectory)) {
    fs.mkdirSync(listDirectory);
  }

  const savedPlacesHistory = loadLines(savedPlacesFile);

  const getListFile = (list) => `${listDirectory}/${list}.txt`;

  console.log(`Scanning ${importDirectory}...`);

  const files = findFiles(importDirectory, [".json", ".csv"]);

  let places = [];

  for (const file of files) {
    try {
      if (file.endsWith("Saved Places.json")) {
        console.log(`Loading ${file}`);

        places.push(...extractSavedPlaces(file));
      } else if (file.toLowerCase().endsWith(".csv")) {
        console.log(`Loading ${file}`);

        places.push(...extractCSV(file));
      }
    } catch (err) {
      console.log(`Failed reading ${file}: ${err.message}`);
    }
  }
  return;

  const uniquePlaces = new Map();

  for (const place of places) {
    uniquePlaces.set(`${place.list}:${place.url}`, place);
  }

  places = Array.from(uniquePlaces.values());

  console.log(`Found ${places.length} places`);

  const browser = await chromium.connectOverCDP("http://localhost:9222");

  const context = browser.contexts()[0];

  const page = context.pages()[0];

  const total = places.length;

  for (let i = 0; i < total; i++) {
    const placeStart = Date.now();

    const { name, note, url, list } = places[i];

    const historyFile =
      list === "Starred places" ? savedPlacesFile : getListFile(list);

    const history =
      list === "Starred places" ? savedPlacesHistory : loadLines(historyFile);

    if (history.has(url)) {
      skippedCount++;

      appendLine(skippedLog, `${name} | ${list} | ${url}`);

      continue;
    }

    console.log(`[${i + 1}/${total}] ${name}`);

    console.log(url);
    console.log(`List: ${list}`);

    let loaded = false;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        if (page.url().includes("/sorry/")) {
          throw new Error("Google challenge page");
        }

        loaded = true;
        break;
      } catch (err) {
        if (attempt < 3) {
          retryCount++;

          console.log(`⚠ Navigation retry (${attempt}/3)`);

          await sleep(30000 * attempt);
        }
      }
    }

    if (!loaded) {
      failedCount++;

      appendLine(failedLog, `${name} | ${list} | ${url}`);

      console.log("✗ Failed loading");
    } else {
      try {
        const saveButton = page.getByRole("button", {
          name: "Save",
          exact: true,
        });

        const savedButton = page.locator(
          'button[aria-label^="Saved"]:not([aria-label^="Saved in"])'
        );

        await Promise.race([
          saveButton.waitFor({
            state: "visible",
            timeout: 10000,
          }),

          savedButton.waitFor({
            state: "visible",
            timeout: 10000,
          }),
        ]);

        let newlySaved = false;

        const notSaved = await saveButton.isVisible().catch(() => false);

        if (notSaved) {
          console.log("Not saved. Saving...");

          await saveButton.click();

          await page.waitForTimeout(1000);

          if (await addToList(page, list)) {
            newlySaved = true;
            savedCount++;

            console.log("✓ Saved");
          }
        } else {
          console.log("Saved already. Opening list menu...");

          await savedButton.click();

          await page.waitForTimeout(1000);

          if (await addToList(page, list)) {
            newlySaved = true;
            savedCount++;

            console.log(`✓ Added to "${list}"`);
          } else {
            skippedCount++;

            console.log(`↪ Already saved in "${list}"`);
          }
        }
        if (newlySaved && note) {
          const noteBox = page.locator('textarea[aria-label="Add note"]');

          await noteBox.waitFor({
            state: "visible",
            timeout: 5000,
          });

          await noteBox.fill(note);

          const hideDetailsButton = page.locator(
            'button[aria-label="Hide place lists details"]',
          );

          await hideDetailsButton.waitFor({
            state: "visible",
            timeout: 5000,
          });

          await hideDetailsButton.click();

          await page
            .getByText(note, {
              exact: true,
            })
            .waitFor({
              state: "visible",
              timeout: 5000,
            });

          console.log("✓ Note added");
        }

        history.add(url);

        appendLine(historyFile, url);

        appendLine(savedLog, `${name} | ${list} | ${url}`);
      } catch (err) {
        failedCount++;

        appendLine(failedLog, `${name} | ${list} | ${url}`);

        console.log("✗ Failed saving");

        console.log(err.message);
      }
    }

    const elapsed = (Date.now() - startTime) / 1000;

    const processed = i + 1;

    const average = elapsed / processed;

    const eta = average * (total - processed);

    const placeTime = (Date.now() - placeStart) / 1000;

    console.log(
      `Time ${placeTime.toFixed(1)}s | ` +
        `Saved ${savedCount} | ` +
        `Skipped ${skippedCount} | ` +
        `Failed ${failedCount}`,
    );

    console.log(
      `Elapsed ${formatTime(elapsed)} | ` + `ETA ${formatTime(eta)}\n`,
    );
  }

  const totalTime = (Date.now() - startTime) / 1000;

  console.log("==============================");
  console.log("Finished");
  console.log("==============================");

  console.log(`Total places: ${total}`);

  console.log(`Saved this run: ${savedCount}`);

  console.log(`Skipped: ${skippedCount}`);

  console.log(`Failed: ${failedCount}`);

  console.log(`Retries: ${retryCount}`);

  console.log(`Total time: ${formatTime(totalTime)}`);

  if (total > 0) {
    console.log(`Average: ${(totalTime / total).toFixed(2)}s/place`);
  }

  // Disconnect Playwright without closing Chrome
  await browser.close();

  process.exit(0);
})();
