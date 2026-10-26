'use strict';

// ---------- Storage ----------

const KEYS = { settings: 'sp.settings', shifts: 'sp.shifts', deliveries: 'sp.deliveries', active: 'sp.active', places: 'sp.places', order: 'sp.order', area: 'sp.area', lastBackup: 'sp.lastBackup', platforms: 'sp.platforms', platform: 'sp.platform' };

const DEFAULT_PLATFORMS = [{ id: 'just-eat', name: 'Just Eat' }, { id: 'deliveroo', name: 'Deliveroo' }];

function normalisePlatforms(value) {
  const result = DEFAULT_PLATFORMS.map((p) => ({ ...p }));
  for (const p of Array.isArray(value) ? value : []) {
    if (!p || typeof p.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(p.id) || p.id === 'all' || typeof p.name !== 'string') continue;
    const name = p.name.trim().slice(0, 40);
    if (!name || name.toLowerCase() === 'all' || result.some((x) => x.id === p.id || x.name.toLowerCase() === name.toLowerCase())) continue;
    result.push({ id: p.id, name });
  }
  return result;
}

const DEFAULT_SETTINGS = {
  fuelPrice: 1.40,      // £ per litre
  mpg: 45,              // UK MPG
  maintPence: 5,        // pence per mile (tyres, servicing, wear)
  insurancePerHour: 1.16, // £ per hour on shift (pay-as-you-go, e.g. Zego)
  goodPerHour: 12,      // order calculator: £/hr from which an order is worth taking
  okPerHour: 10,        // order calculator: £/hr from which an order is borderline
  townMph: 15,          // order calculator: average speed to estimate minutes
  stopMins: 8,          // order calculator: restaurant wait, parking, handover (restaurant not timed yet)
  handoverMins: 3,      // order calculator: parking and handover, added to a restaurant's average wait
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
}

const store = {
  get settings() { return { ...DEFAULT_SETTINGS, ...load(KEYS.settings, {}) }; },
  set settings(v) { save(KEYS.settings, v); },
  get hasSettings() { return localStorage.getItem(KEYS.settings) !== null; },
  get shifts() { return load(KEYS.shifts, []); },
  set shifts(v) { save(KEYS.shifts, v); },
  get deliveries() { return load(KEYS.deliveries, []); },
  set deliveries(v) { save(KEYS.deliveries, v); },
  get active() { return load(KEYS.active, null); },
  set active(v) { save(KEYS.active, v); },
  get places() { return load(KEYS.places, []); },
  set places(v) { save(KEYS.places, v); },
  get order() { return { ...EMPTY_ORDER, ...load(KEYS.order, {}) }; },
  get area() { return load(KEYS.area, null) || DEFAULT_AREA; },
  set area(v) { save(KEYS.area, v); },
  set order(v) { save(KEYS.order, v); },
  get lastBackup() { return load(KEYS.lastBackup, null); },
  set lastBackup(v) { save(KEYS.lastBackup, v); },
  get platforms() { return normalisePlatforms(load(KEYS.platforms, [])); },
  set platforms(v) { save(KEYS.platforms, normalisePlatforms(v)); },
  get platform() {
    const id = load(KEYS.platform, 'just-eat');
    if (id === 'all') return load('sp.providerSettings', false) ? 'all' : 'just-eat';
    return store.platforms.some((p) => p.id === id) ? id : 'just-eat';
  },
  set platform(v) { save(KEYS.platform, v); save('sp.providerSettings', true); },
  get chartRange() { return load('sp.chartRange', 'today') === 'fortnight' ? 'fortnight' : 'today'; },
  set chartRange(v) { save('sp.chartRange', v); },
};

// ---------- Formatting ----------

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const money = (n) => gbp.format(n || 0);
const num = (n, dp = 1) => (n || 0).toLocaleString('en-GB', { maximumFractionDigits: dp });

function duration(hours) {
  const mins = Math.round(hours * 60);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

function dateLabel(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// Value for <input type="datetime-local"> in local time.
function toLocalInput(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const $ = (sel, root = document) => root.querySelector(sel);

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 2500);
}

const PIN_ICON = '<svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';

const LONG_SHIFT_HOURS = 12;
const BACKUP_EVERY_DAYS = 14;

const hoursSince = (iso) => (Date.now() - new Date(iso)) / 3600000;

// One foreground-only, bounded capture. This is a completion point, not a route.
let deliveryCapture = null;
const captureEnabled = () => load('sp.captureDeliveryLocation', true) === true;
const workflowMode = () => load('sp.workflowMode', 'simple') === 'detailed' ? 'detailed' : 'simple';
function stopDeliveryCapture() {
  if (!deliveryCapture) return;
  clearTimeout(deliveryCapture.timeout);
  if (deliveryCapture.watch != null) navigator.geolocation?.clearWatch(deliveryCapture.watch);
  deliveryCapture.watch = null;
}
function showDeliveryCapture() {
  const host = $('#location-capture'), capture = deliveryCapture;
  host.hidden = !capture;
  if (!capture) { host.innerHTML = ''; return; }
  const saved = capture.status === 'saved';
  const finding = capture.status === 'finding';
  const titles = {finding:'Finding location…',saved:'Delivery location saved',skipped:'Location skipped',unavailable:'Location unavailable',interrupted:'Location capture interrupted',storage:'Location could not be saved'};
  const descriptions = {
    finding:'Delivery already saved. Keep this app visible for up to 5 seconds.',
    saved:`Estimated accuracy ±${Math.ceil(capture.saved?.accuracy || 0)} m.${capture.saved?.accuracy > 30 ? ' Approximate fix; the 30 m target was not reached.' : ' No further action needed.'}`,
    skipped:'Your delivery is saved. No location was added.',
    unavailable:capture.reason || 'No sufficiently accurate fresh fix within 5 seconds. Your delivery is saved.',
    interrupted:'Capture stopped when this app was hidden. Your delivery is saved.',
    storage:'Your delivery is saved, but its location could not be stored.'
  };
  host.innerHTML = `<div class="card"><p role="status"><b>${titles[capture.status]}</b></p><p class="muted small">${descriptions[capture.status]}</p>
    <div class="actions">${finding ? '<button class="btn" id="skip-location">Skip</button>' : `${!saved && Date.now() - capture.completed < 120000 ? '<button class="btn" id="retry-location">Retry at drop-off</button>' : ''}<button class="btn" id="dismiss-location">${saved ? 'Done' : 'Dismiss'}</button>`}</div></div>`;
  if (finding) $('#skip-location').onclick = () => finishDeliveryCapture('skipped');
  else {
    $('#dismiss-location').onclick = () => { stopDeliveryCapture(); deliveryCapture = null; showDeliveryCapture(); };
    const retry = $('#retry-location');
    if (retry) retry.onclick = () => startDeliveryCapture(capture.id);
  }
}
function finishDeliveryCapture(status, point = null) {
  const capture = deliveryCapture;
  if (!capture || capture.status !== 'finding') return;
  stopDeliveryCapture();
  if (point) {
    try {
      const deliveries = store.deliveries;
      if (!deliveries.some(d => d.id === capture.id)) { capture.status = 'unavailable'; showDeliveryCapture(); return; }
      store.deliveries = deliveries.map(d => d.id === capture.id ? {...d, deliveryLocation:point} : d);
      capture.saved = point;
    } catch { status = 'storage'; }
  }
  capture.status = status;
  showDeliveryCapture();
}
function startDeliveryCapture(id) {
  stopDeliveryCapture();
  const delivery = store.deliveries.find(d => d.id === id);
  if (!delivery || !captureEnabled() || Date.now() - +new Date(delivery.completedAt) >= 120000) {
    deliveryCapture = null; showDeliveryCapture(); return;
  }
  const started = Date.now();
  const capture = deliveryCapture = {id,completed:+new Date(delivery.completedAt),status:'finding',started,watch:null,best:null};
  const finishBest = () => { if (deliveryCapture === capture) finishDeliveryCapture(capture.best ? 'saved' : 'unavailable', capture.best); };
  showDeliveryCapture();
  if (!navigator.geolocation || document.hidden) { capture.reason = 'Location is unavailable. Your delivery is saved.'; return finishDeliveryCapture('unavailable'); }
  capture.timeout = setTimeout(finishBest, 5000);
  try {
    const watch = navigator.geolocation.watchPosition(position => {
      if (deliveryCapture !== capture || capture.status !== 'finding') return;
      if (Date.now() - started >= 5000) return finishBest();
      const {latitude,longitude,accuracy} = position.coords;
      if (![latitude,longitude,accuracy,position.timestamp].every(Number.isFinite) || Math.abs(latitude)>90 || Math.abs(longitude)>180 || accuracy<0 || accuracy>100 || position.timestamp<started-1000 || position.timestamp>Date.now()+1000) return;
      const point = {latitude,longitude,accuracy,capturedAt:new Date(position.timestamp).toISOString()};
      if (!capture.best || accuracy<capture.best.accuracy) capture.best = point;
      if (accuracy<=30) finishDeliveryCapture('saved', point);
    }, error => {
      if (deliveryCapture !== capture || capture.status !== 'finding') return;
      if (error.code === 1) { capture.reason = 'Location permission was not granted. Your delivery is saved.'; finishDeliveryCapture('unavailable'); }
      // Transient failures can recover before the fixed deadline.
    }, {enableHighAccuracy:true,maximumAge:0,timeout:5000});
    if (capture.status === 'finding') capture.watch = watch;
    else navigator.geolocation.clearWatch(watch);
  } catch { finishDeliveryCapture('unavailable'); }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && deliveryCapture?.status === 'finding') finishDeliveryCapture('interrupted');
});
window.addEventListener('pagehide', () => {
  if (deliveryCapture?.status === 'finding') finishDeliveryCapture('interrupted');
});

function longShiftNote(active) {
  const h = hoursSince(active.start);
  return h >= LONG_SHIFT_HOURS
    ? `<p class="warn-note">⚠️ This shift has been running for ${duration(h)}. If you forgot to end it, change the <b>Finished</b> time when you end it.</p>`
    : '';
}

// Nudge to back up once there's something worth losing and it's been a while.
function backupNote() {
  const last = store.lastBackup;
  const days = last ? hoursSince(last) / 24 : Infinity;
  if (store.shifts.length < 3 || days < BACKUP_EVERY_DAYS) return '';
  return `
    <div class="card notice">
      <b>Back up your shifts.</b> ${last ? `Last backup was ${Math.floor(days)} days ago.` : "You haven't backed up yet."} If this phone breaks or Chrome's data is cleared, they're gone.
      <button class="btn" id="backup-now">Download backup now</button>
    </div>`;
}

function bindBackupNote() {
  const b = $('#backup-now');
  if (b) b.onclick = () => { exportBackup(); render(); };
}

function profitClass(n) {
  return n < 0 ? 'neg' : 'pos';
}

// The selector is a view/next-order preference, never a running platform clock.
function platformName(id, recordedName) {
  if (id === 'all') return 'All platforms';
  return recordedName || store.platforms.find((p) => p.id === id)?.name || 'Platform not recorded';
}

function platformBadge(record) {
  const tone = record.platformId === 'just-eat' ? 'just-eat' : record.platformId === 'deliveroo' ? 'deliveroo' : record.platformId ? 'custom' : 'unknown';
  return `<span class="platform-badge ${tone}">${esc(platformName(record.platformId, record.platformName))}</span>`;
}

function filterDeliveries(deliveries) {
  return store.platform === 'all' ? deliveries : deliveries.filter((d) => d.platformId === store.platform);
}

function todaysDeliveries() {
  const day = toLocalInput(new Date()).slice(0, 10);
  return store.deliveries.filter((d) => toLocalInput(d.completedAt).slice(0, 10) === day);
}

function platformSummary(deliveries, title, compact = false) {
  if (compact) {
    const fees = (items) => items.reduce((total, d) => total + (Number(d.fee) || 0), 0);
    const groups = store.platforms.map((p) => ({ ...p, items: deliveries.filter((d) => d.platformId === p.id) }));
    const unlisted = new Map();
    deliveries.filter((d) => !store.platforms.some((p) => p.id === d.platformId)).forEach((d) => {
      const id = d.platformId || '';
      if (!unlisted.has(id)) unlisted.set(id, { id, name: platformName(d.platformId, d.platformName), items: [] });
      unlisted.get(id).items.push(d);
    });
    return `<section class="card compact-fees" data-platform-summary aria-label="Today's offer fees">
      <div class="compact-total"><div><h2>Today · offer fees</h2><small>All platforms · ${deliveries.length} completed ${deliveries.length === 1 ? 'delivery' : 'deliveries'}</small></div><b>${money(fees(deliveries))}</b></div>
      <div class="compact-breakdown">${[...groups, ...unlisted.values()].map((p) => `<div class="${store.platform === p.id ? 'selected-provider' : ''}">${platformBadge({ platformId: p.id || null, platformName: p.name })}<b>${money(fees(p.items))}</b></div>`).join('')}</div>
    </section>`;
  }
  const selected = store.platform;
  const list = filterDeliveries(deliveries);
  const fees = (items) => items.reduce((total, d) => total + (Number(d.fee) || 0), 0);
  const row = (label, items) => `<div class="line"><span>${label} · ${items.length}</span><b>${money(fees(items))}</b></div>`;
  const unlisted = new Map();
  for (const d of list.filter((d) => !store.platforms.some((p) => p.id === d.platformId))) {
    const key = d.platformId || '';
    if (!unlisted.has(key)) unlisted.set(key, []);
    unlisted.get(key).push(d);
  }
  return `<section class="card platform-summary" data-platform-summary>
    <h2>${esc(title)} · ${esc(platformName(selected))}</h2>
    <div class="big">${money(fees(list))}<span>offer fees</span></div>
    <p class="muted small center">${list.length} completed ${list.length === 1 ? 'delivery' : 'deliveries'}</p>
    ${selected === 'all' ? store.platforms.map((p) => row(platformBadge({ platformId: p.id }), list.filter((d) => d.platformId === p.id))).join('') : ''}
    ${selected === 'all' ? [...unlisted.values()].map((items) => row(platformBadge(items[0]), items)).join('') : ''}
    <p class="muted small">Recorded offer fees, before costs and tax. Final shift earnings may include tips and adjustments.</p>
  </section>`;
}

function renderPlatformSelector() {
  if (!$('#platform-selector')) return;
  const selected = store.platform;
  $('#platform-selector').innerHTML = [{ id: 'all', name: 'All' }, ...store.platforms].map((p) =>
    `<button type="button" class="platform-pill ${p.id === 'just-eat' ? 'just-eat' : p.id === 'deliveroo' || p.id === 'all' ? 'deliveroo' : 'custom'}" data-platform="${esc(p.id)}" aria-pressed="${selected === p.id}">${selected === p.id ? '✓ ' : ''}${esc(p.name)}</button>`).join('');
}

