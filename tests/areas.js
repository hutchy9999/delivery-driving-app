const assert=require('node:assert/strict');
const {chromium,devices}=require('playwright');
const fs=require('node:fs');
const AXE=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const settings={fuelPrice:1.4,mpg:45,maintPence:5,insurancePerHour:1,goodPerHour:12,okPerHour:10,townMph:15,stopMins:8,handoverMins:3};
const places=[{id:'p',name:'Ordsall pickup',area:'Ordsall',loc:{lat:53.477,lng:-2.278},spot:{lat:53.4771,lng:-2.2781},waits:[]},
 {id:'q',name:'City centre pickup',area:'City centre',loc:{lat:53.481,lng:-2.241},waits:[]}];
const shifts=[7,14,21].map(day=>({id:'s'+day,start:`2026-10-${String(day).padStart(2,'0')}T09:00:00Z`,end:`2026-10-${String(day).padStart(2,'0')}T20:00:00Z`,miles:30,earnings:80,settings}));
const jobs=places.flatMap((place,p)=>Array.from({length:6},(_,i)=>({id:place.id+i,placeId:place.id,restaurantName:place.name,shiftId:shifts[i%3].id,acceptedAt:shifts[i%3].start.replace('09:00','14:00'),completedAt:shifts[i%3].start.replace('09:00','14:30'),fee:p?3:10,miles:2,workflowMode:'simple',platformId:'just-eat',settings})));
const BASE='http://localhost:8765/';
(async()=>{const browser=await chromium.launch();try{
 const context=await browser.newContext({...devices['Pixel 7'],serviceWorkers:'block'});
 // Keep this repeatable without downloading street tiles in every UI assertion.
 await context.route('https://tile.openstreetmap.org/**',r=>r.abort());
 let lookups=0;await context.route('https://api.postcodes.io/**',r=>{lookups++;return r.fulfill({json:{result:{latitude:53.477,longitude:-2.278}}});});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Page error:',e.message);});
 await page.goto(BASE);await page.evaluate(({settings,places,shifts,jobs})=>{localStorage.clear();localStorage.setItem('sp.settings',JSON.stringify(settings));localStorage.setItem('sp.places',JSON.stringify(places));localStorage.setItem('sp.shifts',JSON.stringify(shifts));localStorage.setItem('sp.deliveries',JSON.stringify(jobs));},{settings,places,shifts,jobs});
 await page.click('[data-tab=places]');assert.equal(new URL(page.url()).hash,'#areas');assert.equal(await page.locator('.area-rate-marker').count(),0,'current Monday is empty for Wednesday records');
 await page.click('#area-all');assert.equal(await page.locator('.area-rate-marker').count(),2);assert.match(await page.textContent('#area-availability'),/general history/);
 await page.locator('.area-rate-marker').first().click();const nav=page.locator('#area-navigate');await nav.waitFor();const maps=new URL(await nav.getAttribute('href'));assert.equal(maps.hostname,'www.google.com');assert.equal(maps.searchParams.get('destination'),'53.4771,-2.2781');assert.equal(maps.searchParams.get('travelmode'),'driving');assert.equal(await nav.getAttribute('target'),'_blank');assert.match(await page.textContent('#area-selection'),/Saved parking spot/);
 await page.waitForFunction(()=>{const link=document.querySelector('#area-navigate').getBoundingClientRect();return link.top>=0&&link.bottom<document.querySelector('.tabs').getBoundingClientRect().top;},{},{timeout:3000});
 await page.click('.area-records > summary');assert.equal(await page.locator('#area-selection .delivery-record').count(),6);
 await page.click('#area-close');assert.equal(await nav.count(),0);
 await page.selectOption('#area-provider','deliveroo');assert.equal(await page.locator('.area-rate-marker').count(),0,'local provider filter');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sp.platform'))),null,'map filter does not change next-order provider');
 await page.selectOption('#area-provider','all');assert.equal(await page.locator('.area-rate-marker').count(),2);
 await page.click('#area-change');await page.selectOption('#area-day','3');await page.fill('#area-time','15:00');await page.click('#area-time-form button');assert.equal(await page.locator('.area-rate-marker').count(),2,'weekday/time match');
 await page.click('[data-area-view=places]');await page.locator('#place-search').waitFor();assert.equal(await page.locator('.place-row').count(),2);await page.fill('#place-search','Ordsall');await page.locator('.place-row').click();await page.locator('input[name=name]').waitFor();assert.match(await page.textContent('main'),/Edit place/);
 await page.goto(BASE+'#areas');await page.click('#area-all');await page.click('#area-zoom-in');await page.click('#area-zoom-out');
 // Tiny screens, both themes, map details and keyboard-accessible list.
 for(const colorScheme of ['light','dark'])for(const width of [320,393,560]){
   await page.emulateMedia({colorScheme});await page.setViewportSize({width,height:850});
   await page.locator('.area-rate-marker').first().click({timeout:5000}).catch(async error=>{console.error(await page.evaluate(()=>({width:innerWidth,scroll:scrollY,map:document.querySelector('#earnings-map').getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll('.area-rate-marker')].map(b=>b.getBoundingClientRect().toJSON())})));throw error;});await page.addScriptTag({content:AXE});
   const violations=await page.evaluate(async()=> (await axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag22aa','best-practice']})).violations.map(v=>`${v.id}: ${v.nodes.map(n=>n.target).join(',')}`));assert.deepEqual(violations,[],`${colorScheme} ${width}: accessibility`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no sideways overflow');
   const small=await page.locator('.area-tabs button,.area-filters button,.area-filters input,.area-filters select,.area-map-actions button,#area-navigate,#area-close,.area-rate-marker').evaluateAll(nodes=>nodes.filter(n=>n.offsetParent!==null).map(n=>({id:n.id||n.className,rect:n.getBoundingClientRect()})).filter(n=>n.rect.width<48||n.rect.height<48).map(n=>n.id));assert.deepEqual(small,[],`${width} touch targets`);
   await page.click('#area-close');
 }
 // Postcode-only screenshots can gain approximate pickup positions on request.
 const unmapped=jobs.slice(0,6).map(d=>({...d,placeId:null,offerDetails:{pickup:'Shop, M5 3AA',dropoffs:['Customer, M1 1AA']}}));
 await page.evaluate(jobs=>{localStorage.setItem('sp.deliveries',JSON.stringify(jobs));localStorage.setItem('sp.places','[]');},unmapped);await page.reload();assert.equal(lookups,0);await page.click('#area-resolve');await page.waitForFunction(()=>document.querySelector('#area-lookup-status')?.textContent.includes('saved.'));assert.equal(lookups,1,'one request for shared pickup postcode');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('sp.deliveries')));assert.ok(saved.every(d=>d.pickupLocation.postcode==='M5 3AA'));await page.click('#area-all');await page.locator('.area-rate-marker').click();assert.match(await page.textContent('#area-selection'),/Postcode centre · branch unconfirmed/);
 await page.reload();await page.click('#area-all');assert.equal(await page.locator('.area-rate-marker').count(),1,'derived map survives reload');assert.equal(lookups,1,'saved coordinates do not refetch');
 // Existing backup format preserves new coordinate/provenance fields.
 page.on('dialog',dialog=>dialog.accept());await page.goto(BASE+'#settings');const downloading=page.waitForEvent('download');await page.click('#backup');const backup=JSON.parse(fs.readFileSync(await(await downloading).path(),'utf8'));assert.equal(backup.deliveries[0].pickupLocation.source,'postcode');await page.click('#restore');await page.setInputFiles('#file',{name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.waitForFunction(()=>document.querySelector('#toast')?.textContent==='Backup restored');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sp.deliveries'))[0].pickupLocation.postcode),'M5 3AA');await page.goto(BASE+'#areas');
 // Geocoding failure is recoverable and leaves original records unchanged.
 await context.unroute('https://api.postcodes.io/**');await context.route('https://api.postcodes.io/**',r=>r.fulfill({status:503,body:'unavailable'}));await page.evaluate(jobs=>localStorage.setItem('sp.deliveries',JSON.stringify(jobs)),unmapped);await page.reload();await page.click('#area-resolve');await page.waitForFunction(()=>document.querySelector('#area-lookup-status')?.textContent.includes('try again'));assert.equal(await page.locator('#area-resolve').isEnabled(),true);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sp.deliveries')).some(d=>d.pickupLocation)),false);
 if(process.env.SCREENSHOT_DIR){
   await context.unroute('https://tile.openstreetmap.org/**');
   await page.evaluate(({jobs,places})=>{localStorage.setItem('sp.deliveries',JSON.stringify(jobs));localStorage.setItem('sp.places',JSON.stringify(places));},{jobs,places});
   await page.setViewportSize({width:393,height:850});await page.reload();await page.click('#area-all');
   await page.waitForFunction(()=>document.querySelector('.leaflet-tile-loaded'),{},{timeout:8000}).catch(()=>{});
   for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await page.locator('.area-rate-marker').first().click();await page.screenshot({path:require('node:path').join(process.env.SCREENSHOT_DIR,`areas-live-${theme}.png`),fullPage:true});await page.click('#area-close');}
 }
 assert.deepEqual(errors,[]);await context.close();
 // App-shell assets are cached. Statistics still work if map tiles are offline.
 const offline=await browser.newContext({...devices['Pixel 7']});const op=await offline.newPage();await op.goto(BASE);await op.evaluate(()=>navigator.serviceWorker.ready);await op.evaluate(({settings,places,shifts,jobs})=>{for(const [key,value] of Object.entries({'sp.settings':settings,'sp.places':places,'sp.shifts':shifts,'sp.deliveries':jobs}))localStorage.setItem(key,JSON.stringify(value));},{settings,places,shifts,jobs});await op.reload();await offline.setOffline(true);await op.goto(BASE+'#areas');await op.click('#area-all');assert.equal(await op.locator('.area-rate-marker').count(),2);await op.locator('.area-rate-marker').first().click();assert.ok(await op.locator('#area-navigate').getAttribute('href'));await offline.close();
 console.log('Areas UI passed: filters, empty history, Google Maps/parking, notebook, 320–560 px light/dark accessibility, postcode lookup/retry/persistence, offline shell and statistics.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
