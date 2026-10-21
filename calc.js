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
// estimated from the miles at town speed plus time stopped at each end.
function calcOrder(s, fee, miles, minutes) {
  const estimated = !(minutes > 0);
  const mph = Number(s.townMph) || 0;
  const mins = estimated ? (mph > 0 ? (miles / mph) * 60 : 0) + (Number(s.stopMins) || 0) : minutes;
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

if (typeof module !== 'undefined') {
  module.exports = { LITRES_PER_UK_GALLON, insurancePerHour, fuelCostPerMile, calcShift, calcOrder, sumResults };
}