function renderOrderOverview(view) {
  view.innerHTML = `<p class="muted small">All shows your combined overview. Choose a provider in Settings to record an order.</p><a class="btn" href="#settings">Choose provider in Settings</a>
    ${platformSummary(todaysDeliveries(), 'Today')}
    ${deliveryHistory(todaysDeliveries().sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)).slice(0, 5))}
    <a class="btn" href="#history">View full history</a>`;
}

function platformPlaces() {
  const ids = new Set(store.deliveries.filter((d) => d.platformId === store.platform).map((d) => d.placeId));
  return store.places.filter((p) => ids.has(p.id) || (p.waits || []).some((w) => w.platformId === store.platform));
}

// ---------- Routing (hash based, so the Android back button works) ----------

let timer = null;
let offerScreenshotCancel = null;

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function render() {
  if (offerScreenshotCancel) { offerScreenshotCancel(); offerScreenshotCancel = null; }
  clearInterval(timer);
  window.scrollTo(0, 0);
  const [route, id] = location.hash.slice(1).split('/');
  const view = $('#view');
  const tab = { order: 'order', places: 'places', place: 'places', history: 'history', shift: 'history', edit: 'history', 'delivery-edit': 'history', add: 'history', settings: 'settings' }[route] || 'home';
  document.querySelectorAll('.tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  $('#gear').classList.toggle('active', tab === 'settings');

  switch (route) {
    case 'end': return renderShiftForm(view, 'end');
    case 'add': return renderShiftForm(view, 'add');
    case 'edit': return renderShiftForm(view, 'edit', id);
    case 'shift': return renderShift(view, id);
    case 'delivery-edit': return renderDeliveryEdit(view, id);
    case 'order': return renderOrder(view);
    case 'places': return renderPlaces(view);
    case 'place': return renderPlace(view, id);
    case 'history': return renderHistory(view);
    case 'settings': return renderSettings(view);
    default: return renderHome(view);
  }
}

window.addEventListener('hashchange', render);
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => go('#' + b.dataset.tab)));
$('#gear').addEventListener('click', () => go('#settings'));
document.addEventListener('click', (e) => {
  const button = e.target.closest('[data-platform]');
  if (!button) return;
  store.platform = button.dataset.platform;
  // Only the Settings control is rebuilt, preserving any in-progress inputs.
  renderPlatformSelector();
});

document.addEventListener('change', (e) => {
  const select = e.target.closest('select[data-delivery-platform]');
  if (!select) return;
  const platform = store.platforms.find((p) => p.id === select.value);
  store.deliveries = store.deliveries.map((d) => d.id === select.dataset.deliveryPlatform
    ? { ...d, platformId: platform?.id || null, platformName: platform?.name || null } : d);
  store.places = store.places.map((p) => ({ ...p, waits: (p.waits || []).map((w) => w.orderId === select.dataset.deliveryPlatform
    ? { ...w, platformId: platform?.id || null } : w) }));
  toast('Delivery platform saved');
  render();
});

document.addEventListener('click', event => {
  const button = event.target.closest('[data-remove-location]');
  if (!button) return;
  const id = button.dataset.removeLocation;
  try {
    store.deliveries = store.deliveries.map(delivery => {
      if (delivery.id !== id) return delivery;
      const {deliveryLocation, ...rest} = delivery;
      return rest;
    });
    if (deliveryCapture?.id === id) { stopDeliveryCapture(); deliveryCapture = null; showDeliveryCapture(); }
    toast('Saved location removed'); render();
  } catch { toast('Could not remove location. Try again.'); }
});

// ---------- Interactive profit charts ----------

const CHART_DAYS = 14;
const CH = 180, CL = 46, CR = 14, CT = 12, CB = 30;
let CW = 340;
let chartSelection = null;
let chartDragging = false;
const chartWidth = () => Math.max(200, Math.round(Math.min(window.innerWidth, 560) - 66));
const shortDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function dailyTotals(shifts) {
  const days = [];
  const byKey = new Map();
  for (let i = CHART_DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const day = { date: d, key: toLocalInput(d).slice(0, 10), worked: false, profit: 0, fuel: 0, hours: 0, estimated: false };
    days.push(day); byKey.set(day.key, day);
  }
  for (const s of shifts) {
    const day = byKey.get(toLocalInput(s.start).slice(0, 10));
    if (!day) continue;
    const r = calcShift(s);
    day.worked = true; day.profit += r.profit; day.fuel += r.fuel; day.hours += r.hours;
  }
  const active = store.active;
  if (active && !shifts.some((s) => active.id && s.id === active.id)) {
    const day = byKey.get(toLocalInput(active.start).slice(0, 10));
    const points = profitTimeline([], store.deliveries, active, store.settings);
    if (day && points.length) {
      const latest = points[points.length - 1];
      day.worked = true; day.profit += latest.profit; day.estimated = true;
      day.hours += Math.max(0, Date.now() - new Date(active.start)) / 3600000;
    }
  }
  return days;
}

function niceStep(range) {
  const rough = Math.max(range, 1) / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  return [1, 2, 2.5, 5, 10].find((n) => n * power >= rough) * power;
}

function profitChartModel(range = store.chartRange) {
  if (range === 'fortnight') {
    const days = dailyTotals(store.shifts);
    const worked = days.filter((d) => d.worked);
    return { range, points: days.map((d, i) => ({ ...d, at: +d.date, xValue: i, label: dateLabel(d.date), earnings: null, vehicle: null, insurance: null })),
      total: worked.reduce((sum, d) => sum + d.profit, 0), estimated: worked.some((d) => d.estimated), hasData: worked.length > 0,
      hours: worked.reduce((sum, d) => sum + d.hours, 0), count: worked.length, xMin: 0, xMax: CHART_DAYS - 1 };
  }
  const todayKey = toLocalInput(new Date()).slice(0, 10);
  const shifts = store.shifts.filter((s) => toLocalInput(s.start).slice(0, 10) === todayKey);
  const points = profitTimeline(shifts, store.deliveries, store.active, store.settings).map((p) => ({ ...p, xValue: p.at, worked: true }));
  const last = points[points.length - 1];
  const firstAt = points.length ? points[0].at : new Date().setMinutes(0, 0, 0);
  const lastAt = last ? last.at : firstAt + 3600000;
  return { range, points, total: last?.profit || 0, estimated: !!last?.estimated, incomplete: !!last?.incomplete,
    hasData: points.length > 0, xMin: firstAt, xMax: Math.max(lastAt, firstAt + 60000) };
}

function chartCard() {
  const model = profitChartModel();
  const periodButtons = `<div class="chart-tabs" role="group" aria-label="Profit graph period">
    <button class="btn" type="button" data-chart-range="today" aria-pressed="${model.range === 'today'}">Today</button>
    <button class="btn" type="button" data-chart-range="fortnight" aria-pressed="${model.range === 'fortnight'}">Last 2 weeks</button>
  </div>`;
  CW = chartWidth();
  const { points } = model;
  const values = points.map((p) => p.profit);
  const range = Math.max(0, ...values) - Math.min(0, ...values);
  const step = model.hasData && range > 0 ? niceStep(range) : 25;
  const yMin = Math.floor(Math.min(0, ...values) / step) * step;
  const yMax = Math.max(yMin + step, Math.ceil(Math.max(0, ...values) / step) * step, range === 0 ? 100 : 0);
  const x = (value) => CL + (value - model.xMin) / (model.xMax - model.xMin) * (CW - CL - CR);
  const y = (value) => CT + (yMax - value) / (yMax - yMin) * (CH - CT - CB);
  let grid = '';
  for (let value = yMin; value <= yMax + step / 100; value += step) {
    grid += `<line class="${Math.abs(value) < step / 100 ? 'zero' : 'grid'}" x1="${CL}" x2="${CW - CR}" y1="${y(value)}" y2="${y(value)}"/>
      <text class="axis" x="${CL - 7}" y="${y(value) + 4}" text-anchor="end">${money(value).replace('.00', '')}</text>`;
  }
  let labels = '';
  const ticks = CW < 280 ? 3 : 4;
  for (let i = 0; i < ticks; i++) {
    const value = model.xMin + i / (ticks - 1) * (model.xMax - model.xMin);
    const label = model.range === 'today' ? timeLabel(value) : shortDate(points[Math.round(value)].date);
    labels += `<text class="axis" x="${x(value)}" y="${CH - 8}" text-anchor="${i === 0 ? 'start' : i === ticks - 1 ? 'end' : 'middle'}">${label}</text>`;
  }
  const coordinates = points.map((p) => `${x(p.xValue)},${y(p.profit)}`).join(' ');
  const trace = model.hasData ? `<defs><linearGradient id="profit-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity=".18"/><stop offset="100%" stop-color="var(--accent)" stop-opacity=".02"/></linearGradient></defs>
    <polygon class="profit-area" points="${x(points[0].xValue)},${y(0)} ${coordinates} ${x(points[points.length - 1].xValue)},${y(0)}"/>
    <polyline class="profit-line" points="${coordinates}"/>
    ${points.map((p, i) => p.worked ? `<circle class="dot${p.estimated ? ' estimated-dot' : ''}" data-point="${i}" cx="${x(p.xValue)}" cy="${y(p.profit)}" r="4"/>` : '').join('')}`
    : `<text class="axis" x="${(CL + CW - CR) / 2}" y="${CH / 2}" text-anchor="middle">${model.range === 'today' ? 'Start a shift' : 'No shifts yet'}</text>`;
  const active = store.active;
  const overnight = active && toLocalInput(active.start).slice(0, 10) !== toLocalInput(new Date()).slice(0, 10);
  return `<section class="card chart profit-chart" id="chart">
    ${periodButtons}
    <div class="chart-heading"><h2>Profit before tax</h2><span class="chart-estimate">${!model.hasData ? 'No activity yet' : model.estimated ? 'Estimated live' : 'Saved totals'}</span></div>
    ${model.range === 'fortnight' ? `<div class="chart-headline"><div class="chart-total ${model.total < 0 ? 'neg' : ''}">${money(model.total)} <small>period total</small></div><div><b>${model.count} days</b><small>worked / 14 days</small></div></div>` : ''}
    <p class="muted small chart-status">All platforms${!model.hasData ? (model.range === 'fortnight' ? ' · No shifts in the last 2 weeks' : '') : ' · after ' + (model.estimated ? 'estimated expenses' : 'fuel, maintenance and insurance')}</p>
    <svg viewBox="0 0 ${CW} ${CH}" role="img" aria-label="${model.range === 'today' ? 'Cumulative profit by time' : 'Daily profit for the last 2 weeks'}. ${money(model.total)} ${model.estimated ? 'estimated ' : ''}profit before tax. Tap or drag to explore points.">
      ${grid}${labels}${trace}
      <line class="cross" id="cross" x1="0" x2="0" y1="${CT}" y2="${CH - CB}" visibility="hidden"/>
      <circle class="chart-marker" id="chart-marker" cx="0" cy="0" r="7" visibility="hidden"/>
    </svg>
    <p class="muted small chart-x-title">${model.range === 'today' ? 'Time' : 'Date'}</p>
    ${model.hasData ? `<div class="chart-tools">
      <button type="button" class="btn chart-step" id="chart-previous" aria-label="Previous profit point"${!model.hasData ? ' disabled' : ''}>‹</button>
      <div class="chart-readout" id="chart-info" aria-live="polite">Your profit appears here as you record work.</div>
      <button type="button" class="btn chart-step" id="chart-next" aria-label="Next profit point"${!model.hasData ? ' disabled' : ''}>›</button>
    </div>
    <p class="muted small chart-position" id="chart-position">Tap or slide across the graph</p>` : ''}
    ${model.range === 'fortnight' ? `<div class="row3"><div><b>${model.count}</b><small>days worked</small></div><div><b>${duration(model.hours)}</b><small>shift hours</small></div><div><b>${money(model.count ? model.total / model.count : 0)}</b><small>avg profit / day</small></div></div>` : ''}
    ${model.hasData ? `<details class="chart-method"><summary>How this is estimated</summary><p class="muted small">${model.range === 'today'
      ? 'Live estimates use completed offer fees and miles, plus insurance for all elapsed shift time. Unrecorded travel is not included. Saved shift totals reconcile to final earnings and mileage; between-job costs are estimated.'
      : 'Daily totals are grouped by shift start date. Any shift still running is estimated.'} Costs use your configured fuel, maintenance and insurance allowances, before tax; depreciation is not included.</p></details>` : ''}
    ${model.incomplete ? '<p class="warn-note small">Missing offer fees or mileage: live profit is incomplete.</p>' : ''}${overnight && model.range === 'today' ? '<p class="muted small">Includes the current overnight shift from its start.</p>' : ''}
  </section>`;
}

function bindChart() {
  chartDragging = false;
  document.querySelectorAll('[data-chart-range]').forEach((button) => {
    button.onclick = () => {
      const range = button.dataset.chartRange;
      store.chartRange = range; chartSelection = null; refreshChart(true);
      $(`[data-chart-range="${range}"]`).focus({ preventScroll: true });
    };
  });
  const model = profitChartModel();
  const svg = $('#chart svg');
  if (!svg || !model.hasData) return;
  const points = model.points;
  const x = (p) => CL + (p.xValue - model.xMin) / (model.xMax - model.xMin) * (CW - CL - CR);
  const values = points.map((p) => p.profit);
  const range = Math.max(0, ...values) - Math.min(0, ...values);
  const step = model.hasData && range > 0 ? niceStep(range) : 25;
  const yMin = Math.floor(Math.min(0, ...values) / step) * step;
  const yMax = Math.max(yMin + step, Math.ceil(Math.max(0, ...values) / step) * step, range === 0 ? 100 : 0);
  const y = (p) => CT + (yMax - p.profit) / (yMax - yMin) * (CH - CT - CB);
  let at = Math.max(0, points.findIndex((p) => chartSelection && p.key === chartSelection.key && model.range === chartSelection.range));
  if (!chartSelection || chartSelection.range !== model.range || !points.some((p) => p.key === chartSelection.key)) at = Math.max(0, points.length - 1);
  const select = (index) => {
    if (!model.hasData) return;
    at = Math.max(0, Math.min(points.length - 1, index));
    const p = points[at];
    chartSelection = { range: model.range, key: p.key };
    const cx = x(p);
    $('#cross').setAttribute('x1', cx); $('#cross').setAttribute('x2', cx); $('#cross').setAttribute('visibility', 'visible');
    const marker = $('#chart-marker');
    marker.setAttribute('cx', cx); marker.setAttribute('cy', y(p)); marker.setAttribute('visibility', 'visible');
    $('#chart-info').innerHTML = model.range === 'today'
      ? `<span>${timeLabel(p.at)} · ${esc(p.label)}</span><b>${money(p.profit)} <small>${p.estimated ? 'estimated ' : ''}profit</small></b>`
      : `<span>${dateLabel(p.date)}${p.worked ? ' · ' + duration(p.hours) : ''}</span><b>${p.worked ? money(p.profit) + ` <small>${p.estimated ? 'estimated ' : ''}profit</small>` : 'No shift'}</b>`;
    $('#chart-position').textContent = model.range === 'today' ? `${money(p.earnings)} fees/earnings − ${money(p.costs)} ${p.estimated ? 'estimated ' : ''}costs` : `${at + 1} of ${points.length} days · tap or slide to explore`;
    $('#chart-previous').disabled = at === 0;
    $('#chart-next').disabled = at === points.length - 1;
  };
  const pick = (event) => {
    const box = svg.getBoundingClientRect();
    const target = (event.clientX - box.left) / box.width * CW;
    let nearest = 0;
    points.forEach((point, index) => { if (Math.abs(x(point) - target) <= Math.abs(x(points[nearest]) - target)) nearest = index; });
    select(nearest);
  };
  svg.addEventListener('pointerdown', (event) => { chartDragging = true; svg.setPointerCapture?.(event.pointerId); if (model.hasData) pick(event); });
  svg.addEventListener('pointermove', (event) => { if (model.hasData && (chartDragging || event.pointerType === 'mouse')) pick(event); });
  svg.addEventListener('pointerup', () => { chartDragging = false; });
  svg.addEventListener('pointercancel', () => { chartDragging = false; });
  $('#chart-previous').onclick = () => select(at - 1);
  $('#chart-next').onclick = () => select(at + 1);
  if (model.hasData) select(at);
}

