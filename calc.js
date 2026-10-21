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
  const taxReserve = Math.max(0, profit) * ((Number(s.taxPct) || 0) / 100);
  const takeHome = profit - taxReserve;

  return {
    hours, miles, earnings, litres, fuel, maintenance, insurance, costs, profit, taxReserve, takeHome,
    grossPerHour: hours > 0 ? earnings / hours : 0,
    profitPerHour: hours > 0 ? profit / hours : 0,
    takeHomePerHour: hours > 0 ? takeHome / hours : 0,
    profitPerMile: miles > 0 ? profit / miles : 0,
  };
}

function sumResults(results) {
  const t = { hours: 0, miles: 0, earnings: 0, fuel: 0, maintenance: 0, insurance: 0, costs: 0, profit: 0, taxReserve: 0, takeHome: 0 };
  for (const r of results) for (const k in t) t[k] += r[k];
  t.profitPerHour = t.hours > 0 ? t.profit / t.hours : 0;
  t.takeHomePerHour = t.hours > 0 ? t.takeHome / t.hours : 0;
  return t;
}

if (typeof module !== 'undefined') {
  module.exports = { LITRES_PER_UK_GALLON, insurancePerHour, fuelCostPerMile, calcShift, sumResults };
}
