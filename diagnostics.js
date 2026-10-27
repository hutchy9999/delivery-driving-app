/* Local, bounded diagnostics. Only explicitly allowed scalar fields are recorded. */
(function(root){
  'use strict';
  const KEY='sp.diagnostics',LIMIT=1500,AGE=7*86400000;
  const fields=new Set(['count','samples','gaps','ms','accuracy','eligible','active','accepted','feeFound','milesFound','pickupFound','dropoffs','warnings','bytes','online','visible','width','height','native','stage','status','error','line','column','file']);
  const stages=new Set(['offer','pickup','waiting','deliver','unknown']);
  let lastWorkflow='',lastRoute='';
  function entries(){try{const value=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(value)?value.filter(e=>e&&typeof e.at==='number'&&e.at>Date.now()-AGE&&/^[a-z_]{1,40}$/.test(e.code)).slice(-LIMIT).map(e=>({at:e.at,code:e.code,...safe(e)})):[];}catch{return [];}}
  function safe(data={}){const out={};for(const [key,value]of Object.entries(data)){
    if(!fields.has(key))continue;
    if(typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))out[key]=value;
    else if(key==='stage'&&stages.has(value))out[key]=value;
    else if(key==='status'&&['idle','finding','routing','ready','fallback','paused','recording','off','unknown'].includes(value))out[key]=value;
    else if(key==='error'&&['Error','TypeError','RangeError','SyntaxError','ReferenceError','AbortError','QuotaExceededError','SecurityError','NotAllowedError','TimeoutError'].includes(value))out[key]=value;
    else if(key==='file'&&['app.js','calc.js','native-tracking.js','diagnostics.js','traffic.js','traffic-model.js','traffic-settings.js','offer-ocr.js','areas.js','areas-ui.js'].includes(value))out[key]=value;
  }return out;}
  function record(code,data){if(!/^[a-z_]{1,40}$/.test(code))return;try{const list=entries();list.push({at:Date.now(),code,...safe(data)});localStorage.setItem(KEY,JSON.stringify(list.slice(-LIMIT)));}catch{/* Logging must never prevent a delivery save. */}}
  function workflow(){
    const stage=stages.has(store.order?.step)?store.order.step:'unknown';
    const value={stage,active:!!store.active,accepted:!!store.order?.acceptedAt,count:store.deliveries.length};
    const fingerprint=JSON.stringify(value);if(fingerprint!==lastWorkflow){record('workflow',value);lastWorkflow=fingerprint;}
    const route=(location.hash||'#home').split('/')[0];if(route!==lastRoute){record('screen',{width:innerWidth,height:innerHeight});lastRoute=route;}
  }
  function report(){return {app:'shift-profit-diagnostics',version:1,build:root.NativeTracking?'android-trial-0.1.0':'web-v33',exportedAt:new Date().toISOString(),scope:'Up to 7 days / latest 1500 browser events and 5000 native events. No addresses, coordinates, screenshots, fees or API keys.',environment:{native:!!root.NativeTracking,online:navigator.onLine,width:innerWidth,height:innerHeight},events:entries()};}
  async function exportLog(){record('diagnostics_export');const text=JSON.stringify(report(),null,2),filename='shift-profit-diagnostics-'+new Date().toISOString().slice(0,10)+'.json';
    const saved=root.NativeTracking?await root.NativeTracking.exportFile(filename,text,'application/json',false,true):await download(filename,text,'application/json');
    if(saved)toast('Diagnostics saved. You can share this file for review.');
  }
  function decorate(){if(location.hash!=='#settings')return;let card=document.getElementById('diagnostics-settings');if(card)return;
    card=document.createElement('section');card.id='diagnostics-settings';card.className='card';card.innerHTML='<h2>Diagnostics</h2><p class="muted small">Local technical events help investigate glitches, GPS gaps and pickup estimates. Keeps up to seven days within a fixed size limit. The shared log excludes addresses, exact locations, screenshots and your Google key. Your private data backup is separate.</p><button class="btn" id="diagnostics-export">Download diagnostics log</button><button class="btn" id="diagnostics-clear">Clear diagnostics log</button><p class="small" id="diagnostics-status" role="status"></p>';
    document.getElementById('view').append(card);card.querySelector('#diagnostics-export').onclick=exportLog;
    card.querySelector('#diagnostics-clear').onclick=async()=>{if(!confirm('Clear technical diagnostics? Your shifts, deliveries and GPS history will remain.'))return;localStorage.removeItem(KEY);try{await root.Capacitor?.Plugins?.ShiftTracker?.clearDiagnostics();card.querySelector('#diagnostics-status').textContent='Diagnostics cleared';}catch{card.querySelector('#diagnostics-status').textContent='Could not clear native diagnostics. Try again.';}};
  }
  function rendered(){workflow();queueMicrotask(decorate);}
  root.addEventListener('error',event=>record('javascript_error',{error:event.error?.name||'Error',file:String(event.filename||'').split('?')[0].split('/').at(-1),line:event.lineno,column:event.colno}));
  root.addEventListener('unhandledrejection',event=>record('unhandled_promise',{error:event.reason?.name||'Error'}));
  root.addEventListener('online',()=>record('connectivity',{online:true}));root.addEventListener('offline',()=>record('connectivity',{online:false}));
  document.addEventListener('visibilitychange',()=>record('visibility',{visible:!document.hidden}));
  if(root.OfferOCR){const read=root.OfferOCR.read;root.OfferOCR.read=async function(file,...args){const started=performance.now();record('screenshot_started',{bytes:file?.size||0});try{const result=await read.call(this,file,...args);record('screenshot_read',{ms:Math.round(performance.now()-started),feeFound:result.fee!=null,milesFound:result.miles!=null,pickupFound:!!result.pickup,dropoffs:result.dropoffs?.length||0,warnings:result.warnings?.length||0});return result;}catch(error){record('screenshot_failed',{ms:Math.round(performance.now()-started),error:error.name});throw error;}};}
  root.Diagnostics={record,rendered,report,exportLog};
  record('app_open',{native:!!root.Capacitor?.isNativePlatform?.(),online:navigator.onLine});
})(window);