function refreshChart(force = false) {
  if (!$('#chart') || (!force && chartDragging)) return;
  if ($('#net-today')) {
    const open = !!$('.net-details')?.open;
    const focused = document.activeElement?.matches('#net-today summary');
    $('#net-today').outerHTML = netEarningsCard();
    $('.net-details').open = open;
    if (focused) $('#net-today summary').focus({ preventScroll: true });
  }
  const focused = document.activeElement?.closest('#chart') ? document.activeElement : null;
  const focusSelector = focused?.id ? `#${focused.id}` : focused?.dataset.chartRange
    ? `[data-chart-range="${focused.dataset.chartRange}"]` : focused?.matches('summary') ? '.chart-method summary' : null;
  const explanationOpen = !!$('.chart-method')?.open;
  $('#chart').outerHTML = chartCard();
  if ($('.chart-method')) $('.chart-method').open = explanationOpen;
  bindChart();
  if (focusSelector) $(focusSelector)?.focus({ preventScroll: true });
}

window.addEventListener('resize', () => { if ($('#chart')) refreshChart(true); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshChart(); });


// ---------- Home ----------

function netEarningsCard() {
  const model = profitChartModel('today');
  const point = model.points[model.points.length - 1];
  const deliveries = todaysDeliveries();
  const rows = new Map();
  for (const d of deliveries) {
    const name = platformName(d.platformId, d.platformName);
    rows.set(name, (rows.get(name) || 0) + (Number(d.fee) || 0));
  }
  return `<section class="card net-today" id="net-today" data-platform-summary>
    <div class="net-heading"><h2>Net earnings today</h2>
      <div class="big net-total ${model.total < 0 ? 'neg' : ''}">${money(model.total)}</div></div>
    <div class="net-context"><p class="muted small">All platforms · ${model.estimated ? 'estimated · ' : ''}before tax</p>
      <p class="muted small">${deliveries.length} completed ${deliveries.length === 1 ? 'delivery' : 'deliveries'}</p></div>
    <details class="net-details"><summary>Payments and expenses</summary>
      <div class="line"><span>Recorded shift earnings</span><b>${money(point?.earnings || 0)}</b></div>
      <div class="line"><span>Fuel, maintenance & insurance</span><b>−${money(point?.costs || 0)}</b></div>
      ${[...rows].map(([name, fees]) => `<div class="line" data-provider-payment><span>${esc(name)} payments</span><b>${money(fees)}</b></div>`).join('')}
      <p class="muted small">Provider payments are before costs. Live net uses completed linked orders and elapsed insurance; unrecorded travel can make it optimistic. Final earnings and total mileage are reconciled when saving the shift. Saved shifts are grouped by start date. Figures exclude depreciation.</p>
    </details>
    ${store.active && toLocalInput(store.active.start).slice(0, 10) !== toLocalInput(new Date()).slice(0, 10) ? '<p class="muted small">Includes the current overnight shift from its start.</p>' : ''}
    ${model.incomplete ? '<p class="warn-note small">Missing offer fees or mileage: net earnings are incomplete.</p>' : ''}
  </section>`;
}

function hasUnfinishedOrder() {
  const order = store.order;
  return order.step !== 'offer' || !!order.acceptedAt;
}

function renderUnfinishedOrder(view) {
  const order = store.order;
  view.innerHTML = `<section class="card notice" id="unfinished-order">
    <h2>Finish your current order first</h2>
    ${platformBadge(order)}
    <p>${order.restaurantName ? esc(order.restaurantName) + ' · ' : ''}Your order is still in progress. Record Delivered after handover, or cancel the order if it was abandoned, before ending or cancelling this shift.</p>
    <a class="btn primary" href="#order">Return to current order</a>
    <button class="btn" id="keep-shift">Keep shift running</button>
  </section>`;
  $('#keep-shift').onclick = () => go('#home');
}

document.addEventListener('click', (event) => {
  const options = $('.shift-options[open]');
  if (options && !options.contains(event.target)) options.open = false;
});
document.addEventListener('keydown', (event) => {
  const options = $('.shift-options[open]');
  if (event.key === 'Escape' && options) { options.open = false; $('summary', options).focus(); }
});

function summaryCard(label, shifts) {
  const t = sumResults(shifts.map(calcShift));
  if (!shifts.length) return `<div class="card summary"><h2>${label}</h2><p class="muted">No shifts yet</p></div>`;
  return `
    <div class="card summary">
      <h2>${label}</h2>
      <div class="big ${profitClass(t.profitPerHour)}">${money(t.profitPerHour)}<span>/hr profit</span></div>
      <div class="row3">
        <div><b>${money(t.profit)}</b><small>profit</small></div>
        <div><b>${duration(t.hours)}</b><small>worked</small></div>
        <div><b>${num(t.miles, 0)}</b><small>miles</small></div>
      </div>
    </div>`;
}

function renderHome(view) {
  const active = store.active;
  const shifts = store.shifts;
  const settingsNote = store.hasSettings ? '' : `
    <a class="card notice" href="#settings">
      <b>First time?</b> Put in your petrol price, MPG and insurance in <u>Settings</u> so the numbers are right.
    </a>`;

  if (active) {
    view.innerHTML = `
      ${chartCard(shifts)}
      ${netEarningsCard()}
      <div class="card active-shift compact-active">
        <div class="active-heading"><div><b>On shift · <span id="clock">${duration((Date.now() - new Date(active.start)) / 3600000)}</span></b><small>Started ${timeLabel(active.start)} · all platforms</small></div><button class="btn danger-outline" id="end">End shift</button>
        </div>
        <details class="shift-options"><summary aria-label="Shift options">•••</summary><div class="shift-options-panel">${active.startOdo ? `<p class="small muted">Starting odometer: ${esc(active.startOdo)}</p>` : ''}<button class="btn link danger-outline" id="cancel">Cancel this shift</button></div></details>
        ${hasUnfinishedOrder() ? '<a class="btn resume-order" href="#order">Continue current order →</a>' : ''}
        ${longShiftNote(active)}
      </div>
      ${settingsNote}`;
    timer = setInterval(() => {
      const c = $('#clock');
      if (c) c.textContent = duration((Date.now() - new Date(active.start)) / 3600000);
      refreshChart();
    }, 15000);
    bindChart(shifts);
    $('#end').onclick = () => go('#end');
    $('#cancel').onclick = () => {
      if (hasUnfinishedOrder()) return renderUnfinishedOrder(view);
      if (confirm('Cancel this shift? Nothing will be saved.')) {
        store.active = null;
        render();
      }
    };
    return;
  }

  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const week = startOfWeek(now);
  const todays = shifts.filter((s) => new Date(s.start) >= today);
  const weeks = shifts.filter((s) => new Date(s.start) >= week);
  const lastOdo = shifts.length ? shifts[0].endOdo : '';

  view.innerHTML = `
    ${chartCard(shifts)}
    ${netEarningsCard()}
    <div class="card shift-start">
      <button class="btn primary" id="start">Start shift</button>
      <label class="field">
        <span>Starting odometer <small>(optional)</small></span>
        <input id="odo" type="number" inputmode="decimal" placeholder="${lastOdo ? 'Last: ' + esc(lastOdo) : 'e.g. 48210'}">
      </label>
    </div>
    ${settingsNote}
    ${shifts.length ? `<details class="card saved-summaries"><summary>Saved shift summaries</summary>${summaryCard('Today · all platforms', todays)}${summaryCard('This week · all platforms', weeks)}</details>` : ''}
    ${backupNote()}
    <a class="btn link" href="#add">Forgot to start? Add a past shift</a>`;

  bindChart(shifts);
  bindBackupNote();
  $('#start').onclick = () => {
    store.active = { id: newId(), start: new Date().toISOString(), startOdo: $('#odo').value.trim() };
    toast('Shift started. Drive safe!');
    render();
  };
}

// ---------- Shift form (end shift / add past shift / edit) ----------

function renderShiftForm(view, mode, id) {
  let shift;
  if (mode === 'end') {
    const active = store.active;
    if (!active) return go('#home');
    if (hasUnfinishedOrder()) return renderUnfinishedOrder(view);
    // A draft is kept while typing, so switching to Deliveroo to check a figure loses nothing.
    const { timesEdited, endEdited, ...draft } = active.draft || {};
    shift = { id: active.id, start: active.start, end: new Date().toISOString(), startOdo: active.startOdo, endOdo: '', miles: '', earnings: '', note: '', ...draft, settings: store.settings };
  } else if (mode === 'edit') {
    shift = store.shifts.find((s) => s.id === id);
    if (!shift) return go('#history');
  } else {
    const end = new Date();
    shift = { start: new Date(end - 4 * 3600000).toISOString(), end: end.toISOString(), startOdo: '', endOdo: '', miles: '', earnings: '', note: '', settings: store.settings };
  }

  const heading = { end: 'End shift', add: 'Add a past shift', edit: 'Edit shift' }[mode];
  view.innerHTML = `
    <h2>${heading}</h2>
    <form id="f" class="card" novalidate>
      <label class="field">
        <span>Total earnings from all your apps, including tips (£) <small>(tips added later? Edit the shift then)</small></span>
        <input name="earnings" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(shift.earnings)}" placeholder="e.g. 75.40" required>
      </label>
      ${mode === 'end' ? longShiftNote(store.active) : ''}
      <div class="pair">
        <label class="field"><span>Odometer start</span>
          <input name="startOdo" type="number" inputmode="decimal" value="${esc(shift.startOdo)}"></label>
        <label class="field"><span>Odometer end</span>
          <input name="endOdo" type="number" inputmode="decimal" value="${esc(shift.endOdo)}"></label>
      </div>
      <label class="field">
        <span>Miles driven <small>(filled in from the odometer, or type it)</small></span>
        <input name="miles" type="number" inputmode="decimal" step="0.1" min="0" value="${esc(shift.miles)}">
      </label>
      <label class="field"><span>Started</span>
        <input name="start" type="datetime-local" value="${toLocalInput(shift.start)}"></label>
      <label class="field"><span>Finished</span>
        <input name="end" type="datetime-local" value="${toLocalInput(shift.end)}"></label>
      <label class="field">
        <span>Note <small>(optional, e.g. "rainy Friday")</small></span>
        <input name="note" type="text" value="${esc(shift.note)}" maxlength="120">
      </label>
      <div id="preview" class="preview"></div>
      <p id="err" class="error" hidden></p>
      <button class="btn primary huge" type="submit">${mode === 'end' ? 'Finish & save' : 'Save'}</button>
    </form>`;

  const f = $('#f');
  const read = () => ({
    ...shift,
    earnings: f.earnings.value.trim(),
    startOdo: f.startOdo.value.trim(),
    endOdo: f.endOdo.value.trim(),
    miles: f.miles.value.trim(),
    start: f.start.value ? new Date(f.start.value).toISOString() : '',
    end: f.end.value ? new Date(f.end.value).toISOString() : '',
    note: f.note.value.trim(),
  });

  const updatePreview = () => {
    const s = read();
    if (!s.start || !s.end || s.earnings === '') { $('#preview').innerHTML = ''; return; }
    const r = calcShift(s);
    $('#preview').innerHTML = `
      <div class="big ${profitClass(r.profitPerHour)}">${money(r.profitPerHour)}<span>/hr profit</span></div>
      <p class="muted center">${money(r.profit)} profit · ${money(r.costs)} costs · ${duration(r.hours)}</p>`;
  };

  const syncMiles = () => {
    const a = parseFloat(f.startOdo.value), b = parseFloat(f.endOdo.value);
    if (!isNaN(a) && !isNaN(b) && b >= a) f.miles.value = Math.round((b - a) * 10) / 10;
  };

  f.startOdo.addEventListener('input', syncMiles);
  f.endOdo.addEventListener('input', syncMiles);
  f.addEventListener('input', updatePreview);
  if (mode === 'end') {
    f.addEventListener('input', (e) => {
      const { earnings, startOdo, endOdo, miles, start, end, note } = read();
      const prev = store.active.draft || {};
      // Times are only kept if you changed them; otherwise Finished stays "now".
      const timesEdited = prev.timesEdited || e.target.name === 'start' || e.target.name === 'end';
      const endEdited = (prev.endEdited ?? !!prev.timesEdited) || e.target.name === 'end';
      const draft = { earnings, startOdo, endOdo, miles, note, timesEdited, endEdited, ...(timesEdited ? { start, end } : {}) };
      store.active = { ...store.active, draft };
    });
  }
  updatePreview();
  if (mode !== 'edit') f.earnings.focus();

  f.onsubmit = (e) => {
    e.preventDefault();
    const s = read();
    const fail = (msg) => { const el = $('#err'); el.textContent = msg; el.hidden = false; };
    if (mode === 'end') {
      if (!store.active || store.active.id !== shift.id) return fail('This shift is no longer active. Return to Shift to check it.');
      if (hasUnfinishedOrder()) return fail('Your current order is unfinished. Open Order to complete or cancel it before ending this shift.');
      // An untouched Finished field means now, rather than the minute when the
      // form first opened. Explicit minute-level edits must still include every
      // completed delivery linked to this shift.
      if (!(store.active.draft?.endEdited ?? store.active.draft?.timesEdited)) s.end = new Date().toISOString();
      const completed = store.deliveries.filter((d) => shift.id && d.shiftId === shift.id)
        .map((d) => +new Date(d.completedAt)).filter(Number.isFinite);
      const latest = completed.length ? Math.max(...completed) : null;
      if (latest !== null && latest > +new Date(s.end)) {
        if (latest >= +new Date(s.end) + 60000) return fail('The finish time is before your last completed delivery. Check Finished.');
        s.end = new Date(latest).toISOString();
      }
    }
    if (s.earnings === '' || isNaN(+s.earnings) || +s.earnings < 0) return fail('Enter your total earnings.');
    if (s.miles === '' || isNaN(+s.miles) || +s.miles < 0) return fail('Enter your odometer readings or the miles driven.');
    if (s.startOdo && s.endOdo && +s.endOdo < +s.startOdo) return fail('Odometer end is lower than odometer start.');
    if (!s.start || !s.end || new Date(s.end) <= new Date(s.start)) return fail('The finish time must be after the start time.');

    s.earnings = +s.earnings;
    s.miles = +s.miles;
    if (!s.id) s.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    const shifts = store.shifts.filter((x) => x.id !== s.id);
    shifts.push(s);
    shifts.sort((a, b) => new Date(b.start) - new Date(a.start));
    store.shifts = shifts;
    if (mode === 'end') store.active = null;
    toast('Shift saved');
    // Replace the form in history so "back" doesn't return to it.
    location.replace('#shift/' + s.id);
  };
}

