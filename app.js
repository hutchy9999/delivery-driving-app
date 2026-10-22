'use strict';

// ---------- Storage ----------

const KEYS = { settings: 'sp.settings', shifts: 'sp.shifts', active: 'sp.active', places: 'sp.places', order: 'sp.order', area: 'sp.area', lastBackup: 'sp.lastBackup' };

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

// ---------- Routing (hash based, so the Android back button works) ----------

let timer = null;

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function render() {
  clearInterval(timer);
  window.scrollTo(0, 0);
  const [route, id] = location.hash.slice(1).split('/');
  const view = $('#view');
  const tab = { order: 'order', places: 'places', place: 'places', history: 'history', shift: 'history', edit: 'history', add: 'history', settings: 'settings' }[route] || 'home';
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

// ---------- Daily profit chart (last 14 days) ----------

const CHART_DAYS = 14;
// SVG height and margins (left margin fits the £ labels, right fits half a date).
const CH = 190, CL = 48, CR = 22, CT = 10, CB = 28;
// The SVG is drawn at the card's real width, so its 12px labels stay 12px on any
// screen or text size. Card content = page width − page padding − card padding.
let CW = 340;
const chartWidth = () => Math.max(200, Math.round(Math.min(window.innerWidth, 560) - 66));
const chartX = (i) => CL + (i * (CW - CL - CR)) / (CHART_DAYS - 1);

// One entry per calendar day, oldest first, ending today.
function dailyTotals(shifts) {
  const days = [];
  const byKey = new Map();
  for (let i = CHART_DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const day = { date: d, key: toLocalInput(d).slice(0, 10), worked: false, profit: 0, fuel: 0, hours: 0 };
    days.push(day);
    byKey.set(day.key, day);
  }
  for (const s of shifts) {
    const day = byKey.get(toLocalInput(s.start).slice(0, 10));
    if (!day) continue;
    const r = calcShift(s);
    day.worked = true;
    day.profit += r.profit;
    day.fuel += r.fuel;
    day.hours += r.hours;
  }
  return days;
}

// A tick step giving at most 4 gridlines.
function niceStep(range) {
  for (const step of [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) if (range / step <= 4) return step;
  return 2500;
}

const shortDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function chartCard(shifts) {
  const days = dailyTotals(shifts);
  const worked = days.filter((d) => d.worked);
  CW = chartWidth();
  const W = CW, H = CH, L = CL, R = CR, T = CT, B = CB;
  const values = days.map((d) => d.profit);
  // An empty graph shows £0–£100 so it looks like a normal week.
  const step = worked.length ? niceStep(Math.max(...values, 0) - Math.min(...values, 0) || 1) : 25;
  const yMax = worked.length ? Math.max(step, Math.ceil(Math.max(...values, 0) / step) * step) : 100;
  const yMin = Math.floor(Math.min(...values, 0) / step) * step;
  const x = chartX;
  const y = (v) => T + ((yMax - v) * (H - T - B)) / (yMax - yMin);

  let grid = '';
  for (let v = yMin; v <= yMax; v += step) {
    grid += `<line class="${v === 0 ? 'zero' : 'grid'}" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">£${v}</text>`;
  }
  // Label every 2nd day where there's room (every 3rd/4th on narrow screens),
  // always including today on the right.
  const gap = (W - L - R) / (CHART_DAYS - 1);
  const every = [2, 3, 4, 7].find((n) => n * gap >= 46) || 7;
  const xLabels = days.map((d, i) => ((CHART_DAYS - 1 - i) % every === 0
    ? `<text class="axis" x="${x(i)}" y="${H - 8}" text-anchor="middle">${shortDate(d.date)}</text>` : '')).join('');
  const line = worked.length
    ? `<polyline class="line" points="${days.map((d, i) => `${x(i)},${y(d.profit)}`).join(' ')}"/>` +
      days.map((d, i) => (d.worked ? `<circle class="dot" cx="${x(i)}" cy="${y(d.profit)}" r="4"/>` : '')).join('')
    : `<text class="axis" x="${(L + W - R) / 2}" y="${T + (H - T - B) * 0.375 + 4}" text-anchor="middle">No shifts in the last 2 weeks</text>`;

  const avg = (k) => worked.reduce((a, d) => a + d[k], 0) / worked.length;
  const stat = (value, label) => `<div><b>${worked.length ? value : '–'}</b><small>${label}</small></div>`;
  const total = worked.reduce((a, d) => a + d.profit, 0);
  const summary = worked.length
    ? `Daily profit for the last 2 weeks. ${worked.length} days worked, ${money(total)} profit in total.`
    : 'Daily profit for the last 2 weeks. No shifts yet.';

  return `
    <div class="card chart" id="chart">
      <h2>Daily profit before tax · last 2 weeks</h2>
      <p class="muted small chart-info" id="chart-info" aria-live="polite">${worked.length ? 'Tap the graph to see a day' : '&nbsp;'}</p>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${summary}">
        ${grid}${xLabels}
        <line class="cross" id="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
        ${line}
      </svg>
      <div class="row3">
        ${stat(money(avg('profit')), 'avg profit / day')}
        ${stat(money(avg('fuel')), 'avg fuel / day')}
        ${stat(duration(avg('hours')), 'avg hours / day')}
      </div>
      <p class="muted small center">Averages are per day worked</p>
    </div>`;
}

// Tap or drag across the graph to read off a day.
function bindChart(shifts) {
  const svg = $('#chart svg');
  if (!svg || !shifts.length) return;
  const days = dailyTotals(shifts);
  if (!days.some((d) => d.worked)) return;
  const pick = (e) => {
    const box = svg.getBoundingClientRect();
    const sx = ((e.clientX - box.left) / box.width) * CW;
    const i = Math.max(0, Math.min(CHART_DAYS - 1, Math.round(((sx - CL) / (CW - CL - CR)) * (CHART_DAYS - 1))));
    const d = days[i];
    const cx = chartX(i);
    const cross = $('#cross');
    cross.setAttribute('x1', cx);
    cross.setAttribute('x2', cx);
    cross.setAttribute('visibility', 'visible');
    $('#chart-info').innerHTML = `<b>${dateLabel(d.date)}</b> · ` + (d.worked
      ? `${money(d.profit)} profit · ${money(d.fuel)} fuel · ${duration(d.hours)}`
      : 'no shift');
  };
  svg.addEventListener('pointerdown', pick);
  svg.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'mouse') pick(e); });
}

