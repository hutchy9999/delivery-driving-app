// Pure calculation helpers. No DOM access, so they can be tested on their own.

const LITRES_PER_UK_GALLON = 4.54609;

// Pay-as-you-go insurance (e.g. Zego) is charged per hour on shift.
// Shifts saved before this setting existed used monthly costs spread over
// expected weekly hours, so those keep their original figure.
function insurancePerHour(s) {
  if (s.insurancePerHour !== undefined) return Number(s.insurancePerHour) || 0;
  const monthly = (Number(s.insuranceMonthly) || 0) + (Number(s.otherMonthly) || 0);
  const hoursPerMonth = ((Number(s.hoursPerWeek) || 0) * 52) / 12;
  return hoursPerMonth > 0 ? monthly / hoursPerMonth : 0;
}

function fuelCostPerMile(s) {
  const mpg = Number(s.mpg) || 0;
  return mpg > 0 ? (Number(s.fuelPrice) * LITRES_PER_UK_GALLON) / mpg : 0;
}

// shift: { start, end, miles, earnings, settings }  (settings = snapshot at time of shift)
function calcShift(shift) {
  const s = shift.settings;
  const hours = Math.max(0, (new Date(shift.end) - new Date(shift.start)) / 3600000);
  const miles = Math.max(0, Number(shift.miles) || 0);
  const earnings = Number(shift.earnings) || 0;
  const mpg = Number(s.mpg) || 0;

  const litres = mpg > 0 ? (miles / mpg) * LITRES_PER_UK_GALLON : 0;
  const fuel = litres * (Number(s.fuelPrice) || 0);
  const maintenance = miles * ((Number(s.maintPence) || 0) / 100);
  const insurance = hours * insurancePerHour(s);
  const costs = fuel + maintenance + insurance;
  const profit = earnings - costs;

  return {
    hours, miles, earnings, litres, fuel, maintenance, insurance, costs, profit,
    grossPerHour: hours > 0 ? earnings / hours : 0,
    profitPerHour: hours > 0 ? profit / hours : 0,
    profitPerMile: miles > 0 ? profit / miles : 0,
  };
}

// Estimate for a single order offer. If the offer doesn't give a time, it's
// estimated from the miles at town speed plus time stopped: the restaurant's
// own average wait when known, otherwise the general stop time.
function calcOrder(s, fee, miles, minutes, avgWait = null) {
  const estimated = !(minutes > 0);
  const mph = Number(s.townMph) || 0;
  const stops = avgWait !== null ? avgWait + (Number(s.handoverMins) || 0) : Number(s.stopMins) || 0;
  const mins = estimated ? (mph > 0 ? (miles / mph) * 60 : 0) + stops : minutes;
  if (!(mins > 0)) return null;
  const costs = miles * (fuelCostPerMile(s) + (Number(s.maintPence) || 0) / 100) + (mins / 60) * insurancePerHour(s);
  const profit = fee - costs;
  const hourly = (profit / mins) * 60;
  const grade = hourly >= (Number(s.goodPerHour) || 0) ? 'good' : hourly >= (Number(s.okPerHour) || 0) ? 'ok' : 'poor';
  return { mins, estimated, costs, profit, hourly, grade };
}

function sumResults(results) {
  const t = { hours: 0, miles: 0, earnings: 0, fuel: 0, maintenance: 0, insurance: 0, costs: 0, profit: 0 };
  for (const r of results) for (const k in t) t[k] += r[k];
  t.profitPerHour = t.hours > 0 ? t.profit / t.hours : 0;
  return t;
}