// ---------- Shift detail ----------

function renderShift(view, id) {
  const shift = store.shifts.find((s) => s.id === id);
  if (!shift) return go('#history');
  const r = calcShift(shift);
  const s = shift.settings;
  const review = calcShiftReview(shift, store.deliveries);
  const line = (label, value, cls = '') => `<div class="line ${cls}"><span>${label}</span><b>${value}</b></div>`;

  view.innerHTML = `
    <h2>Shift review</h2>
    <p class="muted">${dateLabel(shift.start)} · ${timeLabel(shift.start)}–${timeLabel(shift.end)}</p>
    <p class="muted small">All platforms · full shift totals, including shared time and expenses</p>
    ${shift.note ? `<p class="muted">${esc(shift.note)}</p>` : ''}
    <div class="card">
      <div class="big ${profitClass(r.profitPerHour)}">${money(r.profitPerHour)}<span>/hr profit</span></div>
      <p class="muted center">Your apps paid ${money(r.grossPerHour)}/hr before costs</p>
      <div class="row3">
        <div><b>${money(r.profit)}</b><small>profit</small></div>
        <div><b>${money(r.costs)}</b><small>costs</small></div>
        <div><b>${money(r.profitPerMile)}</b><small>profit/mile</small></div>
      </div>
      <p class="muted small center">After configured fuel, maintenance and insurance, before tax. Depreciation is not included.</p>
    </div>
    <section class="card shift-review" aria-labelledby="review-time">
      <h2 id="review-time">How your time was spent</h2>
      ${line('Full shift', duration(r.hours))}
      ${line('Recorded deliveries', String(review.count))}
      ${line('Deliveries per shift hour', num(review.perHour))}
      ${line('Recorded restaurant waiting', review.waitCount ? duration(review.waitHours) : 'Not recorded')}
      ${line('Outside timed deliveries', review.outsideHours !== null ? duration(review.outsideHours) : 'Not recorded')}
      <details class="net-details"><summary>What these timings mean</summary>
      <p class="muted small">All platforms. ${review.timedCount}/${review.count} deliveries have acceptance-to-completion timings; ${review.waitCount}/${review.count} have recorded waits. Overlapping timed intervals count once.${review.manualWaitCount ? ' ' + review.manualWaitCount + ' manually entered wait(s) added as durations; their exact timing and overlap are unknown.' : ''}</p>
      <p class="muted small">Outside timed deliveries includes time before, between and after recorded jobs: repositioning, waiting for offers, breaks and missing entries. ${review.timedCount < review.count ? 'Missing timings can make this amount too high.' : 'It is not a measure of idle time.'}</p>
      </details>
      ${review.timedCount < review.count || review.waitCount < review.count ? '<p class="muted small">Some timings are missing; recorded totals are incomplete.</p>' : ''}
      ${!review.count ? '<p class="muted small">No completed deliveries linked to this shift. The profit above still uses your saved shift totals.</p>' : ''}
    </section>
    <section class="card shift-review" aria-labelledby="review-miles">
      <h2 id="review-miles">Mileage comparison</h2>
      ${line('Actual shift mileage', num(r.miles) + ' mi')}
      ${line('Entered offer mileage', review.mileageCount ? num(review.offerMiles) + ' mi' : 'Not recorded')}
      ${line('Actual minus entered offers', review.mileageDifference !== null ? (review.mileageDifference > 0 ? '+' : '') + num(review.mileageDifference) + ' mi' : 'Not available')}
      <p class="muted small">Offer mileage entered for ${review.mileageCount}/${review.count} recorded deliveries. Profit uses actual shift mileage.</p>
      <details class="net-details"><summary>What the difference means</summary>
      <p class="muted small">${review.mileageDifference === null ? 'A difference is shown once all recorded deliveries have mileage.' : 'The difference can reflect repositioning, route changes and offer estimates; it is not exact unpaid mileage.'} Unrecorded jobs can also affect the comparison.</p></details>
    </section>
    <div class="card">
      <h2>Payments and expenses</h2>
      ${line('Earnings', money(r.earnings))}
      ${line(`Fuel (${num(r.litres)} L)`, '−' + money(r.fuel))}
      ${line('Maintenance', '−' + money(r.maintenance))}
      ${line(`Insurance (${money(insurancePerHour(s))}/hr)`, '−' + money(r.insurance))}
      ${line('Profit', money(r.profit), 'total')}
      <p class="muted small">Worked out with petrol at ${money(s.fuelPrice)}/L and ${num(s.mpg)} MPG.</p>
    </div>
    ${deliveryHistory(filterDeliveries(store.deliveries.filter((d) => d.shiftId === shift.id)))}
    <div class="actions">
      <button class="btn" id="edit">Edit</button>
      <button class="btn danger-outline" id="del">Delete</button>
    </div>
    <button class="btn primary" id="done">Done</button>`;

  $('#edit').onclick = () => go('#edit/' + id);
  $('#done').onclick = () => go('#home');
  $('#del').onclick = () => {
    if (!confirm('Delete this shift?')) return;
    store.shifts = store.shifts.filter((x) => x.id !== id);
    toast('Shift deleted');
    location.replace('#history');
  };
}

// ---------- Places (restaurant notebook) ----------

const PARK_TYPES = { restaurant: 'Restaurant car park', street: 'Free street bay', loading: 'Loading bay' };
const PARK_LIMITS = { 30: '30 min', 60: '1 hr', 120: '2 hr', none: 'None' };
const EASE = { easy: 'Easy', tricky: 'Tricky', avoid: 'Avoid' };
const MAX_WAIT_MINS = 90; // longer than this, the timer was probably left running

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function getPlace(id) {
  return store.places.find((p) => p.id === id) || null;
}

function updatePlace(id, changes) {
  store.places = store.places.map((p) => (p.id === id ? { ...p, ...changes } : p));
}

function addPlace(name) {
  const place = { id: newId(), name: name.trim(), area: '', note: '', parkType: '', parkLimit: '', ease: '', spot: null, waits: [] };
  store.places = [...store.places, place];
  return place;
}

// Average of the last 10 waits, in minutes, or null if never timed.
function avgWait(p) {
  const recent = (p.waits || []).slice(-10);
  return recent.length ? recent.reduce((a, w) => a + w.mins, 0) / recent.length : null;
}

const placeName = (p) => esc(p.name) + (p.area ? ` <span class="muted">· ${esc(p.area)}</span>` : '');
const easeTag = (p) => (p.ease ? `<span class="tag ${p.ease}">${EASE[p.ease]}</span>` : '');

function placeMeta(p) {
  const visits = (p.waits || []).length;
  const avg = avgWait(p);
  return (visits ? `${visits} visit${visits > 1 ? 's' : ''} · avg wait ${Math.round(avg)} min` : 'No waits timed yet') + (p.postcodeOnly ? ' · postcode only, branch unconfirmed' : '');
}

function parkingLine(p) {
  if (!p.parkType) return '';
  const limit = p.parkLimit && p.parkLimit !== 'none' ? ` · ${PARK_LIMITS[p.parkLimit]} max` : '';
  return `<p class="park">🅿️ <b>${PARK_TYPES[p.parkType]}</b>${limit}</p>`;
}

function directionsUrl(spot) {
  return `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}&travelmode=driving`;
}

function saveSpot(id, done) {
  if (!navigator.geolocation) return toast("This phone can't share its location");
  toast('Finding your location…');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      updatePlace(id, { spot: { lat, lng, accuracy, savedAt: new Date().toISOString() } });
      toast(`Parking spot saved (to within ${Math.round(accuracy)} m)`);
      done();
    },
    (err) => toast(err.code === 1 ? 'Location is blocked. Allow it for this site in Chrome settings.' : "Couldn't get your location. Try again outside."),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

// ---------- Restaurant search (OpenStreetMap, via Photon) ----------

// Results are limited to roughly 20 km around the work area set in Settings.
// Only what you type and the work area are sent, never your live location.
const SEARCH_URL = 'https://photon.komoot.io/api/';
const DEFAULT_AREA = { name: 'Manchester', lat: 53.4808, lon: -2.2426 };
const NOT_VENUES = ['highway', 'place', 'boundary', 'landuse', 'natural', 'waterway', 'railway', 'route', 'admin'];

function photonUrl(params) {
  const u = new URL(SEARCH_URL);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

function kmBetween(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

async function searchVenues(q, signal) {
  const a = store.area;
  const res = await fetch(photonUrl({
    q, lat: a.lat, lon: a.lon, limit: 15, lang: 'en',
    bbox: [a.lon - 0.33, a.lat - 0.2, a.lon + 0.33, a.lat + 0.2].map((n) => n.toFixed(4)).join(','),
  }), { signal });
  if (!res.ok) throw new Error('search failed');
  const data = await res.json();
  return (data.features || [])
    .filter((f) => f.properties && f.properties.name && !NOT_VENUES.includes(f.properties.osm_key))
    .map((f) => {
      const p = f.properties;
      const [lon, lat] = f.geometry.coordinates;
      return {
        osm: `${p.osm_type}${p.osm_id}`,
        name: p.name,
        street: [p.housenumber, p.street].filter(Boolean).join(' '),
        area: p.district || p.locality || '',
        postcode: p.postcode || '',
        kind: (p.osm_value || '').replace(/_/g, ' '),
        lat, lon,
      };
    })
    .filter((r) => kmBetween(a, r) <= 30)
    .slice(0, 8);
}

// Looks up a town or postcode area typed in Settings.
async function findArea(q) {
  const res = await fetch(photonUrl({ q, limit: 1, lang: 'en', countrycode: 'GB' }));
  if (!res.ok) throw new Error('lookup failed');
  const f = ((await res.json()).features || [])[0];
  if (!f) return null;
  const [lon, lat] = f.geometry.coordinates;
  return { name: [f.properties.name, f.properties.county || f.properties.state].filter(Boolean).join(', '), lat, lon };
}

const addressLine = (x) => [x.street, x.area, x.postcode].filter(Boolean).join(', ');

function fullPostcode(value) {
  const compact = value.toUpperCase().replace(/\s/g, '');
  return /^(GIR0AA|[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2})$/.test(compact) ? compact.slice(0, -3) + ' ' + compact.slice(-3) : null;
}
const postcodeVenues = new Map();
async function searchPostcode(postcode, signal) {
  if (postcodeVenues.has(postcode)) return postcodeVenues.get(postcode);
  const response = await fetch('https://api.postcodes.io/postcodes/' + encodeURIComponent(postcode), {signal});
  if (response.status === 404) throw new Error('postcode-not-found');
  if (!response.ok) throw new Error('postcode-lookup-failed');
  const point = (await response.json()).result;
  if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) throw new Error('postcode-lookup-failed');
  const query = `[out:json][timeout:6];nwr(around:300,${point.latitude},${point.longitude})[amenity~"^(restaurant|fast_food|cafe|food_court)$"];out center tags;`;
  const result = await fetch('https://overpass-api.de/api/interpreter', {method:'POST',body:new URLSearchParams({data:query}),signal});
  if (!result.ok) throw new Error('postcode-lookup-failed');
  const venues = ((await result.json()).elements || []).map(element => {
    const tags = element.tags || {}, lat = element.lat ?? element.center?.lat, lon = element.lon ?? element.center?.lon;
    return {osm:(element.type === 'node' ? 'N' : element.type === 'way' ? 'W' : 'R') + element.id,
      name:tags.name || tags.brand || '', street:[tags['addr:housenumber'],tags['addr:street']].filter(Boolean).join(' '),
      area:tags['addr:suburb'] || tags['addr:city'] || '', postcode:tags['addr:postcode'] || '',
      kind:(tags.amenity || '').replace(/_/g, ' '), lat,lon,lookupPostcode:postcode,
      exactPostcode:fullPostcode(tags['addr:postcode'] || '') === postcode};
  }).filter(venue => venue.name && Number.isFinite(venue.lat) && Number.isFinite(venue.lon))
    .sort((a,b) => Number(b.exactPostcode)-Number(a.exactPostcode) || kmBetween({lat:point.latitude,lon:point.longitude},a)-kmBetween({lat:point.latitude,lon:point.longitude},b));
  const unique = venues.filter((venue,index) => !venues.slice(0,index).some(other => other.name === venue.name && kmBetween(other,venue)<0.03)).slice(0,8);
  postcodeVenues.set(postcode, unique);
  return unique;
}

// Saves a search result as a place, or returns the place already saved for it.
function placeFromResult(r) {
  const existing = store.places.find((p) => p.osm === r.osm);
  if (existing) {
    updatePlace(existing.id, {postcode:existing.postcode || r.postcode || '',lookupPostcode:r.lookupPostcode || existing.lookupPostcode || ''});
    return getPlace(existing.id);
  }
  const place = {
    ...addPlace(r.name),
    osm: r.osm,
    postcode: r.postcode || '',
    lookupPostcode: r.lookupPostcode || '',
    area: r.area || r.street,
    address: addressLine(r),
    loc: { lat: r.lat, lng: r.lon },
  };
  updatePlace(place.id, place);
  return place;
}

// Search box: your saved places first (instant, works offline), then
// matching venues near your work area from OpenStreetMap.
function placePicker(container, label, onPick) {
  container.innerHTML = `
    <label class="field"><span>${label}</span>
      <input type="text" class="picker-input" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Enter pickup postcode, e.g. M1 2AQ"></label>
    <div class="sugg"></div>`;
  const input = $('.picker-input', container);
  const list = $('.sugg', container);
  let remote = [], status = '', ctrl = null, wait = null, sequence = 0;

  const show = () => {
    const q = input.value.trim().toLowerCase();
    const postcode = fullPostcode(q);
    if (!q) { list.innerHTML = ''; return; }
    const saved = store.places
      .filter((p) => `${p.name} ${p.area} ${p.address || ''} ${p.postcode || ''} ${p.lookupPostcode || ''}`.toLowerCase().replace(/\s/g,'').includes(q.replace(/\s/g,'')))
      .sort((a, b) => (b.waits || []).length - (a.waits || []).length)
      .slice(0, 4);
    const savedOsm = new Set(saved.map((p) => p.osm).filter(Boolean));
    const found = remote.filter((r) => !savedOsm.has(r.osm));
    list.innerHTML =
      (saved.length ? `<div class="sugg-head">Your places</div>` + saved.map((p) => `
        <button type="button" data-id="${esc(p.id)}">
          <span><b>${placeName(p)}</b>${p.address ? `<small>${esc(p.address)}</small>` : ''}<small>${placeMeta(p)}</small></span>${easeTag(p)}
        </button>`).join('') : '') +
      (found.length ? `<div class="sugg-head">${postcode ? 'Around ' + esc(postcode) + ' · choose your restaurant' : 'Near ' + esc(store.area.name.split(',')[0])}</div>` + found.map((r, i) => `
        <button type="button" data-remote="${remote.indexOf(r)}">
          <span><b>${esc(r.name)}</b><small>${esc(addressLine(r)) || 'No address listed'}</small>${postcode ? `<small>${r.exactPostcode ? 'Postcode matches' : 'Nearby · check branch/address'}</small>` : ''}${r.kind ? `<small class="kind">${esc(r.kind)}</small>` : ''}</span>
        </button>`).join('') : '') +
      (status ? `<div class="sugg-status">${status}</div>` : '') +
      (postcode ? `<button type="button" data-new="1"><span class="accent-text">Use ${esc(postcode)} only<small>Restaurant not confirmed · you can name it later in Places</small></span></button>` : q.length >= 2 && !/^[a-z]{1,2}\d/i.test(q) ? `<button type="button" data-new="1"><span class="accent-text">+ Not listed? Add "${esc(input.value.trim())}"</span></button>` : '') +
      (found.length ? `<div class="sugg-status small">Search results © OpenStreetMap contributors</div>` : '');
  };

  input.addEventListener('input', () => {
    clearTimeout(wait);
    if (ctrl) ctrl.abort();
    const request = ++sequence;
    remote = [];
    const q = input.value.trim();
    const postcode = fullPostcode(q), partialPostcode = !postcode && /^[a-z]{1,2}\d/i.test(q);
    status = partialPostcode ? 'Enter the full pickup postcode, e.g. M1 2AQ.' : q.length >= 3 ? 'Searching…' : '';
    show();
    if (q.length < 3 || partialPostcode) return;
    wait = setTimeout(async () => {
      if (!container.isConnected || request !== sequence) return;
      ctrl = new AbortController();
      const controller = ctrl;
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const results = postcode ? await searchPostcode(postcode, controller.signal) : await searchVenues(q, controller.signal);
        if (request !== sequence || !container.isConnected) return;
        remote = results;
        status = remote.length ? (postcode ? 'A postcode can cover several businesses. Check the branch before choosing.' : '') : postcode ? 'No restaurants listed here. Use the postcode only, or search by name.' : `No matches near ${esc(store.area.name.split(',')[0])}. Try fewer letters.`;
      } catch (e) {
        if (request !== sequence || !container.isConnected) return;
        status = e.message === 'postcode-not-found' ? 'Postcode not found. Check it, or use the postcode only.' : navigator.onLine === false ? 'No signal: showing your saved places only' : postcode ? "Lookup unavailable. You can still use the postcode only or a saved place." : "Search isn't working right now";
      } finally { clearTimeout(timeout); }
      show();
    }, 350);
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.new) {
      const postcode = fullPostcode(input.value);
      if (!postcode) return onPick(addPlace(input.value));
      const existing = store.places.find(p => p.postcodeOnly && p.postcode === postcode);
      if (existing) return onPick(existing);
      const place = {...addPlace('Pickup at ' + postcode),postcode,address:postcode,postcodeOnly:true};
      updatePlace(place.id,place); onPick(place);
    }
    else if (b.dataset.remote !== undefined) onPick(placeFromResult(remote[+b.dataset.remote]));
    else onPick(getPlace(b.dataset.id));
  });
  return input;
}

