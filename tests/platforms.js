const { chooseProvider } = require('./provider-helper');
const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mockPhoton } = require('./photon-mock');
const URL = 'http://localhost:8765/';

(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ ...devices['Pixel 7'], timezoneId: 'Europe/London', acceptDownloads: true });
    await mockPhoton(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', (dialog) => dialog.accept());
    const read = (key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), key);
    const go = async (hash) => { await page.goto(URL + hash); };
    const choose = async (id) => chooseProvider(page, id);
    const summary = () => page.locator('[data-platform-summary]').innerText();
    const screenshot = async (name) => {
      if (!process.env.SCREENSHOT_DIR) return;
      await page.waitForSelector('#toast', { state: 'hidden' });
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, name), scale: 'css' });
    };

    await go('#order');
    assert.equal(await page.locator('[data-platform]').count(), 0, 'no top selector on Order');
    assert.equal(await page.locator('#take').count(), 1, 'Just Eat is the initial default');
    await page.evaluate(() => { localStorage['sp.platform'] = JSON.stringify('all'); localStorage.removeItem('sp.providerSettings'); });
    await page.reload();
    assert.equal(await page.locator('#take').count(), 1, 'old All preference upgrades to Just Eat without changing records');
    await go('#settings');
    assert.deepEqual(await page.locator('[data-platform]').allTextContents(), ['All', '✓ Just Eat', 'Deliveroo']);
    await go('#order');
    await choose('all');
    assert.equal(await page.locator('#take').count(), 0, 'All cannot be assigned to an order');
    await choose('just-eat');
    await page.fill('[name=fee]', '7');
    await page.fill('[name=miles]', '3');
    await page.fill('.picker-input', 'Local Kitchen');
    await page.click('[data-new]');
    const placeId = (await read('sp.order')).placeId;
    await page.click('#start-from-order');
    const start = (await read('sp.active')).start;
    await screenshot('platform-selector-order.png');
    await page.click('#take');
    const accepted = await read('sp.order');
    assert.equal(accepted.platformId, 'just-eat');
    assert.equal(accepted.platformName, 'Just Eat');

    // Selection is shared between tabs but cannot relabel an accepted delivery.
    await choose('deliveroo');
    assert.equal((await read('sp.order')).platformId, 'just-eat');
    assert.ok((await page.textContent('.order-platform-context')).includes('Just Eat'));
    await go('#home');
    assert.equal(await page.locator('[data-platform]').count(), 0, 'no top selector on Shift');
    assert.equal(await read('sp.platform'), 'deliveroo');
    assert.equal((await read('sp.active')).start, start);
    assert.ok((await summary()).includes('0 completed deliveries'));
    await go('#order');
    await page.click('#back');
    await page.click('#take');
    assert.equal((await read('sp.order')).platformId, 'just-eat', 'back to offer also preserves accepted platform');
    await page.click('#arrived');
    await page.click('#got');
    assert.equal((await read('sp.places'))[0].waits[0].platformId, 'just-eat');
    await choose('all');
    await page.reload();
    await page.click('#delivered');
    await page.waitForSelector('[data-platform-summary]');
    const completed = (await read('sp.deliveries'))[0];
    assert.equal(completed.platformId, 'just-eat');
    assert.equal((await read('sp.active')).start, start);
    assert.ok((await summary()).includes('£7.00'));
    await go('#history');
    await choose('deliveroo');
    assert.equal(await page.locator('.delivery-record').count(), 0);
    await choose('just-eat');
    assert.equal(await page.locator('.delivery-record').count(), 1);

    // Platform visits filter Places; the same restaurant notebook is shared.
    await go('#places');
    assert.ok((await page.textContent('.place-row')).includes('Local Kitchen'));
    await page.click('.place-row');
    await page.fill('textarea[name=note]', 'Use the bays behind the restaurant');
    await page.locator('textarea[name=note]').blur();
    await choose('deliveroo');
    assert.equal(await page.inputValue('textarea[name=note]'), 'Use the bays behind the restaurant');
    await go('#places');
    assert.equal(await page.locator('.place-row').count(), 0);
    await choose('all');
    assert.equal(await page.locator('.place-row').count(), 1);

    // Explicit corrections move both delivery and recorded collection associations.
    await go('#history');
    await page.click('.delivery-record summary');
    await page.selectOption('[data-delivery-platform]', 'deliveroo');
    assert.equal((await read('sp.deliveries'))[0].platformId, 'deliveroo');
    assert.equal((await read('sp.places'))[0].waits[0].platformId, 'deliveroo');
    await choose('just-eat');
    await go('#places');
    assert.equal(await page.locator('.place-row').count(), 0);
    await choose('deliveroo');
    assert.equal(await page.locator('.place-row').count(), 1);

    // Legacy fees count under All, remain unassigned, and are not guessed from the view.
    await page.evaluate(({ completed, placeId }) => {
      localStorage['sp.deliveries'] = JSON.stringify([
        { ...completed, id: 'je', platformId: 'just-eat', platformName: 'Just Eat', fee: '7' },
        { ...completed, id: 'roo', platformId: 'deliveroo', platformName: 'Deliveroo', fee: '6.25', placeId },
        { ...completed, id: 'legacy', platformId: null, platformName: null, fee: '3' },
        { ...completed, id: 'yesterday', platformId: 'just-eat', platformName: 'Just Eat', fee: '90', completedAt: new Date(Date.now() - 86400000).toISOString() }
      ]);
    }, { completed, placeId });
    await go('#history');
    await choose('all');
    assert.ok((await summary()).includes('£16.25'));
    assert.ok((await summary()).includes('Platform not recorded'));
    await choose('just-eat');
    assert.ok((await summary()).includes('£7.00'));
    assert.equal(await page.locator('.delivery-record').count(), 2, 'history includes earlier dates');
    await choose('all');
    await screenshot('platform-selector-history.png');
    await page.emulateMedia({ colorScheme: 'dark' });
    await screenshot('platform-selector-history-dark.png');
    await page.emulateMedia({ colorScheme: 'light' });

    // A shared form remains intact when the global view is switched.
    await go('#settings');
    await page.fill('[name=platformName]', 'Draft provider');
    await choose('deliveroo');
    assert.equal(await page.inputValue('[name=platformName]'), 'Draft provider');

    // New providers are created explicitly in Settings, with stable IDs and duplicates rejected.
    await go('#settings');
    await page.fill('[name=platformName]', 'All');
    await page.click('#platform-form button');
    assert.ok(await page.isVisible('#platform-error'));
    await page.fill('[name=platformName]', ' just EAT ');
    await page.click('#platform-form button');
    assert.equal((await page.locator('[data-platform]').count()), 3);
    await page.fill('[name=platformName]', ' Uber Eats ');
    await page.click('#platform-form button');
    await page.waitForSelector('[data-platform^="p-"]');
    const custom = (await read('sp.platforms')).find((p) => p.name === 'Uber Eats');
    assert.ok(custom.id);
    await choose(custom.id);
    await page.reload();
    assert.equal(await page.getAttribute(`[data-platform="${custom.id}"]`, 'aria-pressed'), 'true');
    await go('#order');
    await page.click('#take');
    assert.equal((await read('sp.order')).platformId, custom.id);

    // Backup current selection, definitions, active-order identity and historical identities together.
    await go('#settings');
    const download = page.waitForEvent('download');
    await page.click('#backup');
    const backup = JSON.parse(fs.readFileSync(await (await download).path(), 'utf8'));
    assert.equal(backup.version, 3);
    assert.equal(backup.selectedPlatform, custom.id);
    assert.ok(backup.platforms.some((p) => p.id === custom.id));
    await page.evaluate(() => { localStorage.removeItem('sp.platforms'); localStorage['sp.platform'] = JSON.stringify('all'); });
    await page.setInputFiles('#file', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await page.waitForSelector(`[data-platform="${custom.id}"]`);
    assert.equal(await read('sp.platform'), custom.id);
    assert.equal((await read('sp.order')).platformId, custom.id);
    assert.equal((await read('sp.deliveries')).find((d) => d.id === 'legacy').platformId, null);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.reload();
    assert.equal(await page.getAttribute(`[data-platform="${custom.id}"]`, 'aria-pressed'), 'true');
    await context.setOffline(false);

    // Version-two imports without provider metadata retain records and default to Just Eat.
    const old = { ...backup, version: 2 };
    delete old.platforms;
    delete old.selectedPlatform;
    await page.setInputFiles('#file', { name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) });
    await page.waitForFunction(() => JSON.parse(localStorage['sp.platform']) === 'just-eat');
    assert.equal((await read('sp.platforms')).length, 2);
    assert.equal((await read('sp.order')).platformName, 'Uber Eats', 'recorded identity survives missing provider definitions');
    // Old active shifts without IDs must not absorb every unlinked historical delivery.
    await page.evaluate(() => {
      localStorage['sp.active'] = JSON.stringify({ start: new Date().toISOString(), startOdo: '' });
      localStorage['sp.deliveries'] = JSON.stringify([{ id: 'unlinked', fee: '99', collectedAt: new Date().toISOString(), completedAt: new Date().toISOString() }]);
    });
    await go('#home');
    assert.ok((await summary()).includes('1 completed delivery'), 'daily fee overview includes unlinked work today');
    assert.ok(!(await page.locator('.chart-total').innerText()).includes('99'), 'unlinked delivery cannot inflate live shift profit');
    assert.deepEqual(errors, []);
    console.log('Platform integration passed: default/order, locked identities, shared tabs, daily totals, legacy data, Places, corrections, forms, custom providers, backups and offline reload.');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