// ---------- Home ----------

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
      ${settingsNote}
      ${chartCard(shifts)}
      <div class="card active-shift">
        <p class="muted">On shift since ${timeLabel(active.start)}${active.startOdo ? ` · odometer ${esc(active.startOdo)}` : ''}</p>
        <div class="clock" id="clock">${duration((Date.now() - new Date(active.start)) / 3600000)}</div>
        ${longShiftNote(active)}
        <button class="btn primary huge danger" id="end">End shift</button>
        <button class="btn link" id="cancel">Cancel this shift</button>
      </div>`;
    timer = setInterval(() => {
      const c = $('#clock');
      if (c) c.textContent = duration((Date.now() - new Date(active.start)) / 3600000);
    }, 15000);
    bindChart(shifts);
    $('#end').onclick = () => go('#end');
    $('#cancel').onclick = () => {
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
    ${settingsNote}
    ${chartCard(shifts)}
    <div class="card">
      <label class="field">
        <span>Odometer now <small>(optional)</small></span>
        <input id="odo" type="number" inputmode="decimal" placeholder="${lastOdo ? 'Last: ' + esc(lastOdo) : 'e.g. 48210'}">
      </label>
      <button class="btn primary huge" id="start">Start shift</button>
    </div>
    ${summaryCard('Today', todays)}
    ${summaryCard('This week', weeks)}
    ${backupNote()}
    <a class="btn link" href="#add">Forgot to start? Add a past shift</a>`;

  bindChart(shifts);
  bindBackupNote();
  $('#start').onclick = () => {
    store.active = { start: new Date().toISOString(), startOdo: $('#odo').value.trim() };
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
    // A draft is kept while typing, so switching to Deliveroo to check a figure loses nothing.
    const { timesEdited, ...draft } = active.draft || {};
    shift = { start: active.start, end: new Date().toISOString(), startOdo: active.startOdo, endOdo: '', miles: '', earnings: '', note: '', ...draft, settings: store.settings };
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
      const draft = { earnings, startOdo, endOdo, miles, note, timesEdited, ...(timesEdited ? { start, end } : {}) };
      store.active = { ...store.active, draft };
    });
  }
  updatePreview();
  if (mode !== 'edit') f.earnings.focus();

  f.onsubmit = (e) => {
    e.preventDefault();
    const s = read();
    const fail = (msg) => { const el = $('#err'); el.textContent = msg; el.hidden = false; };
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
  const line = (label, value, cls = '') => `<div class="line ${cls}"><span>${label}</span><b>${value}</b></div>`;

  view.innerHTML = `
    <h2>${dateLabel(shift.start)} · ${timeLabel(shift.start)}–${timeLabel(shift.end)}</h2>
    ${shift.note ? `<p class="muted">${esc(shift.note)}</p>` : ''}
    <div class="card">
      <div class="big ${profitClass(r.profitPerHour)}">${money(r.profitPerHour)}<span>/hr profit</span></div>
      <p class="muted center">Your apps paid ${money(r.grossPerHour)}/hr before costs</p>
      <div class="row3">
        <div><b>${money(r.profit)}</b><small>profit</small></div>
        <div><b>${money(r.costs)}</b><small>costs</small></div>
        <div><b>${money(r.profitPerMile)}</b><small>profit/mile</small></div>
      </div>
    </div>
    <div class="card">
      ${line('Earnings', money(r.earnings))}
      ${line(`Fuel (${num(r.litres)} L)`, '−' + money(r.fuel))}
      ${line('Maintenance', '−' + money(r.maintenance))}
      ${line(`Insurance (${money(insurancePerHour(s))}/hr)`, '−' + money(r.insurance))}
      ${line('Profit', money(r.profit), 'total')}
    </div>
    <div class="card">
      ${line('Time worked', duration(r.hours))}
      ${line('Miles', num(r.miles))}
      <p class="muted small">Worked out with petrol at ${money(s.fuelPrice)}/L and ${num(s.mpg)} MPG.</p>
    </div>
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
  return visits ? `${visits} visit${visits > 1 ? 's' : ''} · avg wait ${Math.round(avg)} min` : 'No waits timed yet';
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

// Saves a search result as a place, or returns the place already saved for it.
function placeFromResult(r) {
  const existing = store.places.find((p) => p.osm === r.osm);
  if (existing) return existing;
  const place = {
    ...addPlace(r.name),
    osm: r.osm,
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
      <input type="text" class="picker-input" autocomplete="off" placeholder="Type the restaurant name"></label>
    <div class="sugg"></div>`;
  const input = $('.picker-input', container);
  const list = $('.sugg', container);
  let remote = [], status = '', ctrl = null, wait = null;

  const show = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { list.innerHTML = ''; return; }
    const saved = store.places
      .filter((p) => `${p.name} ${p.area} ${p.address || ''}`.toLowerCase().includes(q))
      .sort((a, b) => (b.waits || []).length - (a.waits || []).length)
      .slice(0, 4);
    const savedOsm = new Set(saved.map((p) => p.osm).filter(Boolean));
    const found = remote.filter((r) => !savedOsm.has(r.osm));
    list.innerHTML =
      (saved.length ? `<div class="sugg-head">Your places</div>` + saved.map((p) => `
        <button type="button" data-id="${esc(p.id)}">
          <span><b>${placeName(p)}</b>${p.address ? `<small>${esc(p.address)}</small>` : ''}<small>${placeMeta(p)}</small></span>${easeTag(p)}
        </button>`).join('') : '') +
      (found.length ? `<div class="sugg-head">Near ${esc(store.area.name.split(',')[0])}</div>` + found.map((r, i) => `
        <button type="button" data-remote="${remote.indexOf(r)}">
          <span><b>${esc(r.name)}</b><small>${esc(addressLine(r)) || 'No address listed'}</small>${r.kind ? `<small class="kind">${esc(r.kind)}</small>` : ''}</span>
        </button>`).join('') : '') +
      (status ? `<div class="sugg-status">${status}</div>` : '') +
      (q.length >= 2 ? `<button type="button" data-new="1"><span class="accent-text">+ Not listed? Add "${esc(input.value.trim())}"</span></button>` : '') +
      (found.length ? `<div class="sugg-status small">Search results © OpenStreetMap contributors</div>` : '');
  };

  input.addEventListener('input', () => {
    clearTimeout(wait);
    if (ctrl) ctrl.abort();
    remote = [];
    const q = input.value.trim();
    status = q.length >= 3 ? 'Searching…' : '';
    show();
    if (q.length < 3) return;
    wait = setTimeout(async () => {
      ctrl = new AbortController();
      try {
        remote = await searchVenues(q, ctrl.signal);
        status = remote.length ? '' : `No matches near ${esc(store.area.name.split(',')[0])}. Try fewer letters.`;
      } catch (e) {
        if (e.name === 'AbortError') return;
        status = navigator.onLine === false ? 'No signal: showing your saved places only' : "Search isn't working right now";
      }
      show();
    }, 350);
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.new) onPick(addPlace(input.value));
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

// ---------- Order: offer → pickup → waiting ----------

const EMPTY_ORDER = { step: 'offer', fee: '', miles: '', mins: '', placeId: null, arrivedAt: null };

function setOrder(changes) {
  store.order = { ...store.order, ...changes };
}

function stepPills(current) {
  const steps = ['offer', 'pickup', 'waiting'];
  const names = ['Offer', 'Pickup', 'Waiting'];
  const at = steps.indexOf(current);
  return `<ol class="steps" aria-label="Order steps">${names.map((n, i) => i < at
    ? `<li class="done">✓ ${n}</li>`
    : `<li class="${i === at ? 'on' : ''}"${i === at ? ' aria-current="step"' : ''}>${i + 1} ${n}</li>`).join('')}</ol>`;
}

function renderOrder(view) {
  const step = store.order.step;
  if (step === 'pickup') return renderPickup(view);
  if (step === 'waiting') return renderWaiting(view);
  return renderOffer(view);
}

function renderOffer(view) {
  const o = store.order;
  view.innerHTML = `
    ${store.active ? '' : `<div class="card notice">Not on shift, so your time and insurance aren't being counted. <button class="btn" id="start-from-order">Start shift now</button></div>`}
    ${stepPills('offer')}
    <div id="order-result" aria-live="polite"></div>
    <form id="of" class="card" novalidate>
      <div class="pair">
        <label class="field"><span>Fee (£)</span>
          <input name="fee" type="number" inputmode="decimal" step="0.01" min="0" placeholder="e.g. 4.50" value="${esc(o.fee)}"></label>
        <label class="field"><span>Miles</span>
          <input name="miles" type="number" inputmode="decimal" step="0.1" min="0" placeholder="e.g. 2.5" value="${esc(o.miles)}"></label>
      </div>
      <div id="offer-place"></div>
      <label class="field"><span>Minutes <small>(optional, if the offer shows a time)</small></span>
        <input name="mins" type="number" inputmode="numeric" min="0" placeholder="Leave blank to estimate" value="${esc(o.mins)}"></label>
      <button class="btn primary huge" type="button" id="take">Taking it → Pickup</button>
      <button class="btn link" type="button" id="clear">Clear for next order</button>
    </form>`;

  const f = $('#of');
  const update = () => {
    setOrder({ fee: f.fee.value.trim(), miles: f.miles.value.trim(), mins: f.mins.value.trim() });
    const { fee: feeText, miles: milesText, mins: minsText, placeId } = store.order;
    const s = store.settings;
    const place = getPlace(placeId);
    const wait = place ? avgWait(place) : null;
    const fee = parseFloat(feeText), miles = parseFloat(milesText), mins = parseFloat(minsText);
    const r = feeText !== '' && milesText !== '' && fee >= 0 && miles >= 0 ? calcOrder(s, fee, miles, mins, wait) : null;
    if (!r) {
      $('#order-result').innerHTML = `<div class="card center muted">Type the fee and miles from the offer.<br>Your £/hr appears here.</div>`;
      return;
    }
    const [icon, word] = { good: ['✓', 'Worth taking'], ok: ['!', 'Borderline'], poor: ['✕', 'Not worth it'] }[r.grade];
    const stops = wait !== null
      ? `${Math.round(wait)} min avg wait at ${esc(place.name)} + ${num(s.handoverMins)} min parking & handover`
      : `${num(s.stopMins)} min stops`;
    $('#order-result').innerHTML = `
      <div class="card order ${r.grade}">
        <div class="big">${money(r.hourly)}<span>/hr profit</span></div>
        <div class="verdict"><span class="verdict-icon" aria-hidden="true">${icon}</span>${word}</div>
        <div class="row3">
          <div><b>${money(r.profit)}</b><small>profit</small></div>
          <div><b>${money(r.costs)}</b><small>costs</small></div>
          <div><b>${Math.round(r.mins)} min</b><small>${r.estimated ? 'estimated' : 'from offer'}</small></div>
        </div>
        <p class="muted small center">${r.estimated ? `Time estimated: ${num(miles)} mi at ${num(s.townMph)} mph + ${stops}. ` : ''}Worth taking from ${money(s.goodPerHour)}/hr, borderline from ${money(s.okPerHour)}/hr</p>
      </div>`;
  };

  const showPlace = () => {
    const slot = $('#offer-place');
    const place = getPlace(store.order.placeId);
    if (!place) {
      placePicker(slot, 'Restaurant <small>(optional)</small>', (p) => { setOrder({ placeId: p.id }); showPlace(); update(); });
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
  $('#take').onclick = () => { setOrder({ step: 'pickup' }); render(); };
  const startHere = $('#start-from-order');
  if (startHere) startHere.onclick = () => { store.active = { start: new Date().toISOString(), startOdo: '' }; toast('Shift started. Drive safe!'); render(); };
  $('#clear').onclick = () => { store.order = { ...EMPTY_ORDER }; render(); };
  showPlace();
  update();
  if (store.order.fee === '') f.fee.focus();
}

function renderPickup(view) {
  const place = getPlace(store.order.placeId);
  view.innerHTML = `
    ${stepPills('pickup')}
    <div id="pickup-place"></div>
    <button class="btn huge${place ? '' : ' primary'}" id="arrived">I've arrived</button>
    <button class="btn link" id="back">Back to offer</button>`;

  const slot = $('#pickup-place');
  if (!place) {
    slot.className = 'card';
    placePicker(slot, 'Which restaurant?', (p) => { setOrder({ placeId: p.id }); render(); });
  } else {
    const wait = avgWait(place);
    slot.innerHTML = `
      <div class="card">
        <div class="place-head"><div><h2 class="place-title">${esc(place.name)}</h2><span class="muted">${esc(place.address || place.area) || (place.waits.length ? '' : 'First visit')}</span></div>${easeTag(place)}</div>
        ${parkingLine(place)}
        ${place.note ? `<div class="note">📝 ${esc(place.note)}</div>` : ''}
        ${wait !== null ? `<div class="facts"><div><b>${Math.round(wait)} min</b><small>avg wait</small></div><div><b>${place.waits.length}</b><small>visit${place.waits.length > 1 ? 's' : ''}</small></div></div>` : ''}
        ${place.spot
          ? `<a class="btn primary huge icon" id="directions" href="${directionsUrl(place.spot)}" target="_blank" rel="noopener">${PIN_ICON} Directions to parking</a>
             <button class="btn link" id="spot">Update parking spot to here</button>`
          : `<p class="muted">No parking saved yet. Once you've parked, save the spot so next time the app can take you straight there.</p>
             ${place.loc ? `<a class="btn icon" id="to-restaurant" href="${directionsUrl(place.loc)}" target="_blank" rel="noopener">${PIN_ICON} Directions to restaurant</a>` : ''}
             <button class="btn primary huge icon" id="spot">${PIN_ICON} Save parking spot here</button>`}
      </div>`;
    $('#spot').onclick = () => saveSpot(place.id, render);
  }
  $('#arrived').onclick = () => { setOrder({ step: 'waiting', arrivedAt: new Date().toISOString() }); render(); };
  $('#back').onclick = () => { setOrder({ step: 'offer' }); render(); };
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
    placePicker(slot, 'Which restaurant? <small>(to save this wait)</small>', (p) => { setOrder({ placeId: p.id }); render(); });
  }

  $('#got').onclick = () => {
    const current = getPlace(store.order.placeId);
    const mins = (Date.now() - new Date(o.arrivedAt)) / 60000;
    if (current && mins <= MAX_WAIT_MINS) {
      updatePlace(current.id, { waits: [...(current.waits || []), { at: new Date().toISOString(), mins: Math.round(mins * 10) / 10 }] });
      toast(`Saved: ${Math.max(1, Math.round(mins))} min wait at ${current.name}`);
    } else if (current) {
      toast(`Over ${MAX_WAIT_MINS} min, so the wait wasn't saved`);
    } else {
      toast('Done. Ready for the next order');
    }
    store.order = { ...EMPTY_ORDER };
    render();
  };
  $('#cancel-order').onclick = () => {
    if (!confirm('Cancel this order? The wait time won\'t be saved.')) return;
    store.order = { ...EMPTY_ORDER };
    render();
  };
}