// Parking type, time limit, how easy, and a note. Each tap saves straight away.
function parkingEditor(p) {
  const chips = (key, options, cls = '') => `
    <div class="chips ${cls}">${Object.entries(options).map(([v, text]) =>
      `<button type="button" data-k="${key}" data-v="${v}" aria-pressed="${p[key] === v}">${text}</button>`).join('')}</div>`;
  return `
    <h2>Where did you park?</h2>${chips('parkType', PARK_TYPES)}
    <h2>Time limit</h2>${chips('parkLimit', PARK_LIMITS, 'four')}
    <h2>How easy?</h2>${chips('ease', EASE, 'three')}
    <label class="field"><span>Note for next time</span>
      <textarea name="note" rows="2" maxlength="300" placeholder="e.g. bays round the back on Mill St">${esc(p.note)}</textarea></label>`;
}

function bindParkingEditor(root, id) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    const on = b.getAttribute('aria-pressed') !== 'true';
    root.querySelectorAll(`[data-k="${b.dataset.k}"]`).forEach((x) => x.setAttribute('aria-pressed', 'false'));
    b.setAttribute('aria-pressed', String(on));
    updatePlace(id, { [b.dataset.k]: on ? b.dataset.v : '' });
  });
  const note = $('textarea[name=note]', root);
  note.addEventListener('change', () => updatePlace(id, { note: note.value.trim() }));
}

// ---------- Order: offer → pickup → waiting → deliver ----------

const EMPTY_ORDER = { step: 'offer', fee: '', miles: '', mins: '', placeId: null, arrivedAt: null, collectedAt: null };

function setOrder(changes) {
  store.order = { ...store.order, ...changes };
}

function stepPills(current) {
  const steps = ['offer', 'pickup', 'waiting', 'deliver'];
  const names = ['Offer', 'Pickup', 'Waiting', 'Deliver'];
  const at = steps.indexOf(current);
  return `<ol class="steps" aria-label="Order steps">${names.map((n, i) => i < at
    ? `<li class="done">✓ ${n}</li>`
    : `<li class="${i === at ? 'on' : ''}"${i === at ? ' aria-current="step"' : ''}>${i + 1} ${n}</li>`).join('')}</ol>`;
}

function renderOrder(view) {
  const order = store.order;
  const active = order.step !== 'offer' || !!order.acceptedAt;
  if (!active && store.platform === 'all') return renderOrderOverview(view);
  if (active && order.workflowMode === 'simple') renderDeliver(view);
  else if (order.step === 'pickup') renderPickup(view);
  else if (order.step === 'waiting') renderWaiting(view);
  else if (order.step === 'deliver') renderDeliver(view);
  else renderOffer(view);
  const record = active ? order : { platformId: store.platform };
  const context = `<div class="order-platform-context">${platformBadge(record)}
    ${active && store.platform !== 'all' && store.platform !== order.platformId ? `<p class="muted small">Current order: ${esc(platformName(order.platformId, order.platformName))}. Changing provider in Settings does not change this order.</p>` : ''}</div>`;
  const steps = $('.steps', view);
  if (steps) steps.insertAdjacentHTML('afterend', context);
  else view.insertAdjacentHTML('afterbegin', context);
}

function renderOffer(view) {
  const o = store.order;
  const simple = o.acceptedAt ? o.workflowMode === 'simple' : workflowMode() === 'simple';
  view.innerHTML = `
    ${simple ? '' : stepPills('offer')}
    <form id="of" class="card offer-entry" novalidate>
      <div class="pair">
        <label class="field"><span>Fee (£)</span>
          <input name="fee" type="number" inputmode="decimal" step="0.01" min="0" placeholder="e.g. 4.50" value="${esc(o.fee)}"></label>
        <label class="field"><span>Miles</span>
          <input name="miles" type="number" inputmode="decimal" step="0.1" min="0" placeholder="e.g. 2.5" value="${esc(o.miles)}"></label>
      </div>
      <section class="screenshot-import" aria-labelledby="screenshot-heading">
        <label class="field"><span id="screenshot-heading">Offer screenshot <small>(optional)</small></span><input id="offer-screenshot" type="file" accept="image/png,image/jpeg,image/webp,image/bmp"></label>
        <p class="muted small" id="screenshot-status" role="status">Choose your latest screenshot. Read locally; the image is not uploaded or saved by this app.</p>
        <button class="btn link" id="cancel-screenshot" type="button" hidden>Use manual entry</button>
        <details class="net-details screenshot-review" id="screenshot-review"${o.offerDetails ? ' open' : ' hidden'}><summary>Check extracted locations</summary>
          <label class="field"><span>Pickup name and address</span><textarea id="screenshot-pickup" rows="2" maxlength="600">${esc(o.offerDetails?.pickup || '')}</textarea></label>
          <label class="field"><span>Drop-offs <small>(one address per line)</small></span><textarea id="screenshot-dropoffs" rows="3" maxlength="2400">${esc((o.offerDetails?.dropoffs || []).join('\n'))}</textarea></label>
          <p class="muted small">Check these before Confirm. Blank or uncertain fields can be left out. Locations are stored as text, not verified map positions.</p>
        </details>
      </section>
      <div id="order-result" class="offer-preview" aria-live="polite"></div>
      ${simple ? '' : '<div id="offer-place"></div>'}
      <p class="error" id="offer-error" role="alert" hidden></p>
      <button class="btn primary huge" type="button" id="take">${simple ? 'Confirm' : 'Picked up'}</button>
      ${simple ? '<p class="muted small">Estimated from mileage and your configured speed and stop allowance, before tax. Actual waiting and return travel may change the result.</p>' : `<details class="offer-extra"${o.mins !== '' ? ' open' : ''}><summary>Offer time & calculation</summary>
        <label class="field"><span>Minutes <small>(optional, if the offer shows a time)</small></span>
          <input name="mins" type="number" inputmode="numeric" min="0" placeholder="Leave blank to estimate" value="${esc(o.mins)}"></label>
        <p class="muted small" id="offer-calculation"></p>
      </details>`}
      <button class="btn link" type="button" id="clear">${o.acceptedAt ? 'Cancel this order' : 'Clear for next order'}</button>
    </form>`;

  const f = $('#of');
  const screenshot = $('#offer-screenshot'), importStatus = $('#screenshot-status'), cancelScreenshot = $('#cancel-screenshot');
  const pickupInput = $('#screenshot-pickup'), dropoffInput = $('#screenshot-dropoffs');
  const saveLocations = () => setOrder({offerDetails:{...store.order.offerDetails,pickup:pickupInput.value.trim(),dropoffs:dropoffInput.value.split('\n').map(value=>value.trim()).filter(Boolean)}});
  pickupInput.oninput = saveLocations; dropoffInput.oninput = saveLocations;
  screenshot.onchange = () => {
    if (offerScreenshotCancel) offerScreenshotCancel();
    const file = screenshot.files[0];
    if (!file) return;
    if (!window.OfferOCR?.read) { screenshot.value=''; importStatus.textContent='The screenshot reader is unavailable. Refresh the app or enter details manually.'; return; }
    const controller = new AbortController();let done = false;
    const before = {fee:f.fee.value,miles:f.miles.value,pickup:pickupInput.value,dropoffs:dropoffInput.value};
    const stop = message => {
      if (done) return;done = true;controller.abort();clearTimeout(deadline);screenshot.value='';cancelScreenshot.hidden=true;
      if (message && f.isConnected) importStatus.textContent=message;
    };
    const deadline = setTimeout(()=>stop('Reading reached the 10-second limit. Check your connection on first use, try again, or enter the details manually.'),10000);
    offerScreenshotCancel=()=>stop();
    cancelScreenshot.hidden=false;cancelScreenshot.onclick=()=>stop('Reading stopped. Enter fee and miles manually and continue.');
    importStatus.textContent='Reading screenshot… up to 10 seconds. You can still enter values or Confirm.';
    OfferOCR.read(file,{signal:controller.signal,onProgress:message=>{if(!done&&f.isConnected)importStatus.textContent=message+' You can continue manually.';}}).then(result=>{
      if(done || !f.isConnected || store.order.acceptedAt || store.order.step !== 'offer') return;
      const warnings=[...result.warnings];
      for(const key of ['fee','miles']) {
        if(result[key] !== null && f[key].value === before[key]) f[key].value=String(result[key]);
        else if(f[key].value !== before[key]) warnings.push('Your edited '+key+' was kept.');
      }
      if(pickupInput.value === before.pickup)pickupInput.value=result.pickup;
      if(dropoffInput.value === before.dropoffs)dropoffInput.value=result.dropoffs.join('\n');
      setOrder({offerDetails:{source:'screenshot',importedAt:new Date().toISOString(),pickup:pickupInput.value.trim(),dropoffs:dropoffInput.value.split('\n').map(value=>value.trim()).filter(Boolean)}});
      $('#screenshot-review').hidden=false;$('#screenshot-review').open=true;update();
      importStatus.textContent='Reading complete—check fee, mileage and locations before Confirm. '+warnings.join(' ');
    }).catch(error=>{
      if(!done&&f.isConnected)importStatus.textContent='Could not read this screenshot. '+(error.message?.includes('Choose a')?error.message:'Enter the details manually or try again.');
    }).finally(()=>stop());
  };
  const update = () => {
    $('#offer-error').hidden = true;
    setOrder({ fee: f.fee.value.trim(), miles: f.miles.value.trim(), mins: simple ? '' : f.mins.value.trim() });
    const { fee: feeText, miles: milesText, mins: minsText, placeId } = store.order;
    const s = store.settings;
    const place = simple ? null : getPlace(placeId);
    const wait = place ? avgWait(place) : null;
    const fee = parseFloat(feeText), miles = parseFloat(milesText), mins = parseFloat(minsText);
    const r = feeText !== '' && milesText !== '' && fee >= 0 && miles >= 0 ? calcOrder(s, fee, miles, mins, wait) : null;
    if (!r) {
      $('#order-result').innerHTML = `<div class="offer-empty muted">Type the fee and miles.<br>Your estimated £/hr appears here.</div>`;
      if ($('#offer-calculation')) $('#offer-calculation').textContent = 'Leave Minutes blank to estimate time from mileage, your configured speed and restaurant wait.';
      return;
    }
    const [icon, word] = { good: ['✓', 'Worth taking'], ok: ['!', 'Borderline'], poor: ['✕', 'Not worth it'] }[r.grade];
    const stops = wait !== null
      ? `${Math.round(wait)} min avg wait at ${esc(place.name)} + ${num(s.handoverMins)} min parking & handover`
      : `${num(s.stopMins)} min stops`;
    $('#order-result').innerHTML = `
      <div class="offer-verdict ${r.grade}">
        <div class="offer-verdict-heading"><div class="offer-rate">${money(r.hourly)}<small>/hr profit</small></div>
        <div class="verdict"><span class="verdict-icon" aria-hidden="true">${icon}</span>${word}</div></div>
        <div class="row3">
          <div><b>${money(r.profit)}</b><small>profit</small></div>
          <div><b>${money(r.costs)}</b><small>costs</small></div>
          <div><b>${Math.round(r.mins)} min</b><small>${r.estimated ? 'estimated' : 'from offer'}</small></div>
        </div>
      </div>`;
    if ($('#offer-calculation')) $('#offer-calculation').innerHTML = `${r.estimated ? `Time estimated: ${num(miles)} mi at ${num(s.townMph)} mph + ${stops}. ` : 'Uses the entered offer time. '}Worth taking from ${money(s.goodPerHour)}/hr, borderline from ${money(s.okPerHour)}/hr`;
  };

  const showPlace = () => {
    const slot = $('#offer-place');
    const place = getPlace(store.order.placeId);
    if (!place) {
      placePicker(slot, 'Pickup postcode <small>(optional)</small>', (p) => { setOrder({ placeId: p.id }); showPlace(); update(); });
      return;
    }
    slot.innerHTML = `
      <div class="field">
        <span>Restaurant</span>
        <div class="picked">
          <div><b>${placeName(place)}</b><small>${placeMeta(place)}</small></div>
          ${easeTag(place)}
        </div>
        <button type="button" class="btn link" id="change-place">Change restaurant</button>
      </div>`;
    $('#change-place').onclick = () => { setOrder({ placeId: null }); showPlace(); update(); $('.picker-input').focus(); };
  };

  f.addEventListener('input', (e) => { if (!e.target.classList.contains('picker-input')) update(); });
  f.onsubmit = (e) => e.preventDefault();
  $('#take').onclick = () => {
    if (simple && (f.fee.value === '' || f.miles.value === '' || !Number.isFinite(+f.fee.value) || !Number.isFinite(+f.miles.value) || +f.fee.value < 0 || +f.miles.value < 0)) {
      $('#offer-error').textContent = 'Enter the fee and mileage (zero or more).'; $('#offer-error').hidden = false; return;
    }
    const platform = store.platforms.find((p) => p.id === store.platform);
    if (!store.order.acceptedAt && !platform) return;
    // Starting another job needs no separate dismissal of the last GPS card.
    if (deliveryCapture) { stopDeliveryCapture(); deliveryCapture = null; showDeliveryCapture(); }
    const active = store.active;
    // Also give shifts started by an older app version a stable link.
    if (active && !active.id) store.active = { ...active, id: newId() };
    const order = store.order;
    const place = getPlace(order.placeId);
    const screenshotName = order.offerDetails?.pickup?.split(',')[0]?.trim() || '';
    setOrder({ step: simple ? 'deliver' : 'pickup', id: order.id || newId(), acceptedAt: order.acceptedAt || new Date().toISOString(),
      workflowMode:simple ? 'simple' : 'detailed', ...(simple ? {placeId:null,arrivedAt:null,collectedAt:null,mins:''} : {}),
      platformId: order.acceptedAt ? order.platformId : platform.id,
      platformName: order.acceptedAt ? order.platformName : platform.name,
      shiftId: order.shiftId || store.active?.id || null, restaurantName: simple ? screenshotName : place?.name || screenshotName, settings: order.settings || store.settings });
    render();
  };
  $('#clear').onclick = () => {
    if (store.order.acceptedAt && !confirm('Cancel this accepted order? No completed delivery will be saved.')) return;
    store.order = { ...EMPTY_ORDER }; render();
  };
  if (!simple) showPlace();
  update();
  if (store.order.fee === '') f.fee.focus();
}

