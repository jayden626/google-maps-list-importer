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
    console.log(`Already in list: ${list}`);
    return false;
  }

  await listButton.click();

  await page.waitForTimeout(1000);

  return true;
}

module.exports = {
  addToList,
};