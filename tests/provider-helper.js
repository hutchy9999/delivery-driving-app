async function chooseProvider(page, id) {
  const route = new URL(page.url()).hash || '#home';
  const settings = new URL(page.url()); settings.hash = '#settings';
  if (route !== '#settings') await page.goto(settings.href);
  await page.locator(`[data-platform="${id}"]`).click();
  if (route !== '#settings') {
    settings.hash = route; await page.goto(settings.href);
    await page.locator('#platform-selector').waitFor({ state: 'detached' });
  }
}
module.exports = { chooseProvider };
