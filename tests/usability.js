const { chooseProvider } = require('./provider-helper');
const {chromium}=require('playwright');const assert=require('node:assert/strict');const path=require('node:path');
(async()=>{const browser=await chromium.launch();try{
const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,timezoneId:'Europe/London',serviceWorkers:'block'});
const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await page.goto('http://localhost:8765/');const settings={fuelPrice:1.4,mpg:45,maintPence:5,insurancePerHour:1.16};
const start=new Date(Date.now()-7200000).toISOString();const active={id:'review',start,startOdo:'48210'};
const place={id:'p',name:'Example Kitchen',address:'High Street, Manchester',note:'Use the side entrance. Collect upstairs.',waits:[{at:start,mins:7}],parkType:'street',parkLimit:'30',ease:'tricky'};
const seed=async(extra={},hash='home')=>{await page.evaluate(({settings,extra,place})=>{localStorage.clear();const values={'sp.settings':settings,'sp.platform':'just-eat','sp.places':[place],...extra};for(const[k,v]of Object.entries(values))localStorage.setItem(k,JSON.stringify(v));},{settings,extra,place});await page.goto('http://localhost:8765/#'+hash);await page.reload();};
const shot=async name=>{if(process.env.SCREENSHOT_DIR){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'mobile-polish-'+name+'.png'),scale:'css'});}};
await seed();const emptyGraph=await page.locator('#chart').boundingBox(),netCard=await page.locator('#net-today').boundingBox(),startButton=await page.locator('#start').boundingBox();assert.ok(emptyGraph.y<netCard.y&&netCard.y<startButton.y,'graph then net earnings then Start');assert.equal(await page.locator('#chart svg').count(),1);assert.equal(await page.locator('#chart-previous').count(),0);assert.equal(await page.locator('#platform-selector').count(),0);assert.equal(await page.locator('#net-today h2').innerText(),'Net earnings today');await shot('start');
await page.goto('http://localhost:8765/#settings');assert.equal(await page.locator('[data-platform="just-eat"]').getAttribute('aria-pressed'),'true');await shot('settings');await page.goto('http://localhost:8765/#home');
const jobs=[5.5,7,5,4,7,6].map((fee,i)=>({id:'d'+i,shiftId:'review',fee,miles:3,completedAt:new Date(+new Date(start)+(i*18+17)*60000).toISOString(),platformId:i%3===1?'deliveroo':'just-eat'}));
await seed({'sp.active':active,'sp.deliveries':jobs});const end=await page.locator('#end').boundingBox(),chart=await page.locator('#chart').boundingBox();assert.ok(chart.y<(await page.locator('#net-today').boundingBox()).y&&chart.y<end.y);assert.equal(await page.locator('#cancel').isVisible(),false);await shot('shift');
await page.click('.shift-options summary');assert.ok(await page.locator('#cancel').isVisible());await page.keyboard.press('Escape');assert.equal(await page.locator('#cancel').isVisible(),false);
await page.click('.shift-options summary');await page.click('.chart-heading');assert.equal(await page.locator('#cancel').isVisible(),false);
await page.emulateMedia({colorScheme:'dark'});await shot('shift-dark');await page.emulateMedia({colorScheme:'light'});
await seed({'sp.active':active},'order');const positions=[];
for(const [fee,miles]of [['',''],['7','3'],['2','3'],['5','3']]){await page.fill('[name=fee]',fee);await page.fill('[name=miles]',miles);positions.push((await page.locator('#take').boundingBox()).y);}
assert.ok(Math.max(...positions)-Math.min(...positions)<3,'offer result must not move acceptance while entering common offers: '+positions);
assert.equal(await page.locator('[name=mins]').isVisible(),false);await page.fill('[name=fee]','7');await page.locator('[name=fee]').blur();await shot('offer');
await page.click('.offer-extra summary');await page.fill('[name=mins]','20');await page.reload();assert.equal(await page.locator('[name=mins]').inputValue(),'20');assert.ok(await page.locator('[name=mins]').isVisible());
const order={step:'pickup',id:'accepted',acceptedAt:new Date().toISOString(),placeId:'p',platformId:'just-eat',platformName:'Just Eat',shiftId:'review',restaurantName:place.name,fee:'7',miles:'3'};
await seed({'sp.active':active,'sp.order':order},'order');const arrive=await page.locator('#arrived').boundingBox(),spot=await page.locator('#spot').boundingBox();assert.ok(arrive.y<spot.y);assert.ok((await page.locator('#arrived').getAttribute('class')).includes('primary'));assert.ok(!(await page.locator('#spot').getAttribute('class')).includes('primary'));assert.equal(await page.locator('.order-platform-context p').count(),0);await shot('pickup');
await chooseProvider(page, 'deliveroo');assert.ok((await page.locator('.order-platform-context').innerText()).includes('Current order: Just Eat'));
await page.click('[data-tab="home"]');await page.locator('.resume-order').waitFor();assert.equal(await page.locator('.resume-order').count(),1);await page.click('#end');await page.locator('#unfinished-order').waitFor();await shot('guard');
await page.click('#unfinished-order a');await page.click('#cancel-pickup');await page.locator('#take').waitFor();assert.equal(await page.evaluate(()=>JSON.parse(localStorage['sp.order']).acceptedAt||null),null);
assert.deepEqual(errors,[]);console.log('Mobile usability checks passed: action placement, stable offer layout, optional time persistence, pickup hierarchy, resume order and pending-order recovery.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