// Build per-event profit, not a sum of order hourly-rate estimates. A live shift
// uses completed offers' miles and full elapsed insurance. Saved shift totals
// reconcile to actual earnings/miles; intermediate vehicle-cost allocations are
// estimates. No timings are invented for shifts without delivery records.
function profitTimeline(shifts, deliveries, active, settings, now = Date.now()) {
  const events = [];
  const finished = shifts.filter((s) => Number.isFinite(+new Date(s.start)) && Number.isFinite(+new Date(s.end)) && +new Date(s.end) <= now);
  const sessions = [...finished.map((s) => ({ ...s, live: false }))];
  if (active && !finished.some((s) => active.id && s.id === active.id)) sessions.push({ ...active, end: new Date(now).toISOString(), settings, live: true });
  sessions.forEach((s, index) => {
    const start = +new Date(s.start), end = +new Date(s.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > now || end < start) return;
    const config = s.settings || settings;
    const jobs = s.id ? deliveries.filter((d) => d.shiftId === s.id && +new Date(d.completedAt) >= start && +new Date(d.completedAt) <= end)
      .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt)) : [];
    const milesOf = (d) => Math.max(0, Number(d.miles) || 0);
    const offerMiles = jobs.reduce((total, d) => total + milesOf(d), 0);
    const running = fuelCostPerMile(config) + (Number(config.maintPence) || 0) / 100;
    const totalMiles = s.live ? offerMiles : Math.max(0, Number(s.miles) || 0);
    let earnings = 0, miles = 0, incomplete = false;
    const emit = (at, key, label, values) => events.push({ at, key: `${index}:${key}`, label, session: index, ...values });
    emit(start, 'start', 'Shift started', { earnings: 0, vehicle: 0, insurance: 0, estimated: s.live, incomplete: false });
    jobs.forEach((d, job) => {
      earnings += Number(d.fee) || 0;
      miles += milesOf(d);
      if (d.fee === '' || d.fee == null || !Number.isFinite(Number(d.fee)) || d.miles === '' || d.miles == null || !Number.isFinite(Number(d.miles))) incomplete = true;
      const at = +new Date(d.completedAt);
      const portion = offerMiles > 0 ? miles / offerMiles : end > start ? (at - start) / (end - start) : 0;
      emit(at, d.id || `job-${job}`, `Delivery ${job + 1}${d.restaurantName ? ' · ' + d.restaurantName : ''}`, {
        earnings, vehicle: (s.live ? miles : totalMiles * portion) * running,
        insurance: Math.max(0, at - start) / 3600000 * insurancePerHour(config), estimated: true, incomplete,
      });
    });
    if (s.live) emit(end, 'now', 'Now · shift in progress', { earnings, vehicle: totalMiles * running,
      insurance: Math.max(0, end - start) / 3600000 * insurancePerHour(config), estimated: true, incomplete });
    else {
      const result = calcShift({ ...s, settings: config });
      emit(end, 'end', 'Shift saved · reconciled', { earnings: result.earnings, vehicle: result.fuel + result.maintenance,
        insurance: result.insurance, estimated: false, incomplete: false });
    }
  });
  const states = new Map();
  return events.sort((a, b) => a.at - b.at || a.session - b.session).map((event) => {
    states.set(event.session, event);
    const values = [...states.values()];
    const total = (key) => values.reduce((sum, value) => sum + value[key], 0);
    const earnings = total('earnings'), vehicle = total('vehicle'), insurance = total('insurance');
    return { ...event, earnings, vehicle, insurance, costs: vehicle + insurance, profit: earnings - vehicle - insurance,
      estimated: values.some((value) => value.estimated), incomplete: values.some((value) => value.incomplete) };
  });
}

// Review only explicitly linked deliveries. Merge clipped intervals so overlapping
// jobs never double-count time; missing timestamps are not invented.
function manualWaitMinutes(delivery) {
  const value = delivery.manualWaitMins;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function deliveryWaitMinutes(delivery) {
  const manual = manualWaitMinutes(delivery);
  if (manual !== null) return manual;
  if (!delivery.arrivedAt || !delivery.collectedAt) {
    const stop=delivery.collectionStop;
    return stop?.source==='native-gps'&&stop.eligible===true&&Number.isFinite(stop.minutes)&&stop.minutes>=0&&stop.minutes<=90?stop.minutes:null;
  }
  const mins = (new Date(delivery.collectedAt) - new Date(delivery.arrivedAt)) / 60000;
  return Number.isFinite(mins) && mins >= 0 ? mins : null;
}
function calcShiftReview(shift, deliveries) {
  const start = +new Date(shift.start), end = +new Date(shift.end);
  const jobs = shift.id ? deliveries.filter(d => d.shiftId === shift.id &&
    +new Date(d.completedAt) >= start && +new Date(d.completedAt) <= end) : [];
  const interval = (a, b) => {
    if (!a || !b) return null;
    const from = +new Date(a), to = +new Date(b);
    return Number.isFinite(from) && Number.isFinite(to) && to >= from && to >= start && from <= end
      ? [Math.max(start, from), Math.min(end, to)] : null;
  };
  const mergedHours = intervals => {
    let total = 0, last = null;
    for (const item of intervals.sort((a, b) => a[0] - b[0])) {
      if (last && item[0] <= last[1]) last[1] = Math.max(last[1], item[1]);
      else { if (last) total += last[1] - last[0]; last = [...item]; }
    }
    if (last) total += last[1] - last[0];
    return total / 3600000;
  };
  const timed = jobs.map(d => interval(d.acceptedAt, d.completedAt)).filter(Boolean);
  const manualWaits = jobs.filter(d => manualWaitMinutes(d) !== null);
  const waits = jobs.filter(d => manualWaitMinutes(d) === null).map(d => interval(d.arrivedAt, d.collectedAt)||
    (d.collectionStop?.eligible?interval(d.collectionStop.arrivedAt,d.collectionStop.departedAt):null)).filter(Boolean);
  const mileage = jobs.filter(d => d.miles !== '' && d.miles != null && Number.isFinite(+d.miles) && +d.miles >= 0);
  const hours = Math.max(0, (end - start) / 3600000);
  const offerMiles = mileage.reduce((sum, d) => sum + +d.miles, 0);
  return { count: jobs.length, perHour: hours > 0 ? jobs.length / hours : 0,
    timedCount: timed.length, waitCount: waits.length + manualWaits.length, manualWaitCount:manualWaits.length,
    waitHours: mergedHours(waits) + manualWaits.reduce((sum,d) => sum + manualWaitMinutes(d)/60,0),
    outsideHours: timed.length ? Math.max(0, hours - mergedHours(timed)) : null,
    mileageCount: mileage.length, offerMiles,
    mileageDifference: jobs.length && mileage.length === jobs.length ? +shift.miles - offerMiles : null };
}

if (typeof module !== 'undefined') {
  module.exports = { LITRES_PER_UK_GALLON, insurancePerHour, fuelCostPerMile, calcShift, calcOrder, sumResults, profitTimeline, calcShiftReview, manualWaitMinutes, deliveryWaitMinutes };
}
