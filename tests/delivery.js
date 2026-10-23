// End-to-end recording, reload/offline recovery, backups and old-data compatibility.
const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mockPhoton } = require('./photon-mock');
const URL = 'http://localhost:8765/';

(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ ...devices['Pixel 7'], acceptDownloads: true, timezoneId: 'Europe/London' });
    await mockPhoton(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let acceptDialog = true;
    page.on('dialog', (d) => acceptDialog ? d.accept() : d.dismiss());
    const read = (key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), key);
    const route = async (hash) => { await page.goto(URL + hash); await page.waitForURL(URL + hash); };
    await page.goto(URL);
    await page.click('#start');
    const active = await read('sp.active');
    assert.ok(active.id);
    await route('#order');
    await page.click('[data-platform="just-eat"]');
    await page.fill('[name=fee]', '7');
    await page.fill('[name=miles]', '3');
    await page.fill('.picker-input', 'Local Kitchen');
    await page.click('[data-new]');
    await page.click('#take');
    assert.equal((await read('sp.order')).shiftId, active.id);
    await page.click('#arrived');
    const arrived = new Date(Date.now() - 7 * 60000).toISOString();
    await page.evaluate((at) => { const o = JSON.parse(localStorage['sp.order']); o.arrivedAt = at; o.acceptedAt = new Date(new Date(at) - 5 * 60000).toISOString(); localStorage['sp.order'] = JSON.stringify(o); }, arrived);
    await page.reload();
    await page.click('#got');
    const collected = await read('sp.order');
    assert.equal(collected.step, 'deliver');
    assert.equal(collected.fee, '7');
    assert.equal(collected.miles, '3');
    assert.ok(collected.acceptedAt && collected.arrivedAt && collected.collectedAt);
    assert.equal((await read('sp.places'))[0].waits.length, 1);
    assert.ok((await read('sp.places'))[0].waits[0].mins >= 7);
    await page.evaluate(() => { const o = JSON.parse(localStorage['sp.order']); for (const key of ['acceptedAt', 'arrivedAt', 'collectedAt']) o[key] = new Date(new Date(o[key]) - 18 * 60000).toISOString(); localStorage['sp.order'] = JSON.stringify(o); });
    await page.reload();
    assert.equal(await page.textContent('#delivery-timer'), '0h 18m');
    await route('#places');
    await route('#order');
    assert.ok(await page.isVisible('#delivered'));
    assert.equal((await read('sp.places'))[0].waits.length, 1, 'reload does not duplicate wait');

    // A full backup includes the active delivery; restore replaces stale current-order state.
    await route('#settings');
    const backupDownload = page.waitForEvent('download');
    await page.click('#backup');
    const backup = JSON.parse(fs.readFileSync(await (await backupDownload).path(), 'utf8'));
    assert.equal(backup.version, 3);
    assert.equal(backup.order.step, 'deliver');
    const restore = async (data) => {
      await route('#settings');
      await page.setInputFiles('#file', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
      await page.waitForFunction((step) => JSON.parse(localStorage['sp.order']).step === step, data.order?.step || 'offer');
    };
    await page.evaluate(() => localStorage['sp.order'] = JSON.stringify({ step: 'offer' }));
    await restore(backup);
    await route('#order');
    assert.equal((await read('sp.order')).id, collected.id);

    // Offline reload and completion retain timestamps, and do not end the shift.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.reload();
    assert.ok(await page.isVisible('#delivered'));
    if (process.env.SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'delivered-stage-light.png'), fullPage: true, scale: 'css' });
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'delivered-stage-dark.png'), fullPage: true, scale: 'css' });
      await page.emulateMedia({ colorScheme: 'light' });
    }
    // A failed storage write leaves the order available for retry.
    await page.evaluate(() => {
      window.originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { if (key === 'sp.deliveries') throw new Error('Storage full'); return window.originalSetItem.call(this, key, value); };
    });
    await page.click('#delivered');
    assert.ok(await page.isVisible('#delivery-error'));
    assert.equal((await read('sp.order')).step, 'deliver');
    await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
    // Two clicks arriving together must save only one delivery.
    await page.evaluate(() => { const button = document.querySelector('#delivered'); button.click(); button.click(); });
    await page.waitForSelector('#take');
    await context.setOffline(false);
    let deliveries = await read('sp.deliveries');
    assert.equal(deliveries.length, 1);
    const completed = deliveries[0];
    assert.equal(completed.id, collected.id);
    assert.equal(completed.restaurantName, 'Local Kitchen');
    assert.equal(completed.shiftId, active.id);
    assert.equal(completed.fee, '7');
    assert.ok(new Date(completed.completedAt) > new Date(completed.collectedAt));
    assert.equal((await read('sp.active')).id, active.id);
    assert.equal((await read('sp.order')).fee, '');
    await route('#history');
    await page.click('.delivery-record summary');
    assert.ok((await page.textContent('.delivery-record')).includes('Collection to completion'));
    assert.ok((await page.textContent('.delivery-record')).includes('0h 18m'));
    if (process.env.SCREENSHOT_DIR) {
      await page.waitForSelector('#toast', { state: 'hidden' });
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'delivery-history.png'), fullPage: true, scale: 'css' });
    }

    // Shift totals still use the final reconciled earnings, with no fee double-counting.
    await route('#end');
    await page.fill('[name=earnings]', '70');
    await page.fill('[name=miles]', '30');
    await page.fill('[name=start]', '2026-10-23T17:00');
    await page.fill('[name=end]', '2026-10-23T21:00');
    await page.click('#f button[type=submit]');
    await page.waitForURL('**/#shift/*');
    assert.equal((await read('sp.shifts'))[0].id, active.id);
    assert.equal((await read('sp.shifts'))[0].earnings, 70);
    await page.waitForSelector('.delivery-record');

    // Completed records round-trip, including their own restaurant name.
    await route('#settings');
    const completedDownload = page.waitForEvent('download');
    await page.click('#backup');
    const completedBackup = JSON.parse(fs.readFileSync(await (await completedDownload).path(), 'utf8'));
    assert.equal(completedBackup.deliveries.length, 1);
    await page.evaluate(() => { localStorage['sp.deliveries'] = '[]'; localStorage['sp.order'] = JSON.stringify({ step: 'pickup' }); });
    await restore(completedBackup);
    assert.deepEqual(await read('sp.deliveries'), completedBackup.deliveries);
    await page.evaluate(() => localStorage['sp.places'] = '[]');
    await route('#history');
    assert.ok((await page.textContent('.delivery-record summary')).includes('Local Kitchen'));

    // Version-one backups have no order/deliveries: keep supporting them and clear stale state.
    const oldBackup = { ...completedBackup, version: 1 };
    delete oldBackup.order;
    delete oldBackup.deliveries;
    delete oldBackup.platforms;
    delete oldBackup.selectedPlatform;
    await restore(oldBackup);
    assert.deepEqual(await read('sp.deliveries'), []);
    assert.equal((await read('sp.order')).step, 'offer');

    // Existing in-flight orders from the previous release can finish without inventing acceptance times.
    await page.evaluate(() => localStorage['sp.order'] = JSON.stringify({ step: 'waiting', fee: '', miles: '', arrivedAt: new Date().toISOString() }));
    await route('#order');
    await page.click('#got');
    acceptDialog = false;
    await page.click('#cancel-delivery');
    assert.ok(await page.isVisible('#delivered'));
    acceptDialog = true;
    await page.click('#cancel-delivery');
    assert.equal((await read('sp.order')).step, 'offer');
    assert.deepEqual(await read('sp.deliveries'), []);
    await page.click('[data-platform="just-eat"]');
    await page.click('#take');
    await page.click('#arrived');
    await page.click('#got');
    await page.click('#delivered');
    assert.equal((await read('sp.deliveries')).length, 1, 'orders with optional fields blank still complete');
    assert.deepEqual(errors, []);
    console.log('Delivery workflow, reload, offline, backups, legacy records, cancellation and shift reconciliation passed.');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
