// maps.js

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function addToList(page, list) {
  // Wait for the menu container itself to appear first
  const menuContainer = page.locator('div[role="menu"][aria-label="Save in your lists"]');
  await menuContainer.waitFor({ state: "visible", timeout: 5000 });

  // Check if any lists exist in the menu
  const menuItems = page.getByRole("menuitemradio");
  const itemCount = await menuItems.count();

  if (itemCount === 0) {
    // Menu loaded, but contains no lists (Dead place / unhandled place card)
    throw new Error(`PlaceUnavailable: Place page loaded but lists menu is empty. Probably a dead link`);
  }

  const listButton = menuItems.filter({
    hasText: list,
  });

  try {
    await listButton.waitFor({
      state: "visible",
      timeout: 3000,
    });
  } catch (err) {
    // Menu loaded lists, but your specific list was not found on your Google account
    throw new Error(`ListNotFound: "${list}"`);
  }

  const checked = await listButton.getAttribute("aria-checked");

  if (checked === "true") {
    return false;
  }

  await listButton.click();
  await page.waitForTimeout(500);

  return true;
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
  try {
    await page
    .getByText(note, { exact: true })
    .first()
    .waitFor({
      state: "visible",
      timeout: 5000,
    });
  } catch (error) {
    throw new Error(`ConfirmNote: Could not ensure note was saved. It probably was, but maybe double check`);
  }
}

module.exports = {
  gotoPlace,
  savePlace,
  addNote,
  addToList,
};