function renderPickup(view) {
  const place = getPlace(store.order.placeId);
  view.innerHTML = `
    ${stepPills('pickup')}
    <div id="pickup-place"></div>
    <button class="btn link" id="back">Back to offer</button>
    <button class="btn link danger-outline" id="cancel-pickup">Cancel order</button>`;

  const slot = $('#pickup-place');
  if (!place) {
    slot.className = 'card';
    placePicker(slot, 'Pickup postcode <small>(or restaurant name)</small>', (p) => { setOrder({ placeId: p.id }); render(); });
  } else {
    const wait = avgWait(place);
    slot.innerHTML = `
      <div class="card">
        <div class="place-head"><div><h2 class="place-title">${esc(place.name)}</h2><span class="muted">${esc(place.address || place.area) || (place.waits.length ? '' : 'First visit')}</span></div>${easeTag(place)}</div>
        <button class="btn primary huge" id="arrived">I've arrived</button>
        ${parkingLine(place)}
        ${place.note ? `<div class="note">📝 ${esc(place.note)}</div>` : ''}
        ${wait !== null ? `<div class="facts"><div><b>${Math.round(wait)} min</b><small>avg wait</small></div><div><b>${place.waits.length}</b><small>visit${place.waits.length > 1 ? 's' : ''}</small></div></div>` : ''}
        ${place.spot
          ? `<a class="btn icon" id="directions" href="${directionsUrl(place.spot)}" target="_blank" rel="noopener">${PIN_ICON} Directions to parking</a>
             <button class="btn link" id="spot">Update parking spot to here</button>`
          : `<p class="muted small">No parking spot saved. Save one once safely parked.</p>
             ${place.loc ? `<a class="btn icon" id="to-restaurant" href="${directionsUrl(place.loc)}" target="_blank" rel="noopener">${PIN_ICON} Directions to restaurant</a>` : ''}
             <button class="btn icon" id="spot">${PIN_ICON} Save parking spot here</button>`}
      </div>`;
    $('#spot').onclick = () => saveSpot(place.id, render);
  }
  if (!place) slot.insertAdjacentHTML('beforebegin', '<button class="btn primary huge" id="arrived">I\'ve arrived</button>');
  $('#arrived').onclick = () => { setOrder({ step: 'waiting', arrivedAt: new Date().toISOString() }); render(); };
  $('#back').onclick = () => { setOrder({ step: 'offer' }); render(); };
  $('#cancel-pickup').onclick = () => {
    if (confirm('Cancel this order? No completed delivery will be saved.')) { store.order = { ...EMPTY_ORDER }; render(); }
  };
}

function renderWaiting(view) {
  const o = store.order;
  const place = getPlace(o.placeId);
  const elapsed = () => {
    const secs = Math.max(0, Math.floor((Date.now() - new Date(o.arrivedAt)) / 1000));
    return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  };
  view.innerHTML = `
    ${stepPills('waiting')}
    <div class="card center">
      <p class="muted">Waiting${place ? ` at <b>${esc(place.name)}</b>` : ''}</p>
      <div class="timer" id="wait-timer" role="timer">${elapsed()}</div>
      <button class="btn primary huge" id="got">Got the food</button>
    </div>
    <div class="card" id="wait-place"></div>
    <button class="btn link" id="cancel-order">Cancel order (don't save the wait)</button>`;

  timer = setInterval(() => { const t = $('#wait-timer'); if (t) t.textContent = elapsed(); }, 1000);

  const slot = $('#wait-place');
  if (place) {
    slot.innerHTML = `<p class="muted small">Optional. Saved straight away for next time.</p>${parkingEditor(place)}`;
    bindParkingEditor(slot, place.id);
  } else {
    placePicker(slot, 'Pickup postcode <small>(to save this wait · name also works)</small>', (p) => { setOrder({ placeId: p.id }); render(); });
  }

  $('#got').onclick = () => {
    if (store.order.step !== 'waiting') return;
    const orderId = store.order.id || newId();
    const current = getPlace(store.order.placeId);
    const mins = (Date.now() - new Date(o.arrivedAt)) / 60000;
    if (current && mins <= MAX_WAIT_MINS) {
      updatePlace(current.id, { waits: [...(current.waits || []), { at: new Date().toISOString(), mins: Math.round(mins * 10) / 10, orderId, platformId: store.order.platformId || null }] });
      toast(`Saved: ${Math.max(1, Math.round(mins))} min wait at ${current.name}`);
    } else if (current) {
      toast(`Over ${MAX_WAIT_MINS} min, so the wait wasn't saved`);
    } else {
      toast('Food collected');
    }
    setOrder({ step: 'deliver', id: orderId, restaurantName: current?.name || store.order.restaurantName || '', collectedAt: new Date().toISOString() });
    render();
  };
  $('#cancel-order').onclick = () => {
    if (!confirm('Cancel this order? The wait time won\'t be saved.')) return;
    store.order = { ...EMPTY_ORDER };
    render();
  };
}

function renderDeliver(view) {
  const o = store.order;
  const simple = o.workflowMode === 'simple';
  const place = getPlace(o.placeId);
  const elapsed = () => duration(Math.max(0, Date.now() - new Date(simple ? o.acceptedAt : o.collectedAt)) / 3600000);
  view.innerHTML = `
    ${simple ? '' : stepPills('deliver')}
    <div class="card center">
      <h2>${simple ? 'Job in progress' : 'Delivery in progress'}</h2>
      ${place || o.restaurantName ? `<p><b>${esc(place?.name || o.restaurantName)}</b></p>` : ''}
      <p class="muted">${simple ? 'Since confirming the job' : 'Since collecting the food'}</p>
      <div class="clock" id="delivery-timer" role="timer">${elapsed()}</div>
      <button class="btn primary huge" id="delivered">${simple ? 'Finish job' : 'Delivered'}</button>
      <p class="muted small">Tap once the handover is finished and you're back in your car, safely parked.</p>
    </div>
    <div class="card">
      <p class="muted small">${simple ? 'No intermediate steps to record. Your shift clock keeps counting between jobs.' : 'Includes driving, parking, walking and handover. Your shift clock keeps counting between orders.'}</p>
      ${o.fee !== '' ? `<div class="line"><span>Offer fee</span><b>${money(+o.fee)}</b></div>` : ''}
      ${simple ? `<div class="line"><span>Offer miles</span><b>${num(+o.miles)} mi</b></div>` : `<div class="line"><span>Food collected</span><b>${timeLabel(o.collectedAt)}</b></div>`}
      ${offerLocations(o)}
    </div>
    <p id="delivery-error" class="error" role="alert" hidden></p>
    <button class="btn link" id="cancel-delivery">Cancel this delivery</button>`;
  timer = setInterval(() => { const t = $('#delivery-timer'); if (t) t.textContent = elapsed(); }, 1000);
  $('#delivered').onclick = () => {
    if (store.order.step !== 'deliver') return;
    const delivery = { ...store.order, id: o.id || newId(), restaurantName: place?.name || o.restaurantName || '',
      completedAt: new Date().toISOString() };
    delete delivery.step;
    try {
      // Save before clearing the active order; retrying cannot duplicate it.
      store.deliveries = [...store.deliveries.filter((d) => d.id !== delivery.id), delivery];
      store.order = { ...EMPTY_ORDER };
    } catch {
      const error = $('#delivery-error');
      error.textContent = "Couldn't save this delivery. Free up storage and try again; keep this screen open.";
      error.hidden = false;
      return;
    }
    toast('Delivery saved. Ready for the next order');
    render();
    if (captureEnabled()) startDeliveryCapture(delivery.id);
  };
  $('#cancel-delivery').onclick = () => {
    if (!confirm(simple ? 'Cancel this job? No completed delivery will be saved.' : 'Cancel this delivery? No completed delivery will be saved. The restaurant wait already recorded will be kept.')) return;
    store.order = { ...EMPTY_ORDER };
    render();
  };
}

