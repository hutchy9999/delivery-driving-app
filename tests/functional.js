const { chooseProvider } = require('./provider-helper');
const { chromium, devices } = require('playwright');
const fs = require('fs');
const { mockPhoton } = require('./photon-mock');
const URL = 'http://localhost:8765/';
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL:', msg); } };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], acceptDownloads: true, permissions: ['geolocation'], geolocation: { latitude: 51.5072, longitude: -0.1276, accuracy: 12 } });
  let searchDown = false; const searches = [];
  await mockPhoton(ctx, { fail: () => searchDown, log: searches });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  let dialogAnswer = true, lastDialog = '';
  p.on('dialog', d => { lastDialog = d.message(); dialogAnswer ? d.accept() : d.dismiss(); });
  const toast = async () => { await p.waitForTimeout(80); return (await p.isVisible('#toast')) ? p.textContent('#toast') : ''; };
  const tap = async (s) => { if (s === '#cancel' && !(await p.isVisible(s))) await p.click('.shift-options summary'); await p.click(s); await p.waitForTimeout(60); };
  const fillMinutes = async (value) => { if (!(await p.isVisible('[name=mins]'))) await p.click('.offer-extra summary'); await p.fill('[name=mins]', value); };
  const hash = () => p.evaluate(() => location.hash);
  const ls = (k) => p.evaluate(k => JSON.parse(localStorage[k] || 'null'), k);

  await p.goto(URL);
  // 0. chart shows from the start, empty
  ok(await p.isVisible('#chart'), 'compact chart placeholder visible with no data');
  ok(await p.getAttribute('[data-chart-range="today"]', 'aria-pressed') === 'true', 'Today is default');
  await tap('[data-chart-range="fortnight"]');
  ok((await p.textContent('#chart')).includes('No shifts in the last 2 weeks'), 'empty chart message');
  ok(await p.locator('#chart svg').count() === 0, 'no empty axes before recording work');
  ok(await p.locator('#chart-previous').count() === 0, 'no disabled point controls in empty state');
  ok(await p.locator('#chart .dot').count() === 0, 'no points when empty');
  // 1. first-run banner
  ok(await p.isVisible('.notice'), 'first-run banner visible');
  await tap('.notice'); ok(await hash() === '#settings', 'banner opens settings');

  // 2. settings
  ok((await p.textContent('#derived')).includes('£0.14'), 'default fuel/mile shown (1.40, 45mpg = £0.14?) ' + await p.textContent('#derived'));
  await p.fill('[name=fuelPrice]', '1.70'); await p.fill('[name=mpg]', '32');
  ok((await p.textContent('#derived')).includes('£0.24'), 'derived fuel/mile updates live');
  ok(await p.inputValue('[name=insurancePerHour]') === '1.16', 'insurance defaults to £1.16/hr');
  ok(!(await p.$('[name=taxPct]')) && !/tax/i.test(await p.textContent('main')), 'no tax in settings');
  ok(!(await p.$('[name=hoursPerWeek]')) && !(await p.$('[name=otherMonthly]')), 'hours/week and monthly boxes removed');
  await p.fill('[name=insurancePerHour]', '1.16');
  await p.fill('[name=maintPence]', '-5');
  await tap('[data-tab=home]');  // leave without pressing save
  const st = await ls('sp.settings');
  ok(st && st.fuelPrice === 1.7 && st.mpg === 32 && st.insurancePerHour === 1.16 && !('hoursPerWeek' in st), 'settings auto-saved on leaving: ' + JSON.stringify(st));
  ok(st.maintPence === 0, 'negative maintenance clamped to 0');
  ok(!(await p.isVisible('.notice')), 'banner gone after settings saved');
  await tap('#gear');
  ok(await p.inputValue('[name=mpg]') === '32', 'settings shown after reopening');
  await p.fill('[name=maintPence]', '5');
  await p.fill('[name=mpg]', '0'); await tap('#sf button[type=submit]');
  ok((await toast()).includes('MPG'), 'MPG 0 rejected');
  ok((await ls('sp.settings')).mpg === 32, 'MPG 0 not saved');
  await p.fill('[name=mpg]', '32'); await tap('#sf button[type=submit]');
  ok((await toast()) === 'Settings saved', 'save button toast');
  ok((await ls('sp.settings')).maintPence === 5, 'maintenance saved');

  // 3. tabs
  for (const t of ['order', 'places', 'history', 'home']) {
    await tap(`[data-tab=${t}]`);
    ok(await p.getAttribute(`[data-tab=${t}]`, 'aria-current') === 'page', `tab ${t} marked current`);
  }
  ok(!(await p.$('[data-tab=settings]')), 'settings is no longer a tab');
  await tap('#gear');
  ok(await hash() === '#settings' && await p.$eval('#gear', (g) => g.classList.contains('active')), 'gear opens settings');
  await tap('[data-tab=home]');

  // 4. start, cancel (dismiss + accept)
  await p.fill('#odo', '48210'); await tap('#start');
  ok(await p.isVisible('#end'), 'active shift shown');
  ok((await p.textContent('.active-shift')).includes('48210'), 'start odometer shown');
  dialogAnswer = false; await tap('#cancel');
  ok(await p.isVisible('#end'), 'cancel dismissed keeps shift');
  dialogAnswer = true; await tap('#cancel');
  ok(await p.isVisible('#start') && !(await ls('sp.active')), 'cancel accepted clears shift');

  // 5. start, survive reload, end with validation
  await p.fill('#odo', '48210'); await tap('#start');
  await p.evaluate(() => { const a = JSON.parse(localStorage['sp.active']); a.start = new Date(Date.now() - 5 * 3600e3).toISOString(); localStorage['sp.active'] = JSON.stringify(a); });
  await p.reload();
  ok((await p.textContent('#clock')).startsWith('5h'), 'clock shows elapsed after reload');
  await tap('#end'); ok(await hash() === '#end', 'end opens form');
  ok(await p.evaluate(() => document.activeElement.name) === 'earnings', 'earnings box focused');
  ok(await p.inputValue('[name=startOdo]') === '48210', 'start odo carried over');
  const submit = async () => { await tap('#f button[type=submit]'); await p.waitForTimeout(60); return (await p.isVisible('#err')) ? p.textContent('#err') : ''; };
  ok((await submit()).includes('earnings'), 'empty earnings error');
  await p.fill('[name=earnings]', '75');
  ok((await p.textContent('#preview')).includes('/hr'), 'live preview appears');
  ok((await submit()).includes('miles'), 'missing miles error');
  await p.fill('[name=endOdo]', '48200');
  ok(await p.inputValue('[name=miles]') === '', 'miles not filled when end < start');
  await p.fill('[name=miles]', '5');
  ok((await submit()).includes('lower'), 'end odo < start odo error');
  await p.fill('[name=endOdo]', '48240');
  ok(await p.inputValue('[name=miles]') === '30', 'miles auto-filled from odometer');
  const startVal = await p.inputValue('[name=start]');
  await p.fill('[name=end]', startVal);
  ok((await submit()).includes('after'), 'end before start error');
  await p.fill('[name=end]', await p.evaluate(() => { const d = new Date(); const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; }));
  await p.fill('[name=note]', 'test <b>note</b>');
  await submit();
  ok((await hash()).startsWith('#shift/'), 'saved -> detail');
  ok(!(await ls('sp.active')), 'active shift cleared');
  const detail = await p.textContent('main');
  ok(detail.includes('£7.25') && detail.includes('test <b>note</b>'), 'detail shows fuel £7.25 and escaped note');
  ok(detail.includes('Insurance (£1.16/hr)') && detail.includes('−£5.80'), '5h shift charges £5.80 insurance');
  ok(!/tax|take-home/i.test(detail), 'no tax on shift breakdown');

  // 6. Android back from detail should not reopen the end form
  await p.goBack(); ok(!['#end'].includes(await hash()), 'back after save does not return to form: ' + await hash());
  await p.goForward();

  // 7. edit
  const id = (await hash()).split('/')[1];
  await tap('#edit'); ok(await hash() === '#edit/' + id, 'edit opens');
  await p.fill('[name=earnings]', '80'); await submit();
  ok((await ls('sp.shifts')).length === 1 && (await ls('sp.shifts'))[0].earnings === 80, 'edit updates, no duplicate');
  // settings snapshot preserved on edit even if settings change
  await p.evaluate(() => { const s = JSON.parse(localStorage['sp.settings']); s.fuelPrice = 9; localStorage['sp.settings'] = JSON.stringify(s); });
  await tap('#edit'); await p.fill('[name=earnings]', '81'); await submit();
  ok((await ls('sp.shifts'))[0].settings.fuelPrice === 1.7, 'old shift keeps its fuel price');
  await p.evaluate(() => { const s = JSON.parse(localStorage['sp.settings']); s.fuelPrice = 1.7; localStorage['sp.settings'] = JSON.stringify(s); });

  // 8. done -> home summaries
  await tap('#done'); ok(await hash() === '#home', 'done goes home');
  ok((await p.textContent('main')).includes('Today') && !(await p.textContent('main')).includes('No shifts yet'), 'today summary populated');
  ok((await p.getAttribute('#odo', 'placeholder')) === 'Last: 48240', 'last odometer hint');
  ok(await p.evaluate(() => scrollY) === 0, 'new screen opens at the top');
  ok(await p.locator('#chart .dot').count() === 1, 'chart plots today');
  const stats = (await p.textContent('#chart .row3')).replace(/\s+/g, ' ');
  ok(stats.includes('£66.45') && stats.includes('days worked') && stats.includes('5h 00m'), 'chart summary: ' + stats);
  const cb = await p.locator('#chart svg').boundingBox();
  await p.mouse.click(cb.x + cb.width - 4, cb.y + cb.height / 2);
  ok((await p.textContent('#chart-info')).includes('£66.45') && (await p.textContent('#chart-info')).includes('profit'), 'tapping today shows its profit: ' + await p.textContent('#chart-info'));
  await p.mouse.click(cb.x + cb.width * 0.2, cb.y + cb.height / 2);
  ok((await p.textContent('#chart-info')).includes('No shift'), 'tapping an empty day says no shift');

  // 9. add a past shift (miles typed, no odometer), different week
  await tap('a.btn.link[href="#add"]'); ok(await hash() === '#add', 'add link from home');
  await p.fill('[name=earnings]', '40'); await p.fill('[name=miles]', '12.5');
  await p.fill('[name=start]', '2026-10-01T18:00'); await p.fill('[name=end]', '2026-10-01T21:00');
  await submit(); ok((await hash()).startsWith('#shift/'), 'past shift saved');
  await tap('[data-tab=history]');
  await chooseProvider(p, 'all');
  ok((await p.$$('.week')).length === 2, 'two week groups');
  ok((await p.$$('.shift-row')).length === 2, 'two shift rows');
  const firstDate = await p.textContent('.shift-row b');
  ok(!firstDate.includes('Thu 1 Oct'), 'newest first');
  await tap('.shift-row >> nth=1'); ok((await hash()).startsWith('#shift/'), 'row opens detail');
  // 10. delete
  dialogAnswer = false; await tap('#del'); ok((await ls('sp.shifts')).length === 2, 'delete dismissed keeps');
  dialogAnswer = true; await tap('#del');
  ok((await ls('sp.shifts')).length === 1 && await hash() === '#history', 'delete removes, back to history');
  await tap('text=+ Add a past shift'); ok(await hash() === '#add', 'history add button');

  // 11. exports
  await tap('#gear');
  const [csv] = await Promise.all([p.waitForEvent('download'), tap('#csv')]);
  const csvText = fs.readFileSync(await csv.path(), 'utf8');
  ok(csv.suggestedFilename().endsWith('.csv') && csvText.split('\n').length === 2 && csvText.includes('"81.00"'), 'CSV export');
  const [bk] = await Promise.all([p.waitForEvent('download'), tap('#backup')]);
  const backup = JSON.parse(fs.readFileSync(await bk.path(), 'utf8'));
  ok(backup.app === 'shift-profit' && backup.shifts.length === 1 && Array.isArray(backup.places), 'backup export includes places');

  // 12. restore: bad entries filtered, missing settings filled; same file twice
  backup.places.push({ id: 'pl1', name: 'Test Diner', waits: [{ at: '2026-10-01T12:00:00Z', mins: 5 }] }, { name: 'no id' }, null);
  backup.shifts.push({ id: 'x2', start: '2026-09-01T10:00:00Z', end: '2026-09-01T12:00:00Z', miles: 10, earnings: 20 }, { junk: true }, null);
  const f1 = require('os').tmpdir() + '/restore.json'; fs.writeFileSync(f1, JSON.stringify(backup));
  const restore = async (file) => { const [fc] = await Promise.all([p.waitForEvent('filechooser'), tap('#restore')]); await fc.setFiles(file); await p.waitForTimeout(150); };
  await restore(f1);
  ok(lastDialog.includes('Restore 2 shifts'), 'restore counts only valid shifts: ' + lastDialog);
  const restoredPlaces = await ls('sp.places');
  ok((await ls('sp.shifts')).length === 2 && restoredPlaces.length === 1 && restoredPlaces[0].parkType === '' && restoredPlaces[0].spot === null, 'restored 2 shifts and 1 valid place');
  ok(lastDialog.includes('2 shifts and 1 place from'), 'restore dialog counts places');
  await p.evaluate(() => localStorage['sp.shifts'] = '[]');
  lastDialog = ''; await restore(f1);
  ok(lastDialog.includes('Restore 2'), 'same file can be chosen twice');
  await tap('[data-tab=history]');
  ok((await p.$$('.shift-row')).length === 2, 'history renders restored shift without settings');
  const f2 = require('os').tmpdir() + '/bad.json'; fs.writeFileSync(f2, '{"hello":1}');
  await tap('#gear'); await restore(f2);
  ok((await toast()).includes("doesn't look like"), 'bad file rejected');
  await p.evaluate(() => localStorage.removeItem('sp.places'));

  // 12b. order calculator (settings: £1.70/L, 32 MPG, 5p/mile, £1.16/hr, target £15, 15 mph, 8 min)
  await tap('[data-tab=order]');
  await chooseProvider(p, 'just-eat');
  ok(await hash() === '#order', 'order tab opens');
  ok(await p.evaluate(() => document.activeElement.name) === 'fee', 'fee box focused');
  ok((await p.textContent('#order-result')).includes('Type the fee'), 'order prompt when empty');
  await p.fill('[name=fee]', '4');
  ok((await p.textContent('#order-result')).includes('Type the fee'), 'needs miles too');
  await p.fill('[name=miles]', '1.5');
  let res = await p.textContent('#order-result');
  ok(res.includes('£14.11/hr') && res.includes('Worth taking') && res.includes('14 min') && res.includes('estimated') && (await p.textContent('#offer-calculation')).includes('from £12.00/hr, borderline from £10.00/hr'), 'order £4 / 1.5mi: ' + res.replace(/\s+/g, ' '));
  await fillMinutes('10');
  res = await p.textContent('#order-result');
  ok(res.includes('Worth taking') && res.includes('from offer') && !res.includes('Time estimated'), 'minutes from offer used: ' + res.replace(/\s+/g, ' '));
  await p.fill('[name=mins]', ''); await p.fill('[name=fee]', '5'); await p.fill('[name=miles]', '3');
  res = await p.textContent('#order-result');
  ok(res.includes('£11.22/hr') && res.includes('Borderline'), '£11.22/hr is borderline (£10–£11.99)');
  await p.fill('[name=fee]', '4.50'); await p.fill('[name=miles]', '3');
  res = await p.textContent('#order-result');
  ok(res.includes('£9.72/hr') && res.includes('Not worth it'), 'under £10/hr is not worth it: ' + res.replace(/\s+/g, ' '));
  await p.fill('[name=fee]', '5'); await p.fill('[name=miles]', '7');
  ok((await p.textContent('#order-result')).includes('Not worth it'), 'long cheap order is poor');
  await tap('[data-tab=home]'); await tap('[data-tab=order]');
  ok(await p.inputValue('[name=fee]') === '5' && await p.inputValue('[name=miles]') === '7', 'order numbers kept when switching tabs');
  await tap('#clear');
  ok(await p.inputValue('[name=fee]') === '' && await p.inputValue('[name=miles]') === '' && (await p.textContent('#order-result')).includes('Type the fee'), 'clear empties the calculator');
  ok(await p.evaluate(() => document.activeElement.name) === 'fee', 'clear refocuses fee');
  ok(!(await p.textContent('main')).toLowerCase().includes('cheat'), 'no cheat sheet');
  await tap('#gear');
  await p.fill('[name=goodPerHour]', '20'); await p.fill('[name=okPerHour]', '15'); await p.fill('[name=stopMins]', '5');
  await tap('[data-tab=order]');
  await p.fill('[name=fee]', '4'); await p.fill('[name=miles]', '1.5');
  res = await p.textContent('#order-result');
  ok(res.includes('£18.27/hr') && res.includes('Borderline') && res.includes('11 min') && (await p.textContent('#offer-calculation')).includes('from £20.00/hr, borderline from £15.00/hr'), 'order settings take effect: ' + res.replace(/\s+/g, ' '));
  await tap('#gear');
  await p.fill('[name=goodPerHour]', '12'); await p.fill('[name=okPerHour]', '10'); await p.fill('[name=stopMins]', '8');
  await tap('[data-tab=home]');

  // 12c. places + order flow (settings: £1.70/L, 32 MPG, 5p/mile, £1.16/hr, 15 mph, 8 min stops, 3 min handover)
  await tap('[data-tab=places]');
  ok((await p.textContent('main')).includes('No collections recorded'), 'platform places empty state');
  await tap('[data-tab=order]');
  ok((await p.textContent('.steps')).replace(/\s+/g, ' ').includes('1 Offer'), 'offer step shown');
  await p.fill('[name=fee]', '5'); await p.fill('[name=miles]', '2');
  await p.fill('.picker-input', "Nando's");
  await p.waitForTimeout(500);
  ok((await p.textContent('.sugg')).includes('Not listed? Add "Nando\'s"'), 'offers to add a place that is not listed');
  await tap('.sugg [data-new]');
  ok((await p.textContent('.picked')).includes("Nando's") && (await p.textContent('.picked')).includes('No waits timed yet'), 'new place picked');
  res = await p.textContent('#order-result');
  ok((await p.textContent('#offer-calculation')).includes('8 min stops') && res.includes('16 min'), 'unknown restaurant uses general stop time: ' + res.replace(/\s+/g, ' '));
  await tap('#take');
  ok((await p.textContent('.steps')).includes('✓ Offer') && (await p.textContent('.steps')).includes('2 Pickup'), 'pickup step');
  ok((await p.textContent('main')).includes('First visit') && (await p.textContent('main')).includes('No parking spot saved'), 'first visit prompt');
  await tap('#spot'); await p.waitForTimeout(300);
  ok((await toast()).includes('Parking spot saved'), 'parking spot saved toast');
  const href = await p.getAttribute('#directions', 'href');
  ok(href && href.includes('51.5072,-0.1276') && href.includes('google.com/maps/dir'), 'directions to saved spot: ' + href);
  await tap('#arrived');
  ok((await p.textContent('.steps')).includes('3 Waiting') && /^\d\d:\d\d$/.test(await p.textContent('#wait-timer')), 'waiting step with timer');
  await tap('[data-k=parkType][data-v=street]'); await tap('[data-k=parkLimit][data-v="60"]'); await tap('[data-k=ease][data-v=easy]');
  await p.fill('textarea[name=note]', 'Bays on Mill St'); await p.locator('textarea[name=note]').blur();
  let place = (await ls('sp.places'))[0];
  ok(place.parkType === 'street' && place.parkLimit === '60' && place.ease === 'easy' && place.note === 'Bays on Mill St', 'parking details saved on tap: ' + JSON.stringify(place));
  await tap('[data-k=ease][data-v=easy]');
  ok((await ls('sp.places'))[0].ease === '', 'tapping a chosen chip again clears it');
  await tap('[data-k=ease][data-v=easy]');
  await p.evaluate(() => { const o = JSON.parse(localStorage['sp.order']); o.arrivedAt = new Date(Date.now() - 7 * 60000).toISOString(); localStorage['sp.order'] = JSON.stringify(o); });
  await p.reload(); await p.waitForTimeout(100);
  ok((await p.textContent('#wait-timer')).startsWith('07:'), 'timer survives the app closing');
  await tap('#got');
  ok((await toast()).includes("Saved: 7 min wait at Nando's"), 'wait saved toast');
   ok(await p.isVisible('#delivered') && (await ls('sp.order')).fee === '5', 'food collected advances to delivery and keeps fee');
   await tap('#delivered');
   ok((await p.textContent('.steps')).includes('1 Offer') && await p.inputValue('[name=fee]') === '', 'delivered returns to an empty offer');
  ok((await ls('sp.places'))[0].waits.length === 1, 'one wait recorded');
  // Second order from the same place: uses its own wait
  await p.fill('[name=fee]', '5'); await p.fill('[name=miles]', '2'); await p.fill('.picker-input', 'nan');
  ok((await p.textContent('.sugg')).includes('1 visit · avg wait 7 min') && (await p.textContent('.sugg')).includes('Easy'), 'known place suggested with wait and tag');
  await tap('.sugg [data-id]');
  res = await p.textContent('#order-result');
  ok((await p.textContent('#offer-calculation')).includes("7 min avg wait at Nando's + 3 min parking & handover") && res.includes('18 min'), 'known restaurant uses its own wait: ' + res.replace(/\s+/g, ' '));
  await tap('#take');
  const pick = await p.textContent('main');
  ok(pick.includes('Free street bay') && pick.includes('1 hr max') && pick.includes('Bays on Mill St') && await p.isVisible('#directions'), 'known place shows parking info');
  await tap('#back');
  ok(await p.inputValue('[name=fee]') === '5' && (await p.textContent('.picked')).includes("Nando's"), 'back to offer keeps values');
  await tap('#take'); await tap('#arrived');
  dialogAnswer = true; await tap('#cancel-order');
  ok((await ls('sp.places'))[0].waits.length === 1 && (await p.textContent('.steps')).includes('1 Offer'), 'cancel order does not save a wait');
  // Pickup without choosing a restaurant first
  await tap('#take');
  ok(await p.isVisible('.picker-input'), 'pickup asks which restaurant if none chosen');
  await tap('#arrived');
  ok(await p.isVisible('.picker-input'), 'waiting asks which restaurant if none chosen');
  await tap('#got');
   ok(await p.isVisible('#delivered'), 'got food without a place starts delivery');
   await tap('#delivered');
   ok((await toast()).includes('Ready for the next order'), 'delivered without a place');
  // Restaurant search (OpenStreetMap via Photon, mocked)
  await p.fill('[name=fee]', '6'); await p.fill('[name=miles]', '2');
  await p.fill('.picker-input', 'nand');
  ok((await p.textContent('.sugg')).includes('Searching'), 'shows searching while waiting');
  await p.waitForTimeout(600);
  let sugg = await p.textContent('.sugg');
  ok(sugg.includes('Near Manchester') && sugg.includes('61 Piccadilly, Northern Quarter, M1 2AQ') && sugg.includes('Great Ancoats Street, Ancoats, M4 5AB'), 'search shows address, area and postcode: ' + sugg.replace(/\s+/g, ' '));
  ok(!sugg.includes('Nandos Close') && !sugg.includes('W1D'), 'streets and far-away branches filtered out');
  const last = searches[searches.length - 1];
  ok(last.searchParams.get('lat') === '53.4808' && last.searchParams.get('bbox') && !last.toString().includes('51.50'), 'search uses work area, not live location: ' + last);
  ok(sugg.includes('© OpenStreetMap contributors'), 'OpenStreetMap credited');
  await tap('.sugg [data-remote="1"]');
  let picked = await p.textContent('.picked');
  ok(picked.includes("Nando's") && picked.includes('Ancoats'), 'picked the Ancoats branch: ' + picked);
  const anc = (await ls('sp.places')).find((x) => x.osm === 'N102');
  ok(anc && anc.address === 'Great Ancoats Street, Ancoats, M4 5AB' && anc.loc.lat === 53.4832, 'search result saved as a place with address and location');
  await tap('#change-place'); await p.fill('.picker-input', 'nand'); await p.waitForTimeout(600);
  sugg = await p.textContent('.sugg');
  ok(sugg.includes('Your places') && (sugg.match(/Great Ancoats Street/g) || []).length === 1, 'saved branch listed once, under Your places');
  await tap('.sugg [data-remote]');
  ok((await ls('sp.places')).filter((x) => x.osm).length === 2, 'second branch saved separately');
  await tap('#change-place'); await p.fill('.picker-input', 'nand'); await p.waitForTimeout(600);
  const before = (await ls('sp.places')).length;
  await tap('.sugg [data-id]');
  ok((await ls('sp.places')).length === before, 'picking a saved place does not duplicate it');
  await tap('#change-place'); await p.fill('.picker-input', 'nand'); await p.waitForTimeout(600);
  await p.locator('.sugg [data-id]', { hasText: 'Ancoats' }).click(); await p.waitForTimeout(60);
  await tap('#take');
  const toRest = await p.getAttribute('#to-restaurant', 'href');
  ok(toRest && toRest.includes('53.4832,-2.2251'), 'directions to restaurant before a parking spot is saved: ' + toRest);
  ok((await p.textContent('main')).includes('Great Ancoats Street, Ancoats, M4 5AB'), 'pickup shows the address');
  await tap('#back'); await tap('#clear');
  // Search down: saved places still work
  searchDown = true;
  await p.fill('.picker-input', 'nand'); await p.waitForTimeout(600);
  sugg = await p.textContent('.sugg');
  ok(sugg.includes("isn't working") && sugg.includes('Your places') && await p.isVisible('.sugg [data-new]'), 'search failure falls back to saved places: ' + sugg.replace(/\s+/g, ' '));
  searchDown = false;
  await p.fill('.picker-input', ''); await tap('#clear');
  // Work area
  await tap('#gear');
  await p.fill('#area', 'Leeds'); await p.locator('#area').blur(); await p.waitForTimeout(300);
  ok((await ls('sp.area')).name === 'Leeds, West Yorkshire' && await p.inputValue('#area') === 'Leeds, West Yorkshire', 'work area looked up and saved');
  await p.fill('#area', 'Nowhereville'); await p.locator('#area').blur(); await p.waitForTimeout(300);
  ok((await p.textContent('#area-status')).includes("Couldn't find") && (await ls('sp.area')).name.startsWith('Leeds'), 'unknown area keeps the old one');
  await tap('[data-tab=order]'); await p.fill('.picker-input', 'wing'); await p.waitForTimeout(600);
  ok(searches[searches.length - 1].searchParams.get('lat') === '53.7997' && (await p.textContent('.sugg')).includes('No matches near Leeds'), 'search follows the new work area (Manchester venues filtered out)');
  await p.fill('.picker-input', '');
  await p.evaluate(() => localStorage.removeItem('sp.area'));
  await p.evaluate(() => localStorage['sp.places'] = JSON.stringify(JSON.parse(localStorage['sp.places']).filter((x) => !x.osm)));

  // Places tab
  await chooseProvider(p, 'all');
  await tap('[data-tab=places]');
  ok((await p.textContent('.place-row')).includes("Nando's") && (await p.textContent('.place-row')).includes('spot saved'), 'place listed');
  await p.fill('#place-search', 'Wok');
  await tap('#add-place');
  ok((await hash()).startsWith('#place/') && await p.inputValue('input[name=name]') === 'Wok', 'add place from search');
  await p.fill('input[name=area]', 'Station Rd'); await p.locator('input[name=area]').blur(); await p.waitForTimeout(60);
  ok((await ls('sp.places')).find((x) => x.name === 'Wok').area === 'Station Rd', 'area saved');
  await p.fill('input[name=name]', ''); await p.locator('input[name=name]').blur(); await p.waitForTimeout(60);
  ok((await ls('sp.places')).find((x) => x.area === 'Station Rd').name === 'Wok', 'empty name refused');
  dialogAnswer = false; await tap('#delete-place');
  ok((await ls('sp.places')).length === 2, 'delete place dismissed keeps it');
  dialogAnswer = true; await tap('#delete-place');
  ok((await ls('sp.places')).length === 1 && await hash() === '#places', 'delete place');
  await tap('[data-sort=slowest]');
  ok(await p.getAttribute('[data-sort=slowest]', 'aria-pressed') === 'true', 'sort toggle');
  await tap('.place-row');
  ok((await p.textContent('main')).includes('7 min') && await p.isVisible('#clear-spot'), 'place detail shows waits and spot');
  await tap('#clear-spot');
  ok(!(await ls('sp.places'))[0].spot, 'spot removed');
  await tap('[data-tab=home]');

  // 12d. Out-and-about safety nets
  // Wording covers every app
  await p.evaluate(() => localStorage.removeItem('sp.active'));
  await tap('[data-tab=home]'); await tap('#start');
  await p.evaluate(() => { const a = JSON.parse(localStorage['sp.active']); a.start = new Date(Date.now() - 2 * 3600e3).toISOString(); localStorage['sp.active'] = JSON.stringify(a); });
  await p.reload(); await p.waitForTimeout(100);
  await tap('#end');
  ok((await p.textContent('main')).includes('from all your apps'), 'earnings label covers all apps');
  // Draft survives the app being closed; Finished time isn't frozen
  await p.fill('[name=earnings]', '55.5'); await p.fill('[name=endOdo]', '999');
  await p.reload(); await p.waitForTimeout(150);
  ok(await p.inputValue('[name=earnings]') === '55.5' && await p.inputValue('[name=endOdo]') === '999', 'end-shift typing survives a reload');
  ok(!('end' in (await ls('sp.active')).draft), 'finished time not frozen in the draft');
  await p.fill('[name=miles]', '20'); await p.fill('[name=startOdo]', ''); await p.fill('[name=endOdo]', '');
  await p.fill('[name=miles]', '20');
  await tap('#f button[type=submit]');
  const saved = (await ls('sp.shifts'))[0];
  ok(!(await ls('sp.active')) && saved.earnings === 55.5 && !('draft' in saved) && !('timesEdited' in saved), 'draft cleared and not stored in the shift');
  ok((await p.textContent('main')).includes('Your apps paid'), 'shift detail wording covers all apps');
  // Long-running shift warning
  await p.evaluate(() => localStorage['sp.active'] = JSON.stringify({ start: new Date(Date.now() - 13 * 3600e3).toISOString(), startOdo: '' }));
  await tap('[data-tab=home]');
  ok((await p.textContent('main')).includes('running for 13h'), 'long shift warning on Shift tab');
  await tap('#end');
  ok((await p.textContent('main')).includes('If you forgot to end it'), 'long shift warning when ending');
  await p.evaluate(() => localStorage.removeItem('sp.active'));
  // Not-on-shift reminder on the Order tab
  await chooseProvider(p, 'just-eat');
  await tap('[data-tab=order]');
  ok(await p.isVisible('#start-from-order'), 'order tab warns when not on shift');
  await tap('#start-from-order');
  ok(!!(await ls('sp.active')) && !(await p.$('#start-from-order')), 'start shift from the order tab');
  await p.evaluate(() => localStorage.removeItem('sp.active'));
  // No accidental one-letter places
  await tap('[data-tab=home]'); await tap('[data-tab=order]');
  await p.fill('.picker-input', 'n');
  ok(!(await p.$('.sugg [data-new]')), 'no add button after one letter');
  await p.fill('.picker-input', 'ne');
  ok(!!(await p.$('.sugg [data-new]')), 'add button after two letters');
  await p.fill('.picker-input', '');
  // Places search matches the address
  await chooseProvider(p, 'all');
  await p.evaluate(() => { const ps = JSON.parse(localStorage['sp.places']); ps.push({ id: 'addr', name: 'Golden Wok', area: '', address: 'Oldham Street, Ancoats, M4 1AA', note: '', parkType: '', parkLimit: '', ease: '', spot: null, waits: [] }); localStorage['sp.places'] = JSON.stringify(ps); });
  await tap('[data-tab=places]'); await p.fill('#place-search', 'ancoats');
  ok((await p.textContent('#place-list')).includes('Golden Wok'), 'places search matches the address');
  // Settings: a blank box keeps its value instead of becoming 0
  await tap('#gear');
  await p.fill('[name=fuelPrice]', '1.55'); await p.locator('[name=fuelPrice]').blur(); await p.waitForTimeout(60);
  await p.fill('[name=fuelPrice]', ''); await p.locator('[name=fuelPrice]').blur(); await p.waitForTimeout(60);
  ok((await ls('sp.settings')).fuelPrice === 1.55 && await p.inputValue('[name=fuelPrice]') === '1.55', 'blank settings box keeps the last value, not 0');
  await p.fill('[name=fuelPrice]', '1.7'); await p.locator('[name=fuelPrice]').blur();
  // Backup reminder
  await p.evaluate(() => { localStorage.removeItem('sp.lastBackup'); const sh = JSON.parse(localStorage['sp.shifts']); while (sh.length < 3) sh.push({ ...sh[0], id: 'x' + sh.length }); localStorage['sp.shifts'] = JSON.stringify(sh); });
  await tap('[data-tab=home]');
  ok(await p.isVisible('#backup-now'), 'backup reminder shows when never backed up');
  const [bk2] = await Promise.all([p.waitForEvent('download'), tap('#backup-now')]);
  ok(bk2.suggestedFilename().endsWith('.json') && !!(await ls('sp.lastBackup')) && !(await p.$('#backup-now')), 'backup from reminder saves and hides it');
  await tap('#gear');
  ok((await p.textContent('main')).includes('Last backup:') && !(await p.textContent('main')).includes('Last backup: never'), 'settings shows last backup date');
  await tap('[data-tab=home]');

  // 13. narrow phone: no sideways scrolling on any screen
  await p.setViewportSize({ width: 320, height: 640 });
  for (const h of ['#home', '#order', '#places', '#settings', '#history', '#add', '#shift/' + id, '#edit/' + id]) {
    await p.goto(URL + h); await p.waitForTimeout(50);
    ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'no overflow at 320px on ' + h);
  }

  // 15. offline
  await p.goto(URL); await p.evaluate(() => navigator.serviceWorker.ready); await p.waitForTimeout(500);
  await ctx.setOffline(true); await p.reload();
  ok(await p.isVisible('[data-tab=home]'), 'app loads offline');
  await ctx.setOffline(false);

  ok(errors.length === 0, 'no JS errors: ' + errors.join('; '));
  console.log(`\n${pass} passed, ${fail} failed`);
   if (fail) process.exitCode = 1;
  await b.close();
})();
