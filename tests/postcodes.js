const {chromium}=require('playwright');const assert=require('node:assert/strict');const path=require('node:path');
const {mockPhoton}=require('./photon-mock');
(async()=>{const browser=await chromium.launch();try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});await mockPhoton(context);
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let fail=false, empty=false, calls=0, postcodeCalls=0;
 await context.route('https://api.postcodes.io/**',route=>{postcodeCalls++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({result:{postcode:'M1 2AQ',latitude:53.48,longitude:-2.23}})});});
 await context.route('https://overpass-api.de/**',route=>{calls++;return route.fulfill({status:fail?503:200,contentType:'application/json',body:JSON.stringify({elements:empty?[]:[{type:'node',id:1,lat:53.48,lon:-2.23,tags:{name:"McDonald's",amenity:'fast_food','addr:postcode':'M1 2AQ','addr:street':'Example Street'}},{type:'way',id:2,center:{lat:53.4801,lon:-2.2301},tags:{name:'Other Kitchen',amenity:'restaurant','addr:postcode':'M1 2AB'}}]})});});
 await page.goto('http://localhost:8765/');await page.evaluate(()=>localStorage.clear());await page.goto('http://localhost:8765/#order');await page.reload();
 assert.ok((await page.locator('.picker-input').getAttribute('placeholder')).includes('postcode'));
 await page.fill('[name=fee]','7');await page.fill('[name=miles]','3');
 await page.fill('.picker-input','m12aq');await page.locator('[data-remote]').first().waitFor();assert.equal(postcodeCalls,1);assert.equal(calls,1);
 assert.ok((await page.textContent('.sugg')).includes('Postcode matches'));assert.ok((await page.textContent('.sugg')).includes('Nearby · check branch'));
 if(process.env.SCREENSHOT_DIR){await page.locator('.picker-input').blur();await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'postcode-picker.png'),fullPage:true});}
 await page.click('[data-remote="0"]');let places=await page.evaluate(()=>JSON.parse(localStorage['sp.places']));const id=places[0].id;assert.equal(places[0].name,"McDonald's");assert.equal(places[0].postcode,'M1 2AQ');assert.equal(places[0].osm,'N1');
 assert.equal(await page.inputValue('[name=fee]'),'7');assert.equal(await page.inputValue('[name=miles]'),'3');
 await page.evaluate(id=>{const ps=JSON.parse(localStorage['sp.places']);ps[0].note='Keep existing parking';ps[0].waits=[{mins:7,at:new Date().toISOString()}];localStorage['sp.places']=JSON.stringify(ps);},id);
 await page.click('#change-place');await page.fill('.picker-input','M1 2AQ');await page.locator('[data-id]').waitFor();await page.click('[data-id]');assert.equal(await page.evaluate(()=>JSON.parse(localStorage['sp.order']).placeId),id);assert.equal((await page.evaluate(()=>JSON.parse(localStorage['sp.places']))).length,1);
 // Offline postcode lookup still finds saved places without spaces.
 await page.click('#change-place');await context.setOffline(true);await page.fill('.picker-input','m12aq');await page.locator('[data-id]').waitFor();await page.click('[data-id]');assert.equal((await page.evaluate(()=>JSON.parse(localStorage['sp.places'])))[0].note,'Keep existing parking');await context.setOffline(false);
 // Full postcode can be saved without lookup, then reused without duplication.
 await page.click('#change-place');await page.fill('.picker-input','M2 3AB');await page.click('[data-new]');places=await page.evaluate(()=>JSON.parse(localStorage['sp.places']));const fallback=places.find(p=>p.postcodeOnly);assert.equal(fallback.postcode,'M2 3AB');assert.equal(fallback.loc,undefined);
 await page.click('#change-place');await page.fill('.picker-input','m23ab');await page.click('[data-new]');assert.equal((await page.evaluate(()=>JSON.parse(localStorage['sp.places']))).length,2);
 // Name search remains available; partial postcodes do not create misleading names.
 await page.click('#change-place');await page.fill('.picker-input','M1 2');assert.equal(await page.locator('[data-new]').count(),0);assert.ok((await page.textContent('.sugg')).includes('full pickup postcode'));
 await page.fill('.picker-input','nandos');await page.locator('[data-remote]').first().waitFor();assert.ok((await page.textContent('.sugg')).includes("Nando's"));
 // External lookup failure never prevents a postcode-only entry.
 fail=true;await page.fill('.picker-input','M3 4CD');await page.getByText('Lookup unavailable.',{exact:false}).waitFor();assert.ok(await page.locator('[data-new]').isVisible());
 fail=false;empty=true;await page.fill('.picker-input','M4 5EF');await page.getByText('No restaurants listed here.',{exact:false}).waitFor();assert.ok(await page.locator('[data-new]').isVisible());
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);console.log('Postcode picker passed: formatting, branch choices, saved identity/notes, offline matching, postcode-only fallback/reuse, partial codes, names, service failure and empty results.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
