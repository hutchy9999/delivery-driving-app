const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
(async()=>{const browser=await chromium.launch();try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Europe/London',serviceWorkers:'block'});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.setFixedTime(new Date('2026-10-24T15:00:00Z'));
 await page.goto('http://localhost:8765/');
 const settings={fuelPrice:1.4,mpg:45,maintPence:5,insurancePerHour:1.16};
 const shift={id:'s',start:'2026-10-24T10:00:00Z',end:'2026-10-24T12:00:00Z',miles:15,earnings:30,settings};
 const delivery={id:'d',shiftId:'s',placeId:'p',restaurantName:'Example Kitchen',platformId:'just-eat',fee:'7',miles:'3',acceptedAt:'2026-10-24T10:10:35.123Z',arrivedAt:'2026-10-24T10:15:35.123Z',collectedAt:'2026-10-24T10:25:35.123Z',completedAt:'2026-10-24T10:40:35.123Z'};
 const place={id:'p',name:'Example Kitchen',waits:[{orderId:'d',at:delivery.collectedAt,mins:10,platformId:'just-eat'},{at:'2026-10-23T10:00:00Z',mins:8}]};
 await page.evaluate(({settings,shift,delivery,place})=>{localStorage.clear();localStorage['sp.workflowMode']=JSON.stringify('detailed');for(const [k,v]of Object.entries({'sp.settings':settings,'sp.shifts':[shift],'sp.deliveries':[delivery],'sp.places':[place]}))localStorage[k]=JSON.stringify(v);},{settings,shift,delivery,place});
 const read=key=>page.evaluate(k=>JSON.parse(localStorage[k]),key);
 const edit=async()=>{await page.goto('http://localhost:8765/#delivery-edit/d');await page.reload();await page.locator('#delivery-edit-form').waitFor();};
 const submit=()=>page.click('#delivery-edit-form button[type=submit]');
 await page.goto('http://localhost:8765/#history');await page.reload();await page.locator('.delivery-record summary').first().click();await page.getByRole('link',{name:'Edit delivery',exact:true}).click();
 await submit();await page.locator('#review-time').waitFor();assert.equal((await read('sp.deliveries'))[0].correctedAt,undefined,'no-op is not correction');
 await edit();await page.fill('[name=fee]','9');await page.getByRole('link',{name:'Cancel',exact:true}).click();assert.equal((await read('sp.deliveries'))[0].fee,'7');
 await edit();await page.fill('[name=fee]','-1');await submit();assert.ok((await page.textContent('#correction-error')).includes('zero or more'));
 await page.fill('[name=fee]','9');await page.fill('[name=miles]','4');
 await page.fill('[name=collectedAt]','2026-10-24T11:30:35');await submit();await page.locator('#review-time').waitFor();
 let d=(await read('sp.deliveries'))[0];assert.equal(d.fee,9);assert.equal(d.miles,4);assert.equal(d.acceptedAt,delivery.acceptedAt,'untouched milliseconds retained');assert.deepEqual(d.originalValues,Object.fromEntries(['fee','miles','acceptedAt','arrivedAt','collectedAt','completedAt','manualWaitMins'].map(k=>[k,delivery[k]??null])));
 assert.ok(d.correctedAt);assert.equal((await read('sp.places'))[0].waits.length,2);assert.equal((await read('sp.places'))[0].waits.find(w=>w.orderId==='d').mins,15);
 assert.deepEqual((await read('sp.shifts'))[0],shift,'final shift profit inputs unchanged');
 await edit();await page.fill('[name=completedAt]','2026-10-24T11:20:01');await submit();assert.ok((await page.textContent('#correction-error')).includes('follow Accepted'));
 await page.fill('[name=completedAt]','2026-10-24T13:30:01');await submit();assert.ok((await page.textContent('#correction-error')).includes('within the linked shift'));
 await page.fill('[name=completedAt]','2026-10-25T11:40:01');await submit();assert.ok((await page.textContent('#correction-error')).includes('future'));
 await page.fill('[name=completedAt]','');await submit();assert.ok((await page.textContent('#correction-error')).includes('Enter Food collected'));
 await edit();await page.fill('[name=arrivedAt]','');await page.fill('[name=fee]','');await submit();await page.locator('#review-time').waitFor();
 d=(await read('sp.deliveries'))[0];assert.equal(d.arrivedAt,null);assert.equal(d.fee,'');assert.equal(d.originalValues.fee,'7','repeated correction preserves first original');assert.equal((await read('sp.places'))[0].waits.length,1,'removes linked wait only');
 await edit();await page.getByText('Original recorded values',{exact:true}).click();assert.ok((await page.textContent('main')).includes('£7.00'));
 for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await page.addScriptTag({content:axe});const violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag22aa']})).violations);assert.deepEqual(violations.map(v=>v.id),[]);
  for(const width of [320,390]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`delivery-corrections-${theme}.png`),fullPage:true});
 }
 // Storage failure must not leave restaurant statistics updated without the delivery.
 await edit();const before=await read('sp.places');await page.fill('[name=arrivedAt]','2026-10-24T11:20:35');
 await page.evaluate(()=>{const set=Storage.prototype.setItem;window.restoreStorage=()=>Storage.prototype.setItem=set;Storage.prototype.setItem=function(k,v){if(k==='sp.deliveries')throw new DOMException('full','QuotaExceededError');return set.call(this,k,v);};});
 await submit();assert.ok((await page.textContent('#correction-error')).includes('Could not save'));assert.deepEqual(await read('sp.places'),before);await page.evaluate(()=>window.restoreStorage());
 // Another tab's edits are protected from stale form overwrites.
 await page.evaluate(()=>{const ds=JSON.parse(localStorage['sp.deliveries']);ds[0].fee=10;localStorage['sp.deliveries']=JSON.stringify(ds);});await submit();assert.ok((await page.textContent('#correction-error')).includes('changed elsewhere'));
 // Existing backup format retains correction metadata on a real export/import.
 await page.goto('http://localhost:8765/#settings');const download=page.waitForEvent('download');await page.click('#backup');const backup=JSON.parse(fs.readFileSync(await(await download).path(),'utf8'));
 assert.equal(backup.deliveries[0].originalValues.fee,'7');page.on('dialog',d=>d.accept());
 await page.click('#restore');await page.setInputFiles('#file',{name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Backup restored');
 assert.deepEqual((await read('sp.deliveries'))[0].originalValues,backup.deliveries[0].originalValues);
 // Older unlinked records remain editable without fabricating missing timings.
 await page.evaluate(()=>{const ds=JSON.parse(localStorage['sp.deliveries']);delete ds[0].shiftId;delete ds[0].acceptedAt;localStorage['sp.deliveries']=JSON.stringify(ds);});await edit();await page.fill('[name=miles]','5');await submit();await page.waitForURL('**/#history');assert.equal((await read('sp.deliveries'))[0].acceptedAt,null);
 assert.deepEqual(errors,[]);console.log('Delivery corrections passed: navigation, cancel/no-op, originals, exact timestamps, validation, waits, shift totals, storage rollback, stale forms, backup restore, legacy records and mobile accessibility.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
