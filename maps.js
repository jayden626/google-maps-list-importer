// maps.js

async function addToList(page, list) {
  const listButton = page.getByRole("menuitemradio").filter({
    hasText: list,
  });

  await listButton.waitFor({
    state: "visible",
    timeout: 5000,
  });

  const checked = await listButton.getAttribute("aria-checked");

  if (checked === "true") {
    return false;
  }

  await listButton.click();

  await page.waitForTimeout(500);

  return true;
}

async function gotoPlace(page, url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      if (page.url().includes("/sorry/")) {
        throw new Error("Google challenge page");
      }

      return true;
    } catch (err) {
      if (attempt === 3) {
        return false;
      }

      console.log(`⚠ Navigation retry (${attempt}/3)`);

      await sleep(30000 * attempt);
    }
  }
}

async function savePlace(page, list) {
  const saveButton = page.locator(
    'button[aria-label^="Save"]:not([aria-label^="Saved in"])',
  );

  await saveButton.waitFor({
    state: "visible",
    timeout: 10000,
  });

  await saveButton.click();

  await page.waitForTimeout(1000);

  return addToList(page, list);
}

async function addNote(page, note, list) {
  // Target the container specific to this list group
  const listContainer = page.getByRole("group", {
    name: new RegExp(`Saved in ${list}`, "i"),
  });

  // Target the note textarea inside that specific list section
  const noteBox = listContainer.locator('textarea[aria-label="Add note"]').first();

  await noteBox.waitFor({
    state: "visible",
    timeout: 5000,
  });

  await noteBox.fill(note);

  // Close the list drawer
  const closeButton = page
    .locator('button[aria-label="Hide place lists details"]')
    .first();

  if (await closeButton.isVisible()) {
    await closeButton.click();
  }

  await page
    .getByText(note, { exact: true })
    .first()
    .waitFor({
      state: "visible",
      timeout: 5000,
    });
}

module.exports = {
  gotoPlace,
  savePlace,
  addNote,
  addToList,
};