'use strict';

// Local helpers only: no location access, network calls or API credentials.
const TrafficModel = (() => {
  function postcode(text) {
    const matches=[...String(text||'').toUpperCase().matchAll(/\b(?:GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/g)].map(m=>m[0].replace(/\s/g,''));
    const values=[...new Set(matches)];if(values.length!==1)return null;
    const pc=values[0];return pc.slice(0,-3)+' '+pc.slice(-3);
  }
  const normalise=text=>String(text||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  function matchPlace(text,places) {
    const pc=postcode(text),name=normalise(text);if(!pc)return null;
    const candidates=places.filter(p=>!p.postcodeOnly&&normalise(p.name).length>=4&&name.includes(normalise(p.name))&&
      [p.postcode,p.lookupPostcode,p.address].some(value=>postcode(value)===pc));
    return candidates.length===1?candidates[0]:null;
  }
  function stops(settings,place,deliveries,dropoffs) {
    const fallback=Number.isFinite(+settings.trafficWaitMins)?Math.max(0,+settings.trafficWaitMins):8;
    const observations=new Map();
    const valid=mins=>typeof mins==='number'&&Number.isFinite(mins)&&mins>=0&&mins<=1440;
    if(place) {
      const linked=deliveries.filter(d=>d.placeId===place.id);
      for(const d of linked){const mins=deliveryWaitMinutes(d);if(valid(mins)&&(manualWaitMinutes(d)!==null||mins<=90))observations.set(d.id?'job:'+d.id:'at:'+d.collectedAt,mins);}
      for(const w of place.waits||[]){const key=w.orderId?'job:'+w.orderId:'at:'+w.at;if(!observations.has(key)&&valid(w.mins))observations.set(key,w.mins);}
    }
    const samples=[...observations.values()];
    // Lifetime arithmetic mean after three independent recorded collections.
    const wait=samples.length>=3?samples.reduce((sum,mins)=>sum+mins,0)/samples.length:fallback;
    const handover=Math.max(0,Number(settings.handoverMins)||0)*dropoffs;
    return {wait,handover,total:wait+handover,samples:samples.length,learned:samples.length>=3,placeName:place?.name||'',dropoffs};
  }
  function routeValues(response) {
    if(response.fallbackInfo?.routingMode==='TRAFFIC_UNAWARE')throw Error('Live traffic unavailable. Using the mileage estimate.');
    const r=response.routes?.[0];
    if(!r||!Number.isFinite(r.durationMillis)||r.durationMillis<0||r.durationMillis>43200000||!Number.isFinite(r.distanceMeters)||r.distanceMeters<0)throw Error('No usable driving route returned. Using the mileage estimate.');
    return {minutes:r.durationMillis/60000,metres:r.distanceMeters};
  }
  return {postcode,matchPlace,stops,routeValues};
})();
if(typeof module!=='undefined')module.exports=TrafficModel;
