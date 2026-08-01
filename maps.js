// maps.js

async function addToList(page, list) {
  const listButton = page.getByRole("menuitemradio").filter({
    hasText: list,
  });

  await listButton.waitFor({
    state: "visible",
    timeout: 5000,
  });

  const checked = await listButton.getAttribute(
    "aria-checked",
  );

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

async function addNote(page, note) {
  const noteBox = page.locator('textarea[aria-label="Add note"]');

  await noteBox.waitFor({
    state: "visible",
    timeout: 5000,
  });

  await noteBox.fill(note);

  await page.locator(
    'button[aria-label="Hide place lists details"]',
  ).click();

  await page.getByText(note, {
    exact: true,
  }).waitFor({
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