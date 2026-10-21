'use strict';

// ---------- Storage ----------

const KEYS = { settings: 'sp.settings', shifts: 'sp.shifts', active: 'sp.active' };

const DEFAULT_SETTINGS = {
  fuelPrice: 1.40,      // £ per litre
  mpg: 45,              // UK MPG
  maintPence: 5,        // pence per mile (tyres, servicing, wear)
  insurancePerHour: 1.16, // £ per hour on shift (pay-as-you-go, e.g. Zego)
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
  const tab = { history: 'history', shift: 'history', edit: 'history', add: 'history', settings: 'settings' }[route] || 'home';
  document.querySelectorAll('.tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });

  switch (route) {
    case 'end': return renderShiftForm(view, 'end');
    case 'add': return renderShiftForm(view, 'add');
    case 'edit': return renderShiftForm(view, 'edit', id);
    case 'shift': return renderShift(view, id);
    case 'history': return renderHistory(view);
    case 'settings': return renderSettings(view);
    default: return renderHome(view);
  }
}

window.addEventListener('hashchange', render);
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => go('#' + b.dataset.tab)));

// ---------- Daily profit chart (last 14 days) ----------

const CHART_DAYS = 14;
// SVG size and margins (left margin fits the £ labels).
const CW = 340, CH = 180, CL = 44, CR = 20, CT = 10, CB = 26;
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
  // Label every other day, always including today on the right.
  const xLabels = days.map((d, i) => ((CHART_DAYS - 1 - i) % 2 === 0
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
    <a class="btn link" href="#add">Forgot to start? Add a past shift</a>`;

  bindChart(shifts);
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
    shift = { start: active.start, end: new Date().toISOString(), startOdo: active.startOdo, endOdo: '', miles: '', earnings: '', note: '', settings: store.settings };
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
        <span>Total earnings from Deliveroo, including tips (£)</span>
        <input name="earnings" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(shift.earnings)}" placeholder="e.g. 75.40" required>
      </label>
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
      <p class="muted center">Deliveroo showed ${money(r.grossPerHour)}/hr before costs</p>
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
      <div id="derived" class="preview"></div>
      <button class="btn primary huge" type="submit">Save settings</button>
      <p class="muted small">Changes save automatically. They only affect new shifts. Saved shifts keep the figures they were recorded with.</p>
    </form>

    <div class="card">
      <h2>Your data</h2>
      <p class="muted small">Everything is stored only on this phone. Download a backup now and then. If you clear Chrome's data or uninstall, unbacked-up shifts are lost.</p>
      <button class="btn" id="csv">Export shifts as spreadsheet (CSV)</button>
      <button class="btn" id="backup">Download backup file</button>
      <button class="btn" id="restore">Restore from backup file</button>
      <input type="file" id="file" accept=".json,application/json" hidden>
    </div>`;

  const f = $('#sf');
  const read = () => Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, Math.max(0, parseFloat(f[k].value) || 0)]));
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
  f.addEventListener('change', () => persist(false));
  updateDerived();

  f.onsubmit = (e) => {
    e.preventDefault();
    persist(true);
  };

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
  const data = { app: 'shift-profit', version: 1, exportedAt: new Date().toISOString(), settings: store.settings, shifts: store.shifts, active: store.active };
  download(`shift-profit-backup-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
}

async function importBackup(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'shift-profit' || !Array.isArray(data.shifts)) throw new Error('bad file');
    const shifts = data.shifts
      .filter((s) => s && s.id && !isNaN(new Date(s.start)) && !isNaN(new Date(s.end)))
      .map((s) => ({ ...s, settings: { ...DEFAULT_SETTINGS, ...s.settings } }));
    if (!confirm(`Restore ${shifts.length} shifts from this backup? This replaces what's on the phone now.`)) return;
    store.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    store.shifts = shifts;
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
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// Ask Chrome not to clear our data when the phone is low on space.
navigator.storage?.persist?.().catch(() => {});
