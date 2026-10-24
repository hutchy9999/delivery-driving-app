const { chooseProvider } = require('./provider-helper');
const assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');
const path = require('node:path');
const { profitTimeline, calcShift, fuelCostPerMile } = require('../calc');
const S = { fuelPrice: 1.4, mpg: 45, maintPence: 5, insurancePerHour: 1.16 };
const start = '2026-10-23T17:00:00Z', now = +new Date('2026-10-23T19:00:00Z');
const active = { id: 'live', start, startOdo: '100' };
const jobs = [
  { id: 'j1', shiftId: 'live', fee: '7', miles: '3', completedAt: '2026-10-23T17:30:00Z', platformId: 'just-eat', restaurantName: '<script>bad</script>' },
  { id: 'j2', shiftId: 'live', fee: '6', miles: '2', completedAt: '2026-10-23T18:00:00Z', platformId: 'deliveroo' },
];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const live = profitTimeline([], jobs, active, S, now);
assert.equal(live.length, 4);
near(live.at(-1).profit, 13 - 5 * (fuelCostPerMile(S) + .05) - 2.32);
near(live.at(-2).insurance, 1.16);
assert.ok(live.at(-1).profit < live.at(-2).profit, 'idle time continues to cost insurance');
assert.equal(profitTimeline([], [...jobs, { ...jobs[0], shiftId: 'unrelated', fee: 100 }], active, S, now).at(-1).earnings, 13);
assert.equal(profitTimeline([], [{ ...jobs[0], miles: '' }], active, S, now).at(-1).incomplete, true);
assert.ok(profitTimeline([], [], active, S, now).at(-1).profit < 0, 'empty live shift still costs insurance');
const saved = { ...active, end: new Date(now).toISOString(), miles: 12, earnings: 15, settings: S };
const final = profitTimeline([saved], jobs, null, S, now).at(-1);
near(final.profit, calcShift(saved).profit);
assert.equal(final.estimated, false);
assert.equal(profitTimeline([saved], [], null, S, now).length, 2, 'legacy shifts get only start/end events');
near(profitTimeline([saved], jobs, active, S, now).at(-1).profit, final.profit);
const second = { id: 'earlier', start: '2026-10-23T14:00:00Z', end: '2026-10-23T15:00:00Z', miles: 4, earnings: 10, settings: S };
near(profitTimeline([second], jobs, active, S, now).at(-1).profit, calcShift(second).profit + live.at(-1).profit);
assert.equal(profitTimeline([], [], {start:'invalid'}, S, now).length, 0);

