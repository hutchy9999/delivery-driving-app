const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const base='http://localhost:8765/';
(async()=>{const browser=await chromium.launch();try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='localhost'?r.continue():r.abort());
 await context.route(base,async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('<script src="app.js"></script>','<script src="native-tracking.js"></script><script src="app.js"></script>')});});
 await context.addInitScript(()=>{
   window.nativeCalls=[];window.nativeState={};window.nativeEvents=[];window.fileSaved=true;
   window.Capacitor={isNativePlatform:()=>true,Plugins:{ShiftTracker:{
     state:async()=>({...nativeState}),start:async args=>{nativeCalls.push(['start',args]);nativeState={...nativeState,shiftId:args.shiftId,running:true,paused:false};},
     stop:async()=>{nativeCalls.push(['stop']);nativeState={};},setJob:async args=>{nativeCalls.push(['job',args]);},
     events:async()=>({events:nativeEvents}),acknowledge:async({ids})=>{nativeCalls.push(['ack',ids]);nativeEvents=nativeEvents.filter(e=>!ids.includes(e.id));},
     restoreTracking:async args=>{nativeCalls.push(['restore',args]);nativeState={};},exportFile:async args=>{nativeCalls.push(['file',args]);return {saved:fileSaved};},openAppSettings:async()=>{}
   }}};
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(base+'#settings');await page.locator('#native-enable').waitFor();
 assert.match(await page.textContent('#native-enable'),/Enable/);assert.equal(await page.evaluate(()=>nativeCalls.some(c=>c[0]==='start')),false);
 await page.click('#native-enable');await page.goto(base+'#home');await page.fill('#odo','100');await page.click('#start');
 await page.waitForFunction(()=>nativeCalls.some(c=>c[0]==='start'));
 await page.evaluate(()=>{const p={id:'test-pickup',name:'Test Shop',postcode:'M5 3AA',loc:{lat:53.48,lng:-2.25},waits:[]};store.places=[p];store.order={...EMPTY_ORDER,fee:'9',miles:'3',offerDetails:{pickup:'Test Shop, M5 3AA',dropoffs:[]}};});
 await page.goto(base+'#order');await page.click('#take');await page.waitForFunction(()=>nativeCalls.some(c=>c[0]==='job'&&c[1].job.lat===53.48));
 const job=await page.evaluate(()=>store.order);assert.equal(job.workflowMode,'simple');
 await page.evaluate(async()=>{const arrival=Date.now(),departed=arrival+6*60000;nativeEvents=[{id:'event-one',kind:'collection-stop',jobId:store.order.id,shiftId:store.active.id,arrived:arrival,departed,minutes:6,lat:53.4801,lng:-2.2501,accuracy:15,samples:36,eligible:true}];await NativeTracking.sync();});
 let data=await page.evaluate(()=>({order:store.order,place:store.places[0]}));assert.equal(data.order.collectionStop.minutes,6);assert.equal(data.order.collectionStop.eligible,true);assert.equal(data.order.arrivedAt,null);assert.equal(data.order.collectedAt,null);assert.equal(data.order.pickupLocation.source,'place');assert.equal(data.place.waits.length,1);
 await page.evaluate(async()=>{nativeEvents=[{id:'event-one',kind:'collection-stop',jobId:store.order.id,arrived:Date.now(),departed:Date.now()+360000,minutes:6,lat:53.48,lng:-2.25,accuracy:15,samples:36,eligible:true}];await NativeTracking.sync();});assert.equal(await page.evaluate(()=>store.places[0].waits.length),1,'event deduplicated');
 await page.evaluate(()=>{save('sp.captureDeliveryLocation',false);});await page.click('#delivered');await page.locator('#take').waitFor();
 assert.equal(await page.evaluate(()=>store.deliveries[0].collectionStop.minutes),6);assert.equal(await page.evaluate(()=>deliveryWaitMinutes({...store.deliveries[0],manualWaitMins:12})),12,'manual correction wins');
 await page.evaluate(async()=>{nativeState.paused=true;nativeState.running=false;});let starts=await page.evaluate(()=>nativeCalls.filter(c=>c[0]==='start').length);await page.evaluate(()=>NativeTracking.sync());assert.equal(await page.evaluate(()=>nativeCalls.filter(c=>c[0]==='start').length),starts,'notification pause respected');
 await page.goto(base+'#settings');await page.locator('#native-resume').waitFor();await page.click('#native-resume');await page.waitForFunction(()=>nativeState.running===true);
 await page.evaluate(()=>{fileSaved=false;});await page.click('#backup');assert.equal(await page.evaluate(()=>store.lastBackup),null,'cancelled native picker does not claim backup saved');
 await page.evaluate(()=>{fileSaved=true;});await page.click('#backup');await page.waitForFunction(()=>store.lastBackup);assert.equal(await page.evaluate(()=>nativeCalls.filter(c=>c[0]==='file').at(-1)[1].includeTracking),true);
 await page.click('#diagnostics-export');await page.waitForFunction(()=>nativeCalls.filter(c=>c[0]==='file').at(-1)[1].includeDiagnostics===true);assert.equal(await page.evaluate(()=>nativeCalls.filter(c=>c[0]==='file').at(-1)[1].includeTracking),false,'shared log excludes raw GPS backup');
 // Legacy web backup restores with native tracking deliberately disabled.
 const backup=await page.evaluate(()=>JSON.parse(nativeCalls.filter(c=>c[0]==='file'&&c[1].includeTracking).at(-1)[1].text));
 await page.setInputFiles('#file',{name:'synthetic-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Backup restored');
 assert.equal(await page.evaluate(()=>load('sp.nativeTrackingEnabled',true)),false);assert.deepEqual(await page.evaluate(()=>nativeCalls.filter(c=>c[0]==='restore').at(-1)[1].data),{});
 await page.evaluate(()=>{save('sp.nativeTrackingEnabled',true);nativeState={shiftId:'old-shift',paused:true};});await page.evaluate(()=>NativeTracking.sync());assert.equal(await page.evaluate(()=>nativeState.shiftId),job.shiftId,'new shift can start after an older paused shift');
 await page.goto(base+'#home');await page.click('#end');await page.fill('[name=earnings]','9');await page.fill('[name=endOdo]','105');await page.click('#f button[type=submit]');await page.waitForFunction(()=>store.active===null);await page.waitForFunction(()=>!nativeState.shiftId);
 // No targets or additional UI added to normal web app.
 assert.deepEqual(errors,[]);console.log('Native adapter passed: opt-in, shift start/end, pickup target, stop reconciliation/deduplication, Simple timestamps, manual override, notification pause/resume, backup save/cancel and legacy migration.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
