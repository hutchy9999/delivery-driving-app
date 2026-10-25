const {chromium,devices}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch();try{
const ctx=await browser.newContext({...devices['Pixel 7'],timezoneId:'Europe/London',serviceWorkers:'block'});
const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const now=new Date('2026-10-23T20:10:35Z');await page.clock.setFixedTime(now);
await page.goto('http://localhost:8765/');
const active={id:'guard',start:'2026-10-23T18:00:00Z',startOdo:'100',draft:{earnings:'25',miles:'10'}};
const order={id:'pending',step:'deliver',acceptedAt:'2026-10-23T19:00:00Z',collectedAt:'2026-10-23T20:00:00Z',shiftId:'guard',platformId:'just-eat',platformName:'Just Eat',fee:'7',miles:'3'};
const seed=async(o)=>{await page.evaluate(({active,o})=>{localStorage.clear();localStorage['sp.workflowMode']=JSON.stringify('detailed');localStorage['sp.settings']=JSON.stringify({fuelPrice:1.4,mpg:45,maintPence:5,insurancePerHour:1.16});localStorage['sp.active']=JSON.stringify(active);localStorage['sp.order']=JSON.stringify(o);localStorage['sp.platform']=JSON.stringify('just-eat')},{active,o});await page.goto('http://localhost:8765/#home');await page.reload();};
const read=key=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'null'),key);
for(const stage of ['pickup','waiting','deliver','offer']){
 await seed({...order,step:stage});await page.click('#end');await page.locator('#unfinished-order').waitFor();
 assert.equal(await page.locator('#unfinished-order').count(),1,stage+' must block end');
 assert.equal(await page.locator('#f').count(),0);assert.equal((await read('sp.active')).draft.earnings,'25');
 await page.click('#keep-shift');await page.click('.shift-options summary');await page.click('#cancel');assert.equal(await page.locator('#unfinished-order').count(),1,'cancel also protects pending order');
}
await seed(order);await page.click('#end');await page.click('#unfinished-order a[href="#order"]');await page.click('#delivered');
assert.equal((await read('sp.deliveries')).length,1);await page.click('[data-tab="home"]');await page.click('#end');
assert.equal(await page.inputValue('[name="earnings"]'),'25');await page.click('#f button[type="submit"]');
const saved=(await read('sp.shifts'))[0],delivered=(await read('sp.deliveries'))[0];
assert.equal(saved.id,delivered.shiftId);assert.ok(new Date(saved.end)>=new Date(delivered.completedAt),'saved endpoint includes completion seconds');
assert.equal(await read('sp.active'),null);
await seed(order);await page.goto('http://localhost:8765/#end');await page.click('#unfinished-order a[href="#order"]');await page.click('#cancel-delivery');
await page.click('[data-tab="home"]');await page.click('#end');await page.locator('#f').waitFor();assert.equal(await page.locator('#f').count(),1,'explicit cancellation allows ending');
// Recheck at submission in case another tab accepted an order after form open.
await page.evaluate(o=>localStorage['sp.order']=JSON.stringify(o),order);await page.click('#f button[type="submit"]');
assert.ok((await page.locator('#err').innerText()).includes('unfinished'));assert.ok(await read('sp.active'));
// An explicit finish time may not omit a completed delivery.
await page.evaluate(()=>{localStorage['sp.order']=JSON.stringify({step:'offer'});localStorage['sp.deliveries']=JSON.stringify([{id:'finished',shiftId:'guard',completedAt:'2026-10-23T20:09:42Z'}]);});
await page.fill('[name="end"]','2026-10-23T21:08');await page.click('#f button[type="submit"]');assert.ok((await page.locator('#err').innerText()).includes('last completed delivery'));
await page.fill('[name="end"]','2026-10-23T21:09');await page.click('#f button[type="submit"]');assert.equal((await read('sp.shifts'))[0].end,'2026-10-23T20:09:42.000Z');
await seed({step:'offer'});await page.click('#end');await page.fill('[name="start"]','2026-10-23T18:30');await page.clock.setFixedTime(new Date(+now+120000));await page.click('#f button[type="submit"]');assert.equal((await read('sp.shifts'))[0].end,new Date(+now+120000).toISOString(),'editing only start must leave the finish automatic');
assert.deepEqual(errors,[]);console.log('Shift guard passed: all pending stages, direct navigation, cancellation, draft preservation, submit-time recheck and completion timestamp bounds.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
