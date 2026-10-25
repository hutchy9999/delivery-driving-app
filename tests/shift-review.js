const assert = require('node:assert/strict');
const { calcShiftReview } = require('../calc');
const { chromium } = require('playwright');
const path = require('node:path');
const shift = { id:'s', start:'2026-10-24T10:00:00Z', end:'2026-10-24T12:00:00Z', miles:15, earnings:30,
  settings:{fuelPrice:1.4,mpg:45,maintPence:5,insurancePerHour:1.16} };
const job = (id,a,b,miles) => ({id,shiftId:'s',acceptedAt:`2026-10-24T${a}:00Z`,completedAt:`2026-10-24T${b}:00Z`,miles,platformId:'just-eat'});
const jobs = [job('a','10:10','10:40',3),job('b','10:30','11:00',4)];
jobs[0].arrivedAt='2026-10-24T10:15:00Z';jobs[0].collectedAt='2026-10-24T10:25:00Z';
let r=calcShiftReview(shift,[...jobs,{...jobs[0],shiftId:'other'},job('future','12:01','12:20',8)]);
assert.equal(r.count,2);assert.equal(r.perHour,1);assert.equal(r.waitCount,1);assert.equal(r.waitHours,1/6);
assert.ok(Math.abs(r.outsideHours-70/60)<1e-9);assert.equal(r.offerMiles,7);assert.equal(r.mileageDifference,8);
r=calcShiftReview(shift,[{...jobs[0],acceptedAt:null,miles:''}]);
assert.equal(r.outsideHours,null);assert.equal(r.mileageDifference,null);assert.equal(r.mileageCount,0);
r=calcShiftReview(shift,[job('clipped','09:30','10:30',20)]);
assert.equal(r.outsideHours,1.5);assert.equal(r.mileageDifference,-5);
assert.equal(calcShiftReview(shift,[]).outsideHours,null);assert.equal(calcShiftReview({...shift,id:null},jobs).count,0);
assert.equal(calcShiftReview(shift,[{...jobs[0],acceptedAt:jobs[0].completedAt,completedAt:jobs[0].acceptedAt}]).timedCount,0);
(async()=>{const browser=await chromium.launch();try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:8765/');
 await page.evaluate(({shift,jobs})=>{localStorage.clear();localStorage['sp.workflowMode']=JSON.stringify('detailed');localStorage['sp.shifts']=JSON.stringify([shift]);localStorage['sp.deliveries']=JSON.stringify(jobs);localStorage['sp.platform']=JSON.stringify('deliveroo');},{shift,jobs});
 await page.goto('http://localhost:8765/#shift/s');await page.reload();
 assert.equal(await page.locator('main > h2').innerText(),'Shift review');
 assert.ok((await page.locator('.shift-review').first().innerText()).includes('Recorded deliveries\n2'));
 assert.ok((await page.locator('.shift-review').last().innerText()).includes('+8 mi'));
 for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});for(const width of [320,390]){
  await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  if(process.env.SCREENSHOT_DIR&&width===390)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`shift-review-${theme}.png`),fullPage:true});
 }}
 await page.evaluate(()=>localStorage['sp.deliveries']='[]');await page.reload();
 assert.ok((await page.locator('main').innerText()).includes('No completed deliveries linked'));
 await page.click('#edit');await page.fill('[name=earnings]','35');await page.click('#f button[type=submit]');await page.locator('#review-time').waitFor();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage['sp.shifts'])[0].earnings),35);assert.deepEqual(errors,[]);
 console.log('Shift review passed: overlaps, missing data, clipping, negative mileage difference, all-platform scope, mobile themes and edit/save return.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