(async () => {
 const browser = await chromium.launch();
 try {
  const context = await browser.newContext({ ...devices['Pixel 7'], timezoneId: 'Europe/London', serviceWorkers: 'block' });
  const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date(now));
  await page.goto('http://localhost:8765/');
  const seed = async (values) => {
   await page.evaluate(values => { localStorage.clear(); for (const [k,v] of Object.entries(values)) localStorage.setItem(k, JSON.stringify(v)); }, values);
   await page.reload();
  };
  await seed({ 'sp.settings': S, 'sp.active': active, 'sp.deliveries': jobs });
  assert.equal(await page.locator('[data-chart-range="today"]').getAttribute('aria-pressed'), 'true');
  assert.ok((await page.locator('.net-total').innerText()).includes(live.at(-1).profit.toFixed(2)));
  assert.ok((await page.locator('#net-today .net-total').innerText()).includes(live.at(-1).profit.toFixed(2)), 'net card deducts vehicle costs and insurance');
  assert.equal(await page.locator('[data-provider-payment]').count(), 2);
  await chooseProvider(page, 'just-eat');
  assert.ok((await page.locator('#net-today .net-total').innerText()).includes(live.at(-1).profit.toFixed(2)), 'provider view does not change shared net');
  assert.ok((await page.locator('.chart-status').innerText()).includes('All platforms'));
  await page.locator('#chart-previous').click();
  assert.ok((await page.locator('#chart-info').innerText()).includes('Delivery 2'));
  await page.locator('#chart-previous').click();
  assert.ok((await page.locator('#chart-info').innerText()).includes('<script>bad</script>'), 'restaurant labels escaped');
  assert.equal(await page.locator('#chart-info script').count(), 0);
  await page.locator('#chart-next').focus(); await page.keyboard.press('Enter');
  assert.ok((await page.locator('#chart-info').innerText()).includes('Delivery 2'));
  const box = await page.locator('#chart svg').boundingBox();
  await page.mouse.move(box.x + 46, box.y + 40); await page.mouse.down();
  await page.mouse.move(box.x + box.width - 14, box.y + 40); await page.mouse.up();
  assert.ok((await page.locator('#chart-info').innerText()).includes('Now'));
  await page.locator('.chart-method summary').click();
  assert.ok((await page.locator('.chart-method').innerText()).includes('Unrecorded travel'));
  await page.locator('[data-chart-range="fortnight"]').click();
  assert.equal(await page.locator('#chart .dot').count(), 1);
  assert.ok((await page.locator('.chart-total').innerText()).includes(live.at(-1).profit.toFixed(2)));
  assert.ok((await page.locator('#net-today .net-total').innerText()).includes(live.at(-1).profit.toFixed(2)), 'net today is independent of graph period');
  await page.reload(); assert.equal(await page.locator('[data-chart-range="fortnight"]').getAttribute('aria-pressed'), 'true');
  await seed({ 'sp.settings': S, 'sp.shifts': [saved], 'sp.deliveries': jobs });
  assert.ok((await page.locator('.net-total').innerText()).includes(final.profit.toFixed(2)));
  assert.ok((await page.locator('#chart-info').innerText()).includes('reconciled'));
  assert.equal(await page.locator('#end').count(), 0);
  await seed({ 'sp.settings': S, 'sp.active': { id:'overnight', start:'2026-10-22T22:30:00Z' } });
  assert.ok((await page.locator('#chart').innerText()).includes('overnight shift'));
  await seed({ 'sp.settings': S, 'sp.active': active, 'sp.deliveries': [{...jobs[0], miles:''}] });
  assert.ok((await page.locator('#chart .warn-note').innerText()).includes('incomplete'));
  await seed({ 'sp.settings': S, 'sp.active': active, 'sp.deliveries': jobs });
  await page.locator('.chart-method summary').click();
  await page.locator('[data-chart-range="today"]').click();
  await page.clock.setFixedTime(new Date(now + 3600000));
  await page.waitForTimeout(15500);
  assert.ok((await page.locator('.net-total').innerText()).includes((live.at(-1).profit - 1.16).toFixed(2)), 'elapsed insurance refreshes even with a chart control focused');
  assert.ok((await page.locator('#net-today .net-total').innerText()).includes((live.at(-1).profit - 1.16).toFixed(2)), 'net card refreshes with elapsed insurance');
  assert.equal(await page.locator('.chart-method').getAttribute('open'), '');
  assert.equal(await page.locator('[data-chart-range="today"]').evaluate(el=>el===document.activeElement), true);
  await page.clock.setFixedTime(new Date(now));
  await seed({ 'sp.settings': S });
  assert.equal(await page.locator('#chart .dot').count(), 0);
  assert.ok((await page.locator('#chart').innerText()).includes('Start a shift'));
  await page.locator('[data-chart-range="fortnight"]').click();
  assert.ok((await page.locator('#chart').innerText()).includes('No shifts in the last 2 weeks'));
  if (process.env.SCREENSHOT_DIR) {
   const demoJobs = [5.5,7,5,4,7,6].map((fee,i)=>({ id:'demo'+i, shiftId:'live', fee, miles:[3,2,3,2,4,6.22][i], completedAt:new Date(+new Date(start)+[18,38,62,84,103,119][i]*60000).toISOString(), platformId: i%3===1?'deliveroo':'just-eat' }));
   const history = [24.2,37.4,31.6,42.8,28.5,46.1,33.9,52.6,39.4].map((fee,i)=>{const at=new Date(now-(i+1)*86400000);at.setUTCHours(12,0,0,0);return {id:'demo-shift'+i,start:at.toISOString(),end:new Date(+at+3600000).toISOString(),earnings:fee,miles:0,settings:{...S,insurancePerHour:0}};});
   await seed({'sp.settings':S,'sp.active':active,'sp.deliveries':demoJobs,'sp.shifts':history});
   for(const theme of ['light','dark']) {await page.emulateMedia({colorScheme:theme});for(const range of ['today','fortnight']){await page.locator(`[data-chart-range="${range}"]`).click();await page.locator('[data-chart-range]').first().blur();await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`shift-${range}-${theme}.png`),fullPage:true});}}
  }
  assert.deepEqual(errors, []);
  await context.close();
  console.log('Chart calculations and browser workflows passed.');
 } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