// Completed orders keep their own restaurant name, even if a place is later deleted.
function offerLocations(record) {
  const details=record.offerDetails;
  if(!details || (!details.pickup && !details.dropoffs?.length))return '';
  return `<details class="net-details"><summary>Offer locations</summary>
    ${details.pickup ? `<p class="small"><b>Pickup</b><br>${esc(details.pickup)}</p>` : ''}
    ${(details.dropoffs || []).map((address,index)=>`<p class="small"><b>Drop-off ${index+1}</b><br>${esc(address)}</p>`).join('')}
    <p class="muted small">From the offer screenshot/review. Text only; not verified map locations.</p></details>`;
}
function deliveryHistory(deliveries = store.deliveries) {
  if (!deliveries.length) return '';
  const interval = (a, b) => a && b ? duration(Math.max(0, new Date(b) - new Date(a)) / 3600000) : 'Not recorded';
  const line = (label, value) => `<div class="line"><span>${label}</span><b>${value}</b></div>`;
  return `<h2>Completed deliveries</h2>
    <p class="muted small">Offer fees are recorded here. Enter final earnings, including tips, when you end your shift.</p>` +
    [...deliveries].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)).map((d) => `
      <details class="card delivery-record">
        <summary><b>${esc(getPlace(d.placeId)?.name || d.restaurantName || 'Delivery')}</b> ${platformBadge(d)}<small>${dateLabel(d.completedAt)} · ${timeLabel(d.completedAt)} · ${d.fee !== '' ? money(+d.fee) : 'Fee not entered'}${d.correctedAt ? ' · Corrected' : ''}</small></summary>
        <label class="field"><span>Delivery platform <small>(changes save automatically)</small></span>
          <select data-delivery-platform="${esc(d.id)}">
            <option value=""${!d.platformId ? ' selected' : ''}>Platform not recorded</option>
            ${!store.platforms.some((p) => p.id === d.platformId) && d.platformId ? `<option value="${esc(d.platformId)}" selected>${esc(platformName(d.platformId, d.platformName))}</option>` : ''}
            ${store.platforms.map((p) => `<option value="${esc(p.id)}"${d.platformId === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
        </label>
        ${line('Accepted', d.acceptedAt ? timeLabel(d.acceptedAt) : 'Not recorded')}
        ${line('At restaurant', d.arrivedAt ? timeLabel(d.arrivedAt) : 'Not recorded')}
        ${d.workflowMode === 'simple' ? '<p class="muted small">Simple mode · restaurant stages not recorded.</p>' : ''}
        ${line('Food collected', d.collectedAt ? timeLabel(d.collectedAt) : 'Not recorded')}
        ${line('Delivered', timeLabel(d.completedAt))}
        ${line('Restaurant wait', deliveryWaitMinutes(d) !== null ? num(Math.round(deliveryWaitMinutes(d)*10)/10) + ' min' + (manualWaitMinutes(d) !== null ? ' · manual' : '') : 'Not recorded')}
        ${line('Collection to completion', interval(d.collectedAt, d.completedAt))}
        ${line('Acceptance to completion', interval(d.acceptedAt, d.completedAt))}
        ${d.miles !== '' ? line('Miles from offer', num(+d.miles)) : ''}
        ${offerLocations(d)}
        ${d.deliveryLocation ? `${line('Delivery location', 'Saved · ±' + Math.ceil(d.deliveryLocation.accuracy) + ' m')}
          <p class="muted small">${esc(d.deliveryLocation.latitude)}, ${esc(d.deliveryLocation.longitude)} · captured ${esc(dateLabel(d.deliveryLocation.capturedAt))} ${esc(timeLabel(d.deliveryLocation.capturedAt))}. This is your completion position, not a measured route.</p>
          <button class="btn link" data-remove-location="${esc(d.id)}">Remove saved location</button>` : ''}
        <a class="btn" href="#delivery-edit/${esc(d.id)}">Edit delivery</a>
        ${d.correctedAt ? `<p class="muted small">Corrected ${dateLabel(d.correctedAt)} · ${timeLabel(d.correctedAt)}. Original values are kept in Edit delivery.</p>` : ''}
      </details>`).join('');
}

// Corrections retain the initial values; timestamps keep their exact precision
// unless the corresponding input was changed explicitly.
const DELIVERY_FIELDS = ['fee', 'miles', 'acceptedAt', 'arrivedAt', 'collectedAt', 'completedAt', 'manualWaitMins'];
const DELIVERY_TIMES = { acceptedAt: 'Accepted', arrivedAt: 'At restaurant', collectedAt: 'Food collected', completedAt: 'Delivered' };
function renderDeliveryEdit(view, id) {
  const delivery = store.deliveries.find(d => d.id === id);
  if (!delivery) return go('#history');
  const back = location.hash.split('/')[2] === 'place' && getPlace(delivery.placeId) ? '#place/' + delivery.placeId : delivery.shiftId && store.shifts.some(s => s.id === delivery.shiftId) ? '#shift/' + delivery.shiftId : '#history';
  const localTime = value => {
    if (!value || !Number.isFinite(+new Date(value))) return '';
    const date = new Date(value);
    return new Date(+date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  };
  const initial = Object.fromEntries(Object.keys(DELIVERY_TIMES).map(key => [key, localTime(delivery[key])]));
  const original = delivery.originalValues;
  const initialWait = deliveryWaitMinutes(delivery) !== null ? String(Math.round(deliveryWaitMinutes(delivery)*10)/10) : '';
  const originalLine = (label, value) => `<div class="line"><span>${label}</span><b>${esc(value)}</b></div>`;
  view.innerHTML = `
    <h2>Edit delivery</h2>
    <p>${esc(getPlace(delivery.placeId)?.name || delivery.restaurantName || 'Delivery')} ${platformBadge(delivery)}</p>
    <p class="muted small">Correct a missed tap or entry while parked. Changes save only when you press Save corrections.</p>
    <form id="delivery-edit-form" class="card" novalidate>
      <div class="pair">
        <label class="field"><span>Offer fee (£)</span><input name="fee" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(delivery.fee ?? '')}"></label>
        <label class="field"><span>Offer miles</span><input name="miles" type="number" inputmode="decimal" min="0" step="0.1" value="${esc(delivery.miles ?? '')}"></label>
      </div>
      <label class="field"><span>Restaurant wait (minutes)</span><input name="waitMins" type="number" inputmode="decimal" min="0" max="1440" step="0.1" value="${initialWait}" placeholder="e.g. 7"></label>
      <p class="muted small">Enter the actual wait if a button was pressed late or just to move on. This overrides the wait duration without changing timestamps. Clear to use the timestamps again.</p>
      ${Object.entries(DELIVERY_TIMES).map(([key, label]) => `<label class="field"><span>${label}${key === 'acceptedAt' || key === 'arrivedAt' || (key === 'collectedAt' && delivery.workflowMode === 'simple') ? ' <small>(optional if not recorded)</small>' : ''}</span><input name="${key}" type="datetime-local" step="1" value="${initial[key]}"></label>`).join('')}
      <p class="muted small">Times are local to this device. Leave unknown optional timings blank. ${delivery.workflowMode === 'simple' ? 'Delivered is required; restaurant stages were not recorded in Simple mode.' : 'Food collected and Delivered are required.'}</p>
      <p class="muted small">Offer corrections update live estimates and delivery analysis. Saved shift profit still uses the shift's final earnings and actual mileage; edit the shift separately if those totals are wrong.</p>
      <p class="error" id="correction-error" role="alert" tabindex="-1" hidden></p>
      <button class="btn primary huge" type="submit">Save corrections</button>
      <a class="btn link" href="${esc(back)}">Cancel</a>
    </form>
    ${original ? `<details class="card delivery-record"><summary>Original recorded values</summary>
      ${originalLine('Offer fee', original.fee !== '' && original.fee != null ? money(+original.fee) : 'Not recorded')}
      ${originalLine('Offer miles', original.miles !== '' && original.miles != null ? num(+original.miles) + ' mi' : 'Not recorded')}
      ${originalLine('Restaurant wait', deliveryWaitMinutes(original) !== null ? num(Math.round(deliveryWaitMinutes(original)*10)/10) + ' min' : 'Not recorded')}
      ${Object.entries(DELIVERY_TIMES).map(([key, label]) => originalLine(label, original[key] ? localTime(original[key]).replace('T', ' ') : 'Not recorded')).join('')}
      <p class="muted small">Before the first correction. Latest correction: ${esc(dateLabel(delivery.correctedAt))} · ${esc(timeLabel(delivery.correctedAt))}.</p></details>` : ''}`;
  const form = $('#delivery-edit-form');
  // Browsers may omit zero seconds from datetime-local values. Compare against
  // the rendered input so untouched originals keep their exact representation.
  for (const key of Object.keys(DELIVERY_TIMES)) initial[key] = form.elements[key].value;
  form.onsubmit = event => {
    event.preventDefault();
    const fail = message => { const error = $('#correction-error'); error.textContent = message; error.hidden = false; error.focus(); };
    const deliveries = store.deliveries;
    const current = deliveries.find(d => d.id === id);
    if (!current || JSON.stringify(current) !== JSON.stringify(delivery)) return fail('This record changed elsewhere. Reopen Edit delivery before saving.');
    const values = {};
    const waitInput = form.elements.waitMins;
    const waitChanged = waitInput.value !== initialWait;
    if (waitInput.validity.badInput || (waitInput.value !== '' && (!Number.isFinite(+waitInput.value) || +waitInput.value < 0 || +waitInput.value > 1440))) return fail('Enter a wait from 0 to 1440 minutes, or clear it to use timestamps.');
    if (waitChanged) values.manualWaitMins = waitInput.value === '' ? null : +waitInput.value;
    for (const key of ['fee', 'miles']) {
      const input = form.elements[key], value = input.value.trim();
      if (input.validity.badInput || (value !== '' && (!Number.isFinite(+value) || +value < 0))) return fail('Fee and mileage must be zero or more, or left blank.');
      values[key] = value === '' ? '' : +value;
    }
    for (const key of Object.keys(DELIVERY_TIMES)) {
      const value = form.elements[key].value;
      if (!value && (key === 'completedAt' || (key === 'collectedAt' && delivery.workflowMode !== 'simple'))) return fail(delivery.workflowMode === 'simple' ? 'Enter the Delivered time.' : 'Enter Food collected and Delivered times.');
      values[key] = value === initial[key] ? (delivery[key] || null) : value ? new Date(value).toISOString() : null;
    }
    let previous = null;
    const parent = store.shifts.find(s => s.id === delivery.shiftId) || (store.active?.id === delivery.shiftId ? store.active : null);
    for (const key of Object.keys(DELIVERY_TIMES)) {
      if (!values[key]) continue;
      const at = +new Date(values[key]);
      if (!Number.isFinite(at) || at > Date.now()) return fail('Times must be valid and cannot be in the future.');
      if (previous !== null && at < previous) return fail('Times must follow Accepted → At restaurant → Food collected → Delivered.');
      if (parent && (at < +new Date(parent.start) || (parent.end && at > +new Date(parent.end)))) return fail('Delivery times must stay within the linked shift. Edit the shift first if its boundaries are wrong.');
      previous = at;
    }
    const changed = DELIVERY_FIELDS.filter(key => key !== 'manualWaitMins').some(key => ['fee','miles'].includes(key)
      ? String(delivery[key] ?? '') !== String(values[key]) : (delivery[key] || null) !== values[key]);
    if (!changed && !(waitChanged && (delivery.manualWaitMins ?? null) !== (values.manualWaitMins ?? null))) { toast('No changes to save'); return go(back); }
    const corrected = { ...delivery, ...values, correctedAt: new Date().toISOString(),
      originalValues: original || Object.fromEntries(DELIVERY_FIELDS.map(key => [key, delivery[key] ?? null])) };
    const places = store.places;
    const updatedPlaces = places.map(place => {
      const hasWait = (place.waits || []).some(w => w.orderId === id);
      if (place.id !== delivery.placeId && !hasWait) return place;
      const waits = (place.waits || []).filter(w => w.orderId !== id);
      const mins = deliveryWaitMinutes(corrected);
      if (mins !== null && mins >= 0 && (manualWaitMinutes(corrected) !== null || mins <= MAX_WAIT_MINS)) waits.push({at:values.collectedAt,mins:Math.round(mins*10)/10,orderId:id,platformId:delivery.platformId || null});
      waits.sort((a, b) => new Date(a.at) - new Date(b.at));
      return { ...place, waits };
    });
    // Roll back the wait-cache update if saving the delivery fails.
    try {
      store.places = updatedPlaces;
      try { store.deliveries = deliveries.map(d => d.id === id ? corrected : d); }
      catch (error) { store.places = places; throw error; }
    } catch { return fail('Could not save corrections. Check available storage and try again.'); }
    toast('Delivery corrected'); go(back);
  };
}

// ---------- Places tab ----------

let placesSort = 'visits';

function renderPlaces(view) {
  view.innerHTML = `
    ${store.platform !== 'all' ? `<p class="muted small">Collections recorded for ${esc(platformName(store.platform))}. Parking, notes and restaurant wait averages are shared.</p>` : ''}
    <div class="card">
      <label class="field"><span>Search your places</span>
        <input id="place-search" type="search" autocomplete="off" placeholder="e.g. Nando's"></label>
      <div class="chips two" role="group" aria-label="Sort">
        <button type="button" data-sort="visits" aria-pressed="${placesSort === 'visits'}">Most visited</button>
        <button type="button" data-sort="slowest" aria-pressed="${placesSort === 'slowest'}">Slowest wait</button>
      </div>
    </div>
    <div id="place-list"></div>`;

  const search = $('#place-search');
  const show = () => {
    const q = search.value.trim().toLowerCase();
    const places = (store.platform === 'all' ? store.places : platformPlaces())
      .filter((p) => `${p.name} ${p.area} ${p.address || ''}`.toLowerCase().includes(q))
      .sort(placesSort === 'slowest'
        ? (a, b) => (avgWait(b) ?? -1) - (avgWait(a) ?? -1)
        : (a, b) => (b.waits || []).length - (a.waits || []).length || a.name.localeCompare(b.name));
    const add = q && !store.places.some((p) => p.name.toLowerCase() === q)
      ? `<button class="btn" id="add-place">+ Add "${esc(search.value.trim())}"</button>` : '';
    $('#place-list').innerHTML = places.length
      ? places.map((p) => `
          <a class="place-row" href="#place/${esc(p.id)}">
            <span><b>${placeName(p)}</b><small>${placeMeta(p)}${p.spot ? ' · 🅿️ spot saved' : ''}</small><small>Edit name, parking & waits →</small></span>${easeTag(p)}
          </a>`).join('') + add
      : (q ? add : `<div class="card"><p class="muted">${store.platform === 'all' ? "No places yet. They're added when you pick a restaurant on an order, or search above to add one." : 'No collections recorded for this provider yet. Choose All in Settings to see every saved place.'}</p></div>`);
    const b = $('#add-place');
    if (b) b.onclick = () => go('#place/' + addPlace(search.value).id);
  };
  search.addEventListener('input', show);
  view.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => {
    placesSort = b.dataset.sort;
    view.querySelectorAll('[data-sort]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    show();
  }));
  show();
}

function renderPlace(view, id) {
  const p = getPlace(id);
  if (!p) return go('#places');
  const waits = (p.waits || []).slice(-5).reverse();
  const wait = avgWait(p);
  const visits = store.deliveries.filter(d => d.placeId === id).sort((a,b) => new Date(b.completedAt)-new Date(a.completedAt));
  view.innerHTML = `
    <h2>Edit place</h2>
    <p class="muted small">Shared restaurant · parking, notes and wait averages apply across platforms</p>
    <div class="card">
      <label class="field"><span>Restaurant name</span><input name="name" type="text" value="${esc(p.name)}" maxlength="80"></label>
      <p class="muted small">Name and area save automatically when you finish editing a field.</p>
      <label class="field"><span>Area or street <small>(helps tell branches apart)</small></span><input name="area" type="text" value="${esc(p.area)}" maxlength="80" placeholder="e.g. High Street"></label>
      ${p.address ? `<p class="muted small">📍 ${esc(p.address)}</p>` : ''}
      ${p.loc ? `<a class="btn icon" href="${directionsUrl(p.loc)}" target="_blank" rel="noopener">${PIN_ICON} Directions to restaurant</a>` : ''}
    </div>
    <div class="card">
      <h2>Wait times</h2>
      ${wait !== null
        ? `<div class="facts"><div><b>${Math.round(wait)} min</b><small>avg wait (last 10)</small></div><div><b>${p.waits.length}</b><small>visits</small></div></div>
           ${waits.filter(w => !visits.some(d => d.id === w.orderId)).map((w) => `<div class="line"><span>${dateLabel(w.at)} ${timeLabel(w.at)}</span><b>${num(w.mins)} min</b></div>`).join('')}`
        : '<p class="muted small">Timed automatically when you use "I\'ve arrived" and "Got the food" on an order.</p>'}
      ${visits.length ? '<p class="muted small">Correct each completed delivery below. Changes update this place’s average.</p>' : ''}
      ${visits.map(d => `<div class="place-visit"><div><b>${esc(dateLabel(d.completedAt))} · ${esc(timeLabel(d.completedAt))}</b><small>${deliveryWaitMinutes(d) !== null ? num(Math.round(deliveryWaitMinutes(d)*10)/10) + ' min' : 'Wait not recorded'}${manualWaitMinutes(d) !== null ? ' · manual' : ''}</small></div><a class="btn" href="#delivery-edit/${esc(d.id)}/place">Edit wait</a></div>`).join('')}
    </div>
    <div class="card">
      <h2>Parking spot</h2>
      ${p.spot
        ? `<p class="muted small">Saved ${dateLabel(p.spot.savedAt)}, to within ${Math.round(p.spot.accuracy)} m.</p>
           <a class="btn primary icon" href="${directionsUrl(p.spot)}" target="_blank" rel="noopener">${PIN_ICON} Directions to parking</a>
           <button class="btn" id="spot">Update parking spot to here</button>
           <button class="btn link" id="clear-spot">Remove saved spot</button>`
        : `<p class="muted small">No spot saved. Use this when you're parked there.</p>
           <button class="btn icon" id="spot">${PIN_ICON} Save parking spot here</button>`}
    </div>
    <div class="card" id="park-edit">${parkingEditor(p)}</div>
    <button class="btn danger-outline" id="delete-place">Delete this place</button>`;

  ['name', 'area'].forEach((k) => {
    const input = $(`input[name=${k}]`);
    input.addEventListener('change', () => {
      const v = input.value.trim();
      if (k === 'name' && !v) { input.value = p.name; return toast('A place needs a name'); }
      updatePlace(id, { [k]: v, ...(k === 'name' && p.postcodeOnly && v !== p.name ? {postcodeOnly:false} : {}) });
      toast('Saved');
    });
  });
  bindParkingEditor($('#park-edit'), id);
  $('#spot').onclick = () => saveSpot(id, render);
  const clearSpot = $('#clear-spot');
  if (clearSpot) clearSpot.onclick = () => { updatePlace(id, { spot: null }); render(); };
  $('#delete-place').onclick = () => {
    if (!confirm(`Delete ${p.name} and its saved parking and wait times?`)) return;
    store.places = store.places.filter((x) => x.id !== id);
    if (store.order.placeId === id) setOrder({ placeId: null });
    toast('Place deleted');
    location.replace('#places');
  };
}

// ---------- History ----------

function renderHistory(view) {
  const deliveries = filterDeliveries(store.deliveries);
  const related = new Set(deliveries.map((d) => d.shiftId));
  const shifts = store.platform === 'all' ? store.shifts : store.shifts.filter((s) => related.has(s.id));
  const overview = platformSummary(todaysDeliveries(), 'Today');
  if (!shifts.length) {
    view.innerHTML = `
      ${overview}${deliveryHistory(deliveries)}
      <div class="card"><p class="muted">${store.platform === 'all' ? 'No shifts yet. Start one from the Shift tab.' : `No linked shifts for ${esc(platformName(store.platform))} yet. Choose All in Settings to see every shift.`}</p></div>
      <button class="btn" onclick="location.hash='#add'">+ Add a past shift</button>`;
    return;
  }

  const groups = new Map();
  for (const s of shifts) {
    const key = startOfWeek(s.start).toISOString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  let html = `${overview}<button class="btn" onclick="location.hash='#add'">+ Add a past shift</button>${deliveryHistory(deliveries)}
    <h2>All platforms · ${store.platform === 'all' ? 'shifts' : 'linked shifts'}</h2>
    <p class="muted small">Full shift totals include shared waiting, mileage and expenses across platforms.</p>`;
  for (const [key, list] of groups) {
    const t = sumResults(list.map(calcShift));
    html += `
      <div class="week">
        <div class="week-head">
          <span>Week of ${dateLabel(key)}</span>
          <span class="${profitClass(t.profit)}">${money(t.profit)} · ${money(t.profitPerHour)}/hr</span>
        </div>
        ${list.map((s) => {
          const r = calcShift(s);
          return `
            <a class="shift-row" href="#shift/${esc(s.id)}">
              <div>
                <b>${dateLabel(s.start)}</b>
                <small>${timeLabel(s.start)}–${timeLabel(s.end)} · ${duration(r.hours)} · ${num(r.miles, 0)} mi${s.note ? ' · ' + esc(s.note) : ''}</small>
              </div>
              <div class="right">
                <b class="${profitClass(r.profitPerHour)}">${money(r.profitPerHour)}/hr</b>
                <small>${money(r.profit)}</small>
              </div>
            </a>`;
        }).join('')}
      </div>`;
  }
  view.innerHTML = html;
}

// ---------- Settings & data ----------

function renderSettings(view) {
  const s = store.settings;
  const field = (name, label, hint, step = '0.01') => `
    <label class="field">
      <span>${label}${hint ? ` <small>${hint}</small>` : ''}</span>
      <input name="${name}" type="number" inputmode="decimal" step="${step}" min="0" value="${esc(s[name])}">
    </label>`;

  view.innerHTML = `
    <section class="card">
      <h2>Job workflow</h2>
      <div class="chips two" role="group" aria-label="Job workflow">
        <button type="button" data-workflow="simple" aria-pressed="${workflowMode() === 'simple'}">Simple</button>
        <button type="button" data-workflow="detailed" aria-pressed="${workflowMode() === 'detailed'}">Detailed</button>
      </div>
      <p class="muted small">Simple: fee + miles → Confirm → Finish job, then optional location capture. Detailed adds restaurant selection, arrival and food collection timings. Applies to your next job; an accepted job keeps its workflow.</p>
    </section>
    <section class="card">
      <h2>Delivery location</h2>
      <button class="btn" id="capture-setting" aria-pressed="${captureEnabled()}">${captureEnabled() ? 'On' : 'Off'} · Save location after Delivered</button>
      <p class="muted small">Tries for up to 5 seconds while this app is visible. Stops early at estimated accuracy of 30 m or better; at the deadline a fix up to 100 m is saved and labelled approximate. Skip cancels without adding a location. Your browser asks for permission.</p>
      <p class="muted small">Coordinates, estimated accuracy and capture time stay on this phone and are included in backups. No route tracking or address lookup. Retry only while still parked at the drop-off.</p>
    </section>
    <section class="card">
      <h2>Delivery provider</h2>
      <nav id="platform-selector" class="platform-selector" aria-label="Delivery provider"></nav>
      <p class="muted small">Choose the provider for your next order and delivery history. All shows the combined overview. Shift profit always includes all providers. Accepted orders keep their recorded provider.</p>
      <form id="platform-form">
        <label class="field"><span>New platform name</span><input name="platformName" maxlength="40" placeholder="e.g. Uber Eats" autocomplete="off" required></label>
        <p id="platform-error" class="error" role="alert" hidden></p>
        <button class="btn" type="submit">Add platform</button>
      </form>
    </section>
    <form id="sf" class="card" novalidate>
      <h2>Car & fuel</h2>
      ${field('fuelPrice', 'Petrol price (£ per litre)', '', '0.001')}
      ${field('mpg', 'Average MPG', '(UK MPG, as shown on your dashboard)', '0.1')}
      ${field('maintPence', 'Maintenance (pence per mile)', '(tyres, servicing, wear. 5–10p is typical)', '0.1')}
      <h2>Insurance</h2>
      ${field('insurancePerHour', 'Insurance (£ per hour on shift)', '(pay-as-you-go, e.g. Zego)')}
      <h2>Order calculator</h2>
      ${field('goodPerHour', 'Worth taking from (£ per hour)', '(raise this as you get quicker)')}
      ${field('okPerHour', 'Borderline from (£ per hour)', '(below this: not worth it)')}
      ${field('townMph', 'Average town speed (mph)', '(used to estimate time when an offer only shows miles)', '1')}
      ${field('stopMins', 'Stop time per order (minutes)', '(restaurant wait, parking and handover, for restaurants you haven\'t timed yet)', '1')}
      ${field('handoverMins', 'Parking & handover (minutes)', '(added to a restaurant\'s average wait once you\'ve timed it)', '1')}
      <div id="derived" class="preview"></div>
      <button class="btn primary huge" type="submit">Save settings</button>
      <p class="muted small">Changes save automatically. They only affect new shifts. Saved shifts keep the figures they were recorded with.</p>
    </form>

    <div class="card">
      <h2>Restaurant search</h2>
      <label class="field"><span>Work area <small>(town, city or postcode area)</small></span>
        <input id="area" type="text" autocomplete="off" value="${esc(store.area.name)}" placeholder="e.g. Manchester"></label>
      <p class="muted small" id="area-status">Searches show restaurants within about 12 miles of ${esc(store.area.name)}.</p>
      <p class="muted small">Name searches send your query and work area to Photon. Pickup postcode searches send the postcode to Postcodes.io, then its centre to Overpass to find nearby restaurants (OpenStreetMap). Saved places work offline. Your captured delivery location, shifts and notes are not sent.</p>
    </div>

    <div class="card">
      <h2>Your data</h2>
      <p class="muted small">Everything is stored only on this phone. Download a backup now and then. If you clear Chrome's data or uninstall, anything not backed up (shifts and places) is lost.</p>
      <p class="small"><b>Last backup:</b> ${store.lastBackup ? `${dateLabel(store.lastBackup)} (${Math.floor(hoursSince(store.lastBackup) / 24)} days ago)` : 'never'}</p>
      <button class="btn" id="csv">Export shifts as spreadsheet (CSV)</button>
      <button class="btn" id="backup">Download backup file</button>
      <button class="btn" id="restore">Restore from backup file</button>
      <input type="file" id="file" accept=".json,application/json" hidden>
    </div>`;

  renderPlatformSelector();
  $('#capture-setting').onclick = () => {
    save('sp.captureDeliveryLocation', !captureEnabled());
    if (!captureEnabled() && deliveryCapture?.status === 'finding') finishDeliveryCapture('skipped');
    render();
  };
  document.querySelectorAll('[data-workflow]').forEach(button => {
    button.onclick = () => {
      save('sp.workflowMode',button.dataset.workflow);
      document.querySelectorAll('[data-workflow]').forEach(choice => choice.setAttribute('aria-pressed',String(choice === button)));
      toast((workflowMode() === 'simple' ? 'Simple' : 'Detailed') + ' workflow selected for your next job');
    };
  });
  $('#platform-form').onsubmit = (e) => {
    e.preventDefault();
    const name = e.currentTarget.elements.platformName.value.trim();
    const error = $('#platform-error');
    if (!name || name.toLowerCase() === 'all' || store.platforms.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      error.textContent = 'Enter a new platform name. All, Just Eat and Deliveroo are already available.';
      error.hidden = false;
      return;
    }
    store.platforms = [...store.platforms, { id: 'p-' + newId(), name }];
    toast('Platform added');
    render();
  };

  const f = $('#sf');
  // A box left empty keeps its previous value rather than becoming 0.
  const read = () => {
    const saved = store.settings;
    return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => {
      const v = parseFloat(f[k].value);
      return [k, isNaN(v) ? saved[k] : Math.max(0, v)];
    }));
  };
  const updateDerived = () => {
    const d = read();
    $('#derived').innerHTML = `
      <div class="line"><span>Fuel cost per mile</span><b>${money(fuelCostPerMile(d))}</b></div>`;
  };
  // Saved automatically when a box is changed, so nothing is lost by switching tabs.
  const persist = (announce) => {
    const d = read();
    if (d.mpg <= 0) return toast('MPG must be more than 0');
    store.settings = d;
    if (announce) toast('Settings saved');
  };
  f.addEventListener('input', updateDerived);
  f.addEventListener('change', (e) => {
    if (e.target.value.trim() === '') e.target.value = store.settings[e.target.name];
    persist(false);
  });
  updateDerived();

  f.onsubmit = (e) => {
    e.preventDefault();
    persist(true);
  };

  const area = $('#area');
  area.addEventListener('change', async () => {
    const q = area.value.trim();
    if (!q) { area.value = store.area.name; return; }
    $('#area-status').textContent = 'Looking up…';
    try {
      const found = await findArea(q);
      if (!found) { $('#area-status').textContent = `Couldn't find "${q}". Try a town or postcode area.`; return; }
      store.area = found;
      area.value = found.name;
      $('#area-status').textContent = `Searches show restaurants within about 12 miles of ${found.name}.`;
      toast('Work area saved');
    } catch {
      $('#area-status').textContent = "Couldn't look that up. Check your signal and try again.";
    }
  });

  $('#csv').onclick = exportCsv;
  $('#backup').onclick = exportBackup;
  $('#restore').onclick = () => $('#file').click();
  $('#file').onchange = (e) => { importBackup(e.target.files[0]); e.target.value = ''; };
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const today = () => new Date().toISOString().slice(0, 10);

