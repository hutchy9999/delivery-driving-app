'use strict';

// No account/backend: totals are derived from existing local delivery records.
let disposeAreas = null;
function areaTabs(selected) {
  return `<div class="chips two area-tabs" role="group" aria-label="Areas view"><button type="button" data-area-view="map" aria-pressed="${selected === 'map'}">Earnings map</button><button type="button" data-area-view="places" aria-pressed="${selected === 'places'}">Saved places</button></div>`;
}
function bindAreaTabs(view) {
  view.querySelector('[data-area-view="map"]').onclick = () => go('#areas');
  view.querySelector('[data-area-view="places"]').onclick = () => go('#places');
}
function renderAreas(view) {
  const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const line = (label,value) => `<div class="line"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  const now = new Date();
  const state = {range:'window',day:now.getDay(),minutes:now.getHours()*60+now.getMinutes(),provider:'all',selected:null};
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  let map = null, layers = null, observer = null, controller = null, disposed = false, located = null;
  const theme=matchMedia('(prefers-color-scheme: dark)'), themeChanged=()=>draw();
  theme.addEventListener('change',themeChanged);
  disposeAreas = () => { disposed = true; theme.removeEventListener('change',themeChanged); controller?.abort(); observer?.disconnect(); map?.remove(); map = null; };
  const hhmm = value => {const n = (value+1440)%1440;return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};
  const period = () => state.range === 'all' ? 'All days · all times' : `${state.range === 'weekday' ? 'Mon–Fri' : days[state.day]} · ${hhmm(state.minutes-60)}–${hhmm(state.minutes+60)}`;
  view.innerHTML = `${areaTabs('map')}
    <section class="card area-filters" aria-label="Map filters">
      <div class="area-heading"><b id="area-window"></b><button class="btn link" id="area-change" aria-expanded="false" aria-controls="area-time-form">Change time</button></div>
      <form id="area-time-form" hidden><div class="pair"><label class="field"><span>Day</span><select id="area-day">${days.map((day,i)=>`<option value="${i}"${i===state.day?' selected':''}>${day}</option>`).join('')}</select></label><label class="field"><span>Time</span><input id="area-time" type="time" required value="${hhmm(state.minutes)}"></label></div><button class="btn primary" type="submit">Apply time window</button></form>
      <label class="area-provider"><span>Provider</span><select id="area-provider"><option value="all">All platforms</option>${store.platforms.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label>
    </section>
    <div id="area-availability" aria-live="polite"></div>
    <h2 class="area-title">Pickup areas · estimated job profit/hr</h2>
    <div class="area-map-shell"><div id="earnings-map" aria-label="Pickup area earnings map"></div><div class="area-map-actions" role="group" aria-label="Map controls"><button class="btn" id="area-zoom-in" aria-label="Zoom in">+</button><button class="btn" id="area-zoom-out" aria-label="Zoom out">−</button><button class="btn" id="area-locate">Centre on me</button></div></div>
    <p class="muted small" id="area-map-status" role="status"></p>
    <div class="area-legend" aria-label="Earnings colours"><span class="area-good">● ${money(store.settings.goodPerHour)}+/hr</span><span class="area-ok">● ${money(store.settings.okPerHour)}–${money(store.settings.goodPerHour)}/hr</span><span class="area-poor">● Below ${money(store.settings.okPerHour)}/hr</span></div>
    <p class="muted small">Only areas with enough usable records are coloured. Uncoloured areas are unknown.</p>
    <div id="area-selection" aria-live="polite"></div>
    <div id="area-list"></div>
    <div id="area-data-status"></div>
    <details class="card area-method"><summary>How this map works</summary><p>Each circle covers roughly 500 m across. Areas appear after ${EarningsAreas.MIN_JOBS} usable jobs across ${EarningsAreas.MIN_SHIFTS} recorded shifts; this is exploratory evidence, not a confidence score.</p><p>Profit/hr = combined payments minus estimated fuel, maintenance and insurance, divided by combined acceptance-to-completion hours. Historical job/shift cost settings are used where available. It excludes waiting between jobs, repositioning miles not entered on offers, depreciation and tax. This is not whole-shift hourly profit or live demand.</p><p>Time filters use local acceptance times, one hour either side, including neighbouring days across midnight. “All times” is general history. Weekday fallback combines Monday–Friday at the selected time.</p><p>Street tiles load from OpenStreetMap, which receives the map viewport and your IP, not your delivery records. Maps need a connection; local statistics and destination links remain available offline. Postcode lookup sends only pickup postcodes to Postcodes.io when requested. Google Maps receives the selected destination only when you open directions. No background tracking is added.</p></details>`;
  bindAreaTabs(view);
  const $area = selector => view.querySelector(selector);
  const status = message => {$area('#area-map-status').textContent = message;};
  let current = null;
  const analyse = () => EarningsAreas.build(store.deliveries,store.places,[...store.shifts,...(store.active?[store.active]:[])],store.settings,state);
  function selectArea(id, focus = false) {
    state.selected = id;
    const area = current.areas.find(a=>a.id===id), host = $area('#area-selection');
    if (!area) {host.innerHTML='';return;}
    const target = area.target;
    host.innerHTML = `<section class="card area-detail"><div class="area-heading"><h2>${esc(area.name)}</h2><button class="btn link" id="area-close" aria-label="Close area details">Close</button></div>
      <div class="big">${money(area.hourly)}<span>/hr</span></div><p class="muted small">Estimated job profit · before tax</p>
      <p>${count(area.jobs.length,'job')} across ${count(area.shiftCount,'shift')}<br><span class="muted small">${esc(period())} · Limited history</span></p>
      ${line('Payments',money(area.gross))}${line('Estimated costs',money(area.costs))}${line('Recorded job time',duration(area.hours))}
      ${area.approximate?'<p class="muted small">Includes postcode-centre pickups; branches may be unconfirmed.</p>':''}
      <p class="small">Destination: <b>${esc(target.destinationName)}</b><br><span class="muted">${esc(target.destinationKind)}</span></p>
      <a class="btn primary icon" id="area-navigate" href="${directionsUrl(target.destination)}" target="_blank" rel="noopener noreferrer">${PIN_ICON} Navigate in Google Maps</a>
      <details class="area-records"><summary>View recorded jobs</summary>${deliveryHistory(area.jobs)}</details>
      <p class="muted small">Past pickup profitability does not guarantee your next offer. Review and choose directions while safely parked.</p></section>`;
    $area('#area-close').onclick=()=>{state.selected=null;host.innerHTML='';};
    if (focus) {$area('#area-navigate').focus({preventScroll:true});host.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
  }
  function draw() {
    if (!map) return;
    layers.clearLayers();
    const styles = getComputedStyle(document.documentElement);
    const colors = {good:styles.getPropertyValue('--pos').trim(),ok:styles.getPropertyValue('--warn').trim(),poor:styles.getPropertyValue('--neg').trim()};
    for (const area of current.areas) {
      const circle = L.circle([area.lat,area.lng],{radius:EarningsAreas.RADIUS,color:colors[area.grade],fillColor:colors[area.grade],fillOpacity:.35,weight:2}).addTo(layers);
      circle.on('click',()=>selectArea(area.id,true));
      const node=document.createElement('button');node.type='button';node.className=`area-rate-marker area-${area.grade}`;node.textContent=money(area.hourly);node.setAttribute('aria-label',`${area.name}: ${money(area.hourly)} per hour, ${area.jobs.length} jobs. Show area details`);node.onclick=()=>selectArea(area.id,true);
      L.marker([area.lat,area.lng],{keyboard:false,icon:L.divIcon({className:'area-marker-wrap',html:node,iconSize:[80,48],iconAnchor:[40,24]})}).addTo(layers);
    }
    fitAreas();
  }
  function fitAreas() {
    if(map && current?.areas.length)map.fitBounds(L.latLngBounds(current.areas.map(a=>[a.lat,a.lng])).pad(.1),{maxZoom:14,padding:[28,36],animate:false});
  }
  function refresh() {
    current=analyse();
    $area('#area-window').textContent=period();
    const empty=!current.areas.length, broader=state.range!=='window';
    $area('#area-availability').innerHTML=empty||broader?`<section class="card notice"><b>${empty?'No areas have enough data for this window':state.range==='all'?'Showing general history':'Showing weekday history'}</b><p class="small">${empty?'Areas need five usable jobs across three recorded shifts. No circles are shown yet.':state.range==='all'?'All days and times; this is not a match for the selected day/time.':'Combines Monday–Friday; this is not a match for one specific day.'}</p>${state.range!=='all'?'<button class="btn primary" id="area-all">Show all times</button>':''}${state.range==='window'?'<button class="btn" id="area-weekdays">Try same time on weekdays</button>':''}${broader?'<button class="btn link" id="area-specific">Return to this time window</button>':''}</section>`:'';
    const range = (id,value) => {const b=$area(id);if(b)b.onclick=()=>{state.range=value;state.selected=null;refresh();};};
    range('#area-all','all');range('#area-weekdays','weekday');range('#area-specific','window');
    $area('#area-list').innerHTML=current.areas.length?`<details class="card"><summary>Areas list · ${current.areas.length}</summary><div class="area-list-buttons">${current.areas.map(a=>`<button class="btn" data-select-area="${esc(a.id)}"><span>${esc(a.name)}</span><b>${money(a.hourly)}/hr</b></button>`).join('')}</div></details>`:'';
    view.querySelectorAll('[data-select-area]').forEach(b=>b.onclick=()=>selectArea(b.dataset.selectArea,true));
    const report=current.report;
    const candidates=store.deliveries.filter(d=>!EarningsAreas.pickup(d,store.places)&&EarningsAreas.postcode(d,store.places));
    $area('#area-data-status').innerHTML=`<section class="card"><h2>Your map data</h2><p class="small">${count(report.usable,'usable mapped job')} · ${report.matching} in this window</p>${report.missingLocation?`<p class="muted small">${count(report.missingLocation,'job')} missing a pickup position. Completion GPS is not used as the pickup.</p>`:''}${report.invalid?`<p class="muted small">${count(report.invalid,'record')} excluded: missing/invalid fee, miles, cost settings or acceptance/completion times.</p>`:''}${candidates.length?`<button class="btn" id="area-resolve">Locate pickup postcodes (${candidates.length})</button><p class="muted small">Sends pickup postcodes only to Postcodes.io. Postcode centres are approximate; this does not identify a branch. Up to 10 postcodes per attempt.</p>`:'<p class="muted small">Future jobs need a mapped saved pickup or a pickup postcode in their reviewed offer details.</p>'}<p class="small" id="area-lookup-status" role="status"></p></section>`;
    const resolve=$area('#area-resolve');if(resolve)resolve.onclick=resolvePostcodes;
    selectArea(state.selected);draw();
  }
  async function resolvePostcodes() {
    if (controller) return;
    const button=$area('#area-resolve'), output=$area('#area-lookup-status');
    button.disabled=true;controller=new AbortController();
    const requests=new Map();let saved=0,failed=0;
    for(const d of store.deliveries) {if(EarningsAreas.pickup(d,store.places))continue;const pc=EarningsAreas.postcode(d,store.places);if(pc&&!requests.has(pc)&&requests.size<10)requests.set(pc,[]);if(requests.has(pc))requests.get(pc).push(d.id);}
    // Lock filters while resolving so feedback and cancellation stay attached.
    const filters=[...view.querySelectorAll('.area-filters button,.area-filters input,.area-filters select,#area-all,#area-weekdays,#area-specific')];filters.forEach(b=>b.disabled=true);
    for(const [postcode,ids] of requests) {
      if(disposed)break;
      output.textContent=`Locating ${postcode}…`;
      const attempt=new AbortController(), timeout=setTimeout(()=>attempt.abort(),7000);
      const abort=()=>attempt.abort();controller.signal.addEventListener('abort',abort,{once:true});
      try {
        const response=await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`,{signal:attempt.signal});
        if(!response.ok)throw new Error('lookup');const json=await response.json();
        const point=EarningsAreas.point({lat:json.result?.latitude,lng:json.result?.longitude});if(!point)throw new Error('lookup');
        if(disposed)break;
        let changed=0;
        const deliveries=store.deliveries.map(d=>{if(!ids.includes(d.id)||EarningsAreas.pickup(d,store.places)||EarningsAreas.postcode(d,store.places)!==postcode)return d;changed++;return {...d,pickupLocation:{...point,source:'postcode',postcode,resolvedAt:new Date().toISOString()}};});
        store.deliveries=deliveries;saved+=changed;
      } catch {failed++;} finally {clearTimeout(timeout);controller?.signal.removeEventListener('abort',abort);}
    }
    controller=null;
    if(disposed)return;
    filters.forEach(b=>b.disabled=false);refresh();
    $area('#area-lookup-status').textContent=`${count(saved,'pickup position')} saved.${failed?' Some postcodes could not be located; you can try again.':''}`;
  }
  $area('#area-change').onclick=()=>{const form=$area('#area-time-form');form.hidden=!form.hidden;$area('#area-change').setAttribute('aria-expanded',String(!form.hidden));};
  $area('#area-time-form').onsubmit=event=>{event.preventDefault();const value=$area('#area-time').value;if(!/^\d{2}:\d{2}$/.test(value))return;const [h,m]=value.split(':').map(Number);state.day=+$area('#area-day').value;state.minutes=h*60+m;state.range='window';state.selected=null;$area('#area-time-form').hidden=true;$area('#area-change').setAttribute('aria-expanded','false');refresh();};
  $area('#area-provider').onchange=event=>{state.provider=event.target.value;state.selected=null;refresh();};
  if (globalThis.L) {
    const centre=EarningsAreas.point({lat:store.area.lat,lng:store.area.lon})||{lat:53.4808,lng:-2.2426};
    map=L.map($area('#earnings-map'),{zoomControl:false,attributionControl:true,scrollWheelZoom:false,keyboard:false,zoomAnimation:false,markerZoomAnimation:false}).setView([centre.lat,centre.lng],13);
    map.attributionControl.setPrefix(false);
    let loaded=0;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'})
      .on('tileload',()=>{loaded++;if(!disposed)status('');}).on('tileerror',()=>{if(!disposed&&!loaded)status('Street map unavailable. Your local area statistics and destination links are still available below.');}).addTo(map);
    layers=L.layerGroup().addTo(map);observer=new ResizeObserver(()=>{map?.invalidateSize({pan:false});fitAreas();});observer.observe($area('#earnings-map'));
  } else status('Street map could not load. Area statistics and destination links are available below.');
  $area('#area-zoom-in').onclick=()=>map?.zoomIn();$area('#area-zoom-out').onclick=()=>map?.zoomOut();
  $area('#area-locate').onclick=()=>{
    if(!navigator.geolocation)return status('Location is unavailable. You can still pan the map.');
    status('Finding your location…');$area('#area-locate').disabled=true;
    navigator.geolocation.getCurrentPosition(position=>{if(disposed)return;$area('#area-locate').disabled=false;const point=EarningsAreas.point({lat:position.coords.latitude,lng:position.coords.longitude});if(!point)return status('Location unavailable.');map?.setView([point.lat,point.lng],14);if(located)map?.removeLayer(located);if(map)located=L.circleMarker([point.lat,point.lng],{radius:6,color:'#1264c4',fillOpacity:1}).addTo(map);status(`Your position · estimated accuracy ±${Math.ceil(position.coords.accuracy)} m. Not saved.`);},()=>{if(disposed)return;$area('#area-locate').disabled=false;status('Location unavailable or permission blocked. You can still pan the map.');},{enableHighAccuracy:true,timeout:7000,maximumAge:30000});
  };
  refresh();
}
