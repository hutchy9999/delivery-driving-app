const { chromium, devices } = require('playwright');
const fs = require('fs');
const URL = 'http://localhost:8765/';
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL:', msg); } };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  let dialogAnswer = true, lastDialog = '';
  p.on('dialog', d => { lastDialog = d.message(); dialogAnswer ? d.accept() : d.dismiss(); });
  const toast = async () => { await p.waitForTimeout(80); return (await p.isVisible('#toast')) ? p.textContent('#toast') : ''; };
  const tap = async (s) => { await p.click(s); await p.waitForTimeout(60); };
  const hash = () => p.evaluate(() => location.hash);
  const ls = (k) => p.evaluate(k => JSON.parse(localStorage[k] || 'null'), k);

  await p.goto(URL);
  // 0. chart shows from the start, empty
  ok(await p.isVisible('#chart svg'), 'chart visible with no data');
  ok((await p.textContent('#chart')).includes('No shifts in the last 2 weeks'), 'empty chart message');
  ok((await p.$$('#chart .axis')).length === 13, 'empty chart has 5 £ labels, 7 date labels and a message');
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
  await tap('[data-tab=settings]');
  ok(await p.inputValue('[name=mpg]') === '32', 'settings shown after reopening');
  await p.fill('[name=maintPence]', '5');
  await p.fill('[name=mpg]', '0'); await tap('#sf button[type=submit]');
  ok((await toast()).includes('MPG'), 'MPG 0 rejected');
  ok((await ls('sp.settings')).mpg === 32, 'MPG 0 not saved');
  await p.fill('[name=mpg]', '32'); await tap('#sf button[type=submit]');
  ok((await toast()) === 'Settings saved', 'save button toast');
  ok((await ls('sp.settings')).maintPence === 5, 'maintenance saved');

  // 3. tabs
  for (const t of ['history', 'settings', 'home']) {
    await tap(`[data-tab=${t}]`);
    ok(await p.getAttribute(`[data-tab=${t}]`, 'aria-current') === 'page', `tab ${t} marked current`);
  }

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
  ok(stats.includes('£66.45') && stats.includes('£7.25') && stats.includes('5h 00m'), 'chart averages: ' + stats);
  const cb = await p.locator('#chart svg').boundingBox();
  await p.mouse.click(cb.x + cb.width - 4, cb.y + cb.height / 2);
  ok((await p.textContent('#chart-info')).includes('£66.45 profit'), 'tapping today shows its profit: ' + await p.textContent('#chart-info'));
  await p.mouse.click(cb.x + cb.width * 0.2, cb.y + cb.height / 2);
  ok((await p.textContent('#chart-info')).includes('no shift'), 'tapping an empty day says no shift');

  // 9. add a past shift (miles typed, no odometer), different week
  await tap('a.btn.link[href="#add"]'); ok(await hash() === '#add', 'add link from home');
  await p.fill('[name=earnings]', '40'); await p.fill('[name=miles]', '12.5');
  await p.fill('[name=start]', '2026-10-01T18:00'); await p.fill('[name=end]', '2026-10-01T21:00');
  await submit(); ok((await hash()).startsWith('#shift/'), 'past shift saved');
  await tap('[data-tab=history]');
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
  await tap('[data-tab=settings]');
  const [csv] = await Promise.all([p.waitForEvent('download'), tap('#csv')]);
  const csvText = fs.readFileSync(await csv.path(), 'utf8');
  ok(csv.suggestedFilename().endsWith('.csv') && csvText.split('\n').length === 2 && csvText.includes('"81.00"'), 'CSV export');
  const [bk] = await Promise.all([p.waitForEvent('download'), tap('#backup')]);
  const backup = JSON.parse(fs.readFileSync(await bk.path(), 'utf8'));
  ok(backup.app === 'shift-profit' && backup.shifts.length === 1, 'backup export');

  // 12. restore: bad entries filtered, missing settings filled; same file twice
  backup.shifts.push({ id: 'x2', start: '2026-09-01T10:00:00Z', end: '2026-09-01T12:00:00Z', miles: 10, earnings: 20 }, { junk: true }, null);
  const f1 = require('os').tmpdir() + '/restore.json'; fs.writeFileSync(f1, JSON.stringify(backup));
  const restore = async (file) => { const [fc] = await Promise.all([p.waitForEvent('filechooser'), tap('#restore')]); await fc.setFiles(file); await p.waitForTimeout(150); };
  await restore(f1);
  ok(lastDialog.includes('Restore 2 shifts'), 'restore counts only valid shifts: ' + lastDialog);
  ok((await ls('sp.shifts')).length === 2, 'restored 2 shifts');
  await p.evaluate(() => localStorage['sp.shifts'] = '[]');
  lastDialog = ''; await restore(f1);
  ok(lastDialog.includes('Restore 2'), 'same file can be chosen twice');
  await tap('[data-tab=history]');
  ok((await p.$$('.shift-row')).length === 2, 'history renders restored shift without settings');
  const f2 = require('os').tmpdir() + '/bad.json'; fs.writeFileSync(f2, '{"hello":1}');
  await tap('[data-tab=settings]'); await restore(f2);
  ok((await toast()).includes("doesn't look like"), 'bad file rejected');

  // 12b. order calculator (settings: £1.70/L, 32 MPG, 5p/mile, £1.16/hr, target £15, 15 mph, 8 min)
  await tap('[data-tab=order]');
  ok(await hash() === '#order', 'order tab opens');
  ok(await p.evaluate(() => document.activeElement.name) === 'fee', 'fee box focused');
  ok((await p.textContent('#order-result')).includes('Type the fee'), 'order prompt when empty');
  await p.fill('[name=fee]', '4');
  ok((await p.textContent('#order-result')).includes('Type the fee'), 'needs miles too');
  await p.fill('[name=miles]', '1.5');
  let res = await p.textContent('#order-result');
  ok(res.includes('£14.11/hr') && res.includes('Borderline') && res.includes('14 min') && res.includes('estimated'), 'order £4 / 1.5mi: ' + res.replace(/\s+/g, ' '));
  await p.fill('[name=mins]', '10');
  res = await p.textContent('#order-result');
  ok(res.includes('Worth taking') && res.includes('from offer') && !res.includes('Time estimated'), 'minutes from offer used: ' + res.replace(/\s+/g, ' '));
  await p.fill('[name=mins]', ''); await p.fill('[name=fee]', '5'); await p.fill('[name=miles]', '7');
  ok((await p.textContent('#order-result')).includes('Not worth it'), 'long cheap order is poor');
  await tap('[data-tab=home]'); await tap('[data-tab=order]');
  ok(await p.inputValue('[name=fee]') === '5' && await p.inputValue('[name=miles]') === '7', 'order numbers kept when switching tabs');
  await tap('#clear');
  ok(await p.inputValue('[name=fee]') === '' && await p.inputValue('[name=miles]') === '' && (await p.textContent('#order-result')).includes('Type the fee'), 'clear empties the calculator');
  ok(await p.evaluate(() => document.activeElement.name) === 'fee', 'clear refocuses fee');
  ok(!(await p.textContent('main')).toLowerCase().includes('cheat'), 'no cheat sheet');
  await tap('[data-tab=settings]');
  await p.fill('[name=targetPerHour]', '10'); await p.fill('[name=stopMins]', '5');
  await tap('[data-tab=order]');
  await p.fill('[name=fee]', '4'); await p.fill('[name=miles]', '1.5');
  res = await p.textContent('#order-result');
  ok(res.includes('Worth taking') && res.includes('11 min') && res.includes('Target: £10.00/hr'), 'order settings take effect: ' + res.replace(/\s+/g, ' '));
  await tap('[data-tab=settings]');
  await p.fill('[name=targetPerHour]', '15'); await p.fill('[name=stopMins]', '8');
  await tap('[data-tab=home]');

  // 13. narrow phone: no sideways scrolling on any screen
  await p.setViewportSize({ width: 320, height: 640 });
  for (const h of ['#home', '#order', '#settings', '#history', '#add', '#shift/' + id, '#edit/' + id]) {
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
  await b.close();
})();