function exportCsv() {
  const shifts = store.shifts;
  if (!shifts.length) return toast('No shifts to export yet');
  const cols = ['date', 'start', 'end', 'hours', 'start_odometer', 'end_odometer', 'miles', 'earnings',
    'fuel_litres', 'fuel_cost', 'maintenance', 'insurance', 'total_costs', 'profit', 'profit_per_hour',
    'petrol_price', 'mpg', 'note'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const f2 = (n) => n.toFixed(2);
  const rows = [...shifts].reverse().map((s) => {
    const r = calcShift(s);
    return [toLocalInput(s.start).slice(0, 10), timeLabel(s.start), timeLabel(s.end), f2(r.hours), s.startOdo, s.endOdo,
      r.miles, f2(r.earnings), f2(r.litres), f2(r.fuel), f2(r.maintenance), f2(r.insurance), f2(r.costs), f2(r.profit),
      f2(r.profitPerHour), s.settings.fuelPrice, s.settings.mpg, s.note].map(q).join(',');
  });
  download(`shifts-${today()}.csv`, [cols.join(','), ...rows].join('\n'), 'text/csv');
}

function exportBackup() {
  const data = { app: 'shift-profit', version: 3, exportedAt: new Date().toISOString(), settings: store.settings, shifts: store.shifts, deliveries: store.deliveries, order: store.order, active: store.active, places: store.places, area: store.area, platforms: store.platforms, selectedPlatform: store.platform, captureDeliveryLocation:captureEnabled(), workflowMode:workflowMode() };
  download(`shift-profit-backup-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
  store.lastBackup = new Date().toISOString();
  toast('Backup saved to your Downloads folder');
}

async function importBackup(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'shift-profit' || !Array.isArray(data.shifts)) throw new Error('bad file');
    const shifts = data.shifts
      .filter((s) => s && s.id && !isNaN(new Date(s.start)) && !isNaN(new Date(s.end)))
      .map((s) => ({ ...s, settings: { ...DEFAULT_SETTINGS, ...s.settings } }));
    const places = (Array.isArray(data.places) ? data.places : [])
      .filter((p) => p && p.id && p.name)
      .map((p) => ({ area: '', note: '', parkType: '', parkLimit: '', ease: '', spot: null, ...p, waits: Array.isArray(p.waits) ? p.waits : [] }));
    const deliveries = (Array.isArray(data.deliveries) ? data.deliveries : [])
      .filter((d) => d && d.id && (d.workflowMode === 'simple' || (d.collectedAt && !isNaN(new Date(d.collectedAt)))) && d.completedAt && !isNaN(new Date(d.completedAt)));
    const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    if (!confirm(`Restore ${count(shifts.length, 'shift')} and ${count(places.length, 'place')} from this backup? It also contains ${count(deliveries.length, 'completed delivery')}. This replaces all records and the current order on the phone.`)) return;
    stopDeliveryCapture(); deliveryCapture = null; showDeliveryCapture();
    save('sp.captureDeliveryLocation', data.captureDeliveryLocation !== false);
    if (['simple','detailed'].includes(data.workflowMode)) save('sp.workflowMode',data.workflowMode);
    store.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    store.shifts = shifts;
    store.places = places;
    store.deliveries = deliveries;
    store.platforms = data.platforms;
    store.platform = data.selectedPlatform === 'all' || store.platforms.some((p) => p.id === data.selectedPlatform) ? data.selectedPlatform : 'just-eat';
    const order = data.order;
    store.order = order && ['offer', 'pickup', 'waiting', 'deliver'].includes(order.step) &&
      (order.step !== 'deliver' || (order.workflowMode === 'simple' ? order.acceptedAt && !isNaN(new Date(order.acceptedAt)) : order.collectedAt && !isNaN(new Date(order.collectedAt)))) &&
      (order.step !== 'waiting' || (order.arrivedAt && !isNaN(new Date(order.arrivedAt))))
      ? { ...EMPTY_ORDER, ...order } : { ...EMPTY_ORDER };
    if (data.area && isFinite(data.area.lat) && isFinite(data.area.lon)) store.area = data.area;
    store.active = data.active || null;
    toast('Backup restored');
    render();
  } catch {
    toast("That doesn't look like a Shift Profit backup file");
  }
}

// ---------- Start up ----------

render();

if ('serviceWorker' in navigator) {
  // When an update takes over, reload to show it, but only on screens where
  // nothing can be half typed. Elsewhere it shows next time the app opens.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && /^(#home|#history|#places)?$/.test(location.hash)) location.reload();
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// Ask Chrome not to clear our data when the phone is low on space.
navigator.storage?.persist?.().catch(() => {});