// ---------- Places tab ----------

let placesSort = 'visits';

function renderPlaces(view) {
  view.innerHTML = `
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
    const places = store.places
      .filter((p) => `${p.name} ${p.area} ${p.address || ''}`.toLowerCase().includes(q))
      .sort(placesSort === 'slowest'
        ? (a, b) => (avgWait(b) ?? -1) - (avgWait(a) ?? -1)
        : (a, b) => (b.waits || []).length - (a.waits || []).length || a.name.localeCompare(b.name));
    const add = q && !store.places.some((p) => p.name.toLowerCase() === q)
      ? `<button class="btn" id="add-place">+ Add "${esc(search.value.trim())}"</button>` : '';
    $('#place-list').innerHTML = places.length
      ? places.map((p) => `
          <a class="place-row" href="#place/${esc(p.id)}">
            <span><b>${placeName(p)}</b><small>${placeMeta(p)}${p.spot ? ' · 🅿️ spot saved' : ''}</small></span>${easeTag(p)}
          </a>`).join('') + add
      : (q ? add : `<div class="card"><p class="muted">No places yet. They're added when you pick a restaurant on an order, or search above to add one.</p></div>`);
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
  view.innerHTML = `
    <div class="card">
      <label class="field"><span>Restaurant name</span><input name="name" type="text" value="${esc(p.name)}" maxlength="80"></label>
      <label class="field"><span>Area or street <small>(helps tell branches apart)</small></span><input name="area" type="text" value="${esc(p.area)}" maxlength="80" placeholder="e.g. High Street"></label>
      ${p.address ? `<p class="muted small">📍 ${esc(p.address)}</p>` : ''}
      ${p.loc ? `<a class="btn icon" href="${directionsUrl(p.loc)}" target="_blank" rel="noopener">${PIN_ICON} Directions to restaurant</a>` : ''}
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
    <div class="card">
      <h2>Wait times</h2>
      ${wait !== null
        ? `<div class="facts"><div><b>${Math.round(wait)} min</b><small>avg wait (last 10)</small></div><div><b>${p.waits.length}</b><small>visits</small></div></div>
           ${waits.map((w) => `<div class="line"><span>${dateLabel(w.at)} ${timeLabel(w.at)}</span><b>${Math.max(1, Math.round(w.mins))} min</b></div>`).join('')}`
        : '<p class="muted small">Timed automatically when you use "I\'ve arrived" and "Got the food" on an order.</p>'}
    </div>
    <button class="btn danger-outline" id="delete-place">Delete this place</button>`;

  ['name', 'area'].forEach((k) => {
    const input = $(`input[name=${k}]`);
    input.addEventListener('change', () => {
      const v = input.value.trim();
      if (k === 'name' && !v) { input.value = p.name; return toast('A place needs a name'); }
      updatePlace(id, { [k]: v });
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
  const shifts = store.shifts;
  if (!shifts.length) {
    view.innerHTML = `
      <div class="card"><p class="muted">No shifts yet. Start one from the Shift tab.</p></div>
      <button class="btn" onclick="location.hash='#add'">+ Add a past shift</button>`;
    return;
  }

  const groups = new Map();
  for (const s of shifts) {
    const key = startOfWeek(s.start).toISOString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  let html = `<button class="btn" onclick="location.hash='#add'">+ Add a past shift</button>`;
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
      <p class="muted small">Searching sends what you type and your work area to Photon (OpenStreetMap search). Your location, shifts and notes never leave this phone.</p>
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
  const data = { app: 'shift-profit', version: 1, exportedAt: new Date().toISOString(), settings: store.settings, shifts: store.shifts, active: store.active, places: store.places, area: store.area };
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
    const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    if (!confirm(`Restore ${count(shifts.length, 'shift')} and ${count(places.length, 'place')} from this backup? This replaces what's on the phone now.`)) return;
    store.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    store.shifts = shifts;
    store.places = places;
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
