'use strict';

// Observed pickup-area job profitability, not demand or whole-shift earnings.
// Stable 250 m-radius hexagons keep areas independent of filters/history growth.
const EarningsAreas = (() => {
  const RADIUS = 250, MIN_JOBS = 5, MIN_SHIFTS = 3;
  const LAT_METRES = 111320, LON_METRES = LAT_METRES * Math.cos(53.48 * Math.PI / 180);
  const number = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) ? Number(value) : null;
  const point = value => {
    if (!value) return null;
    const lat = number(value.lat), lng = number(value.lng);
    return lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? {lat, lng} : null;
  };
  function cell(location) {
    const x = location.lng * LON_METRES, y = location.lat * LAT_METRES;
    const q = (Math.sqrt(3) / 3 * x - y / 3) / RADIUS, r = y * 2 / 3 / RADIUS;
    let a = Math.round(q), b = Math.round(-q-r), c = Math.round(r);
    const da = Math.abs(a-q), db = Math.abs(b+q+r), dc = Math.abs(c-r);
    if (da > db && da > dc) a = -b-c;
    else if (db > dc) b = -a-c;
    else c = -a-b;
    return {id:`${a}:${c}`, lat:RADIUS * 1.5 * c / LAT_METRES, lng:RADIUS * Math.sqrt(3) * (a+c/2) / LON_METRES};
  }
  function pickup(delivery, places) {
    const place = places.find(p => p.id === delivery.placeId);
    const recorded = point(delivery.pickupLocation);
    const known = point(place?.loc), parking = point(place?.spot);
    const location = recorded || known || parking;
    if (!location) return null; // Never substitute the customer's completion GPS.
    const approximate = recorded ? delivery.pickupLocation.source === 'postcode' : !!place?.postcodeOnly;
    return {location, place, approximate, label:place?.area || delivery.pickupLocation?.postcode || place?.name || delivery.restaurantName || 'Pickup area',
      destination:parking || known || location,
      destinationName:place?.name || delivery.restaurantName || delivery.pickupLocation?.postcode || 'Pickup',
      destinationKind:parking ? 'Saved parking spot' : approximate ? 'Postcode centre · branch unconfirmed' : 'Recorded pickup · parking unverified'};
  }
  function matches(at, options) {
    if (options.range === 'all') return true;
    const minutes = at.getHours()*60 + at.getMinutes();
    const target = options.minutes;
    const within = day => {const distance=Math.abs(at.getDay()*1440+minutes-(day*1440+target));return Math.min(distance,10080-distance)<=60;};
    return options.range === 'weekday' ? [1,2,3,4,5].some(within) : within(options.day);
  }
  function build(deliveries, places, shifts, settings, options = {}) {
    const now = new Date(options.now ?? Date.now());
    const filter = {range:'window',day:now.getDay(),minutes:now.getHours()*60+now.getMinutes(),provider:'all',...options};
    const groups = new Map(), seen = new Set();
    const report = {missingLocation:0, invalid:0, usable:0, matching:0, approximate:0};
    for (const d of deliveries) {
      if (!d || !d.id || seen.has(d.id) || (filter.provider !== 'all' && d.platformId !== filter.provider)) continue;
      seen.add(d.id);
      const start = d.acceptedAt ? +new Date(d.acceptedAt) : NaN, end = d.completedAt ? +new Date(d.completedAt) : NaN;
      const fee = number(d.fee), miles = number(d.miles);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > +now || fee === null || miles === null || fee < 0 || miles < 0) { report.invalid++; continue; }
      const found = pickup(d, places);
      if (!found) { report.missingLocation++; continue; }
      const shift = shifts.find(s => s.id && s.id === d.shiftId);
      const historical = d.settings || shift?.settings;
      const config = {...settings,...(historical || {})};
      if(historical && historical.insurancePerHour === undefined && ('insuranceMonthly' in historical || 'otherMonthly' in historical)) delete config.insurancePerHour;
      const mpg = number(config.mpg), fuel = number(config.fuelPrice), maintenance = number(config.maintPence);
      const insurance = insurancePerHour(config);
      if (!(mpg > 0) || fuel === null || fuel < 0 || maintenance === null || maintenance < 0 || !Number.isFinite(insurance) || insurance < 0) { report.invalid++; continue; }
      const hours = (end-start)/3600000;
      const costs = miles * (fuelCostPerMile(config)+maintenance/100) + hours*insurance;
      if (!Number.isFinite(costs)) { report.invalid++; continue; }
      report.usable++;
      if (found.approximate) report.approximate++;
      if (!matches(new Date(start),filter)) continue;
      report.matching++;
      const area = cell(found.location);
      if (!groups.has(area.id)) groups.set(area.id,{...area,jobs:[],shifts:new Set(),gross:0,costs:0,hours:0,labels:new Map(),destinations:new Map(),approximate:0});
      const group = groups.get(area.id);
      group.jobs.push(d); group.gross += fee; group.costs += costs; group.hours += hours;
      if (shift && start >= +new Date(shift.start) && (!shift.end || end <= +new Date(shift.end))) group.shifts.add(shift.id);
      group.labels.set(found.label,(group.labels.get(found.label)||0)+1);
      const key = `${found.destination.lat},${found.destination.lng}`;
      const dest = group.destinations.get(key) || {...found,count:0}; dest.count++; group.destinations.set(key,dest);
      if (found.approximate) group.approximate++;
    }
    const areas = [...groups.values()].filter(g => g.jobs.length >= MIN_JOBS && g.shifts.size >= MIN_SHIFTS).map(g => {
      const rank = items => [...items].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
      const target = [...g.destinations.values()].sort((a,b) => Number(b.destinationKind === 'Saved parking spot')-Number(a.destinationKind === 'Saved parking spot') || b.count-a.count || a.destinationName.localeCompare(b.destinationName))[0];
      const profit = g.gross-g.costs, hourly = profit/g.hours;
      return {id:g.id,lat:g.lat,lng:g.lng,name:rank(g.labels)[0][0],jobs:g.jobs,shiftCount:g.shifts.size,gross:g.gross,costs:g.costs,hours:g.hours,profit,hourly,
        grade:hourly >= settings.goodPerHour ? 'good' : hourly >= settings.okPerHour ? 'ok' : 'poor',target,approximate:g.approximate};
    }).sort((a,b) => b.hourly-a.hourly || a.id.localeCompare(b.id));
    return {areas,report};
  }
  function postcode(delivery, places) {
    const place = places.find(p => p.id === delivery.placeId);
    const text = [place?.postcode,place?.lookupPostcode,delivery.offerDetails?.pickup].filter(Boolean).join(' ');
    const match = text.toUpperCase().match(/\b(?:GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/);
    if (!match) return null;
    const compact = match[0].replace(/\s/g,'');
    return compact.slice(0,-3)+' '+compact.slice(-3);
  }
  return {RADIUS,MIN_JOBS,MIN_SHIFTS,point,cell,pickup,matches,build,postcode};
})();
if (typeof module !== 'undefined') module.exports = EarningsAreas;
