// Every screen/state × light/dark × 3 widths. Measures targets, spacing, font sizes, clipping, overflow + axe.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const { mockPhoton } = require('./photon-mock');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const U = 'http://localhost:8765/';
const S = { fuelPrice: 1.7, mpg: 32, maintPence: 5, insurancePerHour: 1.16, goodPerHour: 12, okPerHour: 10, townMph: 15, stopMins: 8, handoverMins: 3 };
const w = (n, m) => Array.from({ length: n }, (_, i) => ({ at: new Date(Date.now() - i * 864e5).toISOString(), mins: m, platformId: 'just-eat' }));
const PLACES = [
  { id: 'n', name: "Nando's", area: 'High Street', note: "Bays on Mill St, 1 min walk. Don't stop out front.", parkType: 'street', parkLimit: '60', ease: 'easy', spot: { lat: 51.5, lng: -0.12, accuracy: 8, savedAt: new Date().toISOString() }, waits: w(6, 7) },
  { id: 'x', name: 'Wok Express With A Really Long Restaurant Name', area: 'Station Road Industrial Estate', note: '', parkType: '', parkLimit: '', ease: 'avoid', spot: null, waits: [] }];
const SHIFTS = [0, 1, 3, 9].map((d, i) => { const s = new Date(); s.setDate(s.getDate() - d); s.setHours(11, 0, 0, 0);
  return { id: 's' + i, start: s.toISOString(), end: new Date(+s + 5 * 3600e3).toISOString(), startOdo: '100', endOdo: '130', miles: 30, earnings: 70 + i * 5, note: i ? '' : 'rainy Friday with a long note here', settings: S }; });
const seed = (extra = {}) => ({ 'sp.settings': JSON.stringify(S), 'sp.platform': JSON.stringify('just-eat'), 'sp.shifts': JSON.stringify(SHIFTS), 'sp.places': JSON.stringify(PLACES), ...extra });
const SCREENS = [
  ['chart: live deliveries', seed({ 'sp.active': JSON.stringify({id:'live',start:new Date(Date.now()-7200000).toISOString()}), 'sp.deliveries': JSON.stringify([{id:'job',shiftId:'live',fee:12,miles:4,completedAt:new Date(Date.now()-3600000).toISOString(),restaurantName:'A restaurant with a very long name for a narrow phone',platformId:'just-eat'}]) }), '#home', async p=>{await p.click('#chart-previous');}],
  ['chart: fortnight', seed({'sp.chartRange':JSON.stringify('fortnight')}), '#home'],
  ['chart: explanation', seed({'sp.chartRange':JSON.stringify('fortnight')}), '#home', async p=>{await p.click('.chart-method summary');}],
  ['shift: unfinished order guard', seed({'sp.active':JSON.stringify({id:'pending-shift',start:new Date(Date.now()-3600000).toISOString()}),'sp.order':JSON.stringify({step:'deliver',platformId:'just-eat',acceptedAt:new Date().toISOString(),collectedAt:new Date().toISOString()})}), '#end'],
  ['shift: cancel options', seed({'sp.active':JSON.stringify({id:'running',start:new Date(Date.now()-3600000).toISOString()})}), '#home', async p=>{await p.click('.shift-options summary');}],
  ['offer: extra detail', seed({'sp.order':JSON.stringify({step:'offer',fee:'7',miles:'3'})}), '#order', async p=>{await p.click('.offer-extra summary');}],
  ['first run (empty)', null, '#home'],
  ['shift: idle + graph', seed(), '#home', async (p) => { const b = await p.locator('#chart svg').boundingBox(); await p.mouse.click(b.x + b.width - 5, b.y + 50); }],
  ['shift: active', seed({ 'sp.active': JSON.stringify({ start: new Date(Date.now() - 3600e3).toISOString(), startOdo: '100' }) }), '#home'],
  ['shift: 13h running', seed({ 'sp.active': JSON.stringify({ start: new Date(Date.now() - 13 * 3600e3).toISOString(), startOdo: '' }) }), '#home'],
  ['shift: backup reminder', seed(), '#home'],
  ['end shift form', seed({ 'sp.active': JSON.stringify({ start: new Date(Date.now() - 3600e3).toISOString(), startOdo: '100' }) }), '#end', async (p) => { await p.click('#f button[type=submit]'); }],
  ['add past shift', seed(), '#add'],
  ['shift detail', seed(), '#shift/s0'],
  ['history', seed(), '#history'],
  ['history (empty)', { 'sp.settings': JSON.stringify(S) }, '#history'],
  ['order: offer empty', seed(), '#order'],
  ['order: all overview', seed({ 'sp.platform': JSON.stringify('all') }), '#order'],
  ['platform: long custom name', seed({ 'sp.platforms': JSON.stringify([{ id: 'p-long', name: 'An exceptionally long delivery platform name' }]), 'sp.platform': JSON.stringify('p-long') }), '#order'],
  ['settings: duplicate platform', seed(), '#settings', async (p) => { await p.fill('[name=platformName]', 'All'); await p.click('#platform-form button'); }],
  ['order: offer + picker open', seed(), '#order', async (p) => { await p.fill('[name=fee]', '5'); await p.fill('[name=miles]', '2'); await p.fill('.picker-input', 'n'); }],
  ['order: search results', seed(), '#order', async (p) => { await p.fill('.picker-input', 'nand'); await p.waitForTimeout(600); }],
  ['order: offer + place picked', seed({ 'sp.order': JSON.stringify({ step: 'offer', fee: '5', miles: '2', placeId: 'n' }) }), '#order'],
  ['order: pickup known', seed({ 'sp.order': JSON.stringify({ step: 'pickup', placeId: 'n' }) }), '#order'],
  ['order: pickup first visit', seed({ 'sp.order': JSON.stringify({ step: 'pickup', placeId: 'x' }) }), '#order'],
  ['order: pickup no place', seed({ 'sp.order': JSON.stringify({ step: 'pickup' }) }), '#order'],
  ['order: waiting + parking editor', seed({ 'sp.order': JSON.stringify({ step: 'waiting', placeId: 'n', arrivedAt: new Date().toISOString() }) }), '#order'],
  ['order: waiting no place', seed({ 'sp.order': JSON.stringify({ step: 'waiting', arrivedAt: new Date().toISOString() }) }), '#order'],
  ['order: delivering', seed({ 'sp.order': JSON.stringify({ step: 'deliver', fee: '7', placeId: 'x', collectedAt: new Date().toISOString() }) }), '#order'],
  ['history: completed delivery', seed({ 'sp.deliveries': JSON.stringify([{ id: 'd', platformId: 'just-eat', platformName: 'Just Eat', restaurantName: 'Wok Express With A Really Long Restaurant Name', fee: '7', miles: '3', acceptedAt: new Date().toISOString(), arrivedAt: new Date().toISOString(), collectedAt: new Date().toISOString(), completedAt: new Date().toISOString() }]) }), '#history', async (p) => { await p.click('.delivery-record summary'); }],
  ['places', seed(), '#places'],
  ['places: search add', seed(), '#places', async (p) => { await p.fill('#place-search', 'Zzz'); }],
  ['places (empty)', { 'sp.settings': JSON.stringify(S) }, '#places'],
  ['place detail (spot)', seed(), '#place/n'],
  ['place detail (no spot)', seed(), '#place/x'],
  ['settings', seed(), '#settings'],
];
const SIZES = [['Pixel 7 (412px)', 412], ['small phone (320px)', 320], ['large text (≈150%)', 275]];
(async () => {
  const b = await chromium.launch();
  const issues = new Map(); let checks = 0, targets = 0;
  const add = (k, where) => { if (!issues.has(k)) issues.set(k, new Set()); issues.get(k).add(where); };
  for (const scheme of ['light', 'dark']) for (const [sizeName, width] of SIZES) {
    const ctx = await b.newContext({ ...devices['Pixel 7'], viewport: { width, height: 800 }, colorScheme: scheme, permissions: ['geolocation'], geolocation: { latitude: 51.5, longitude: -0.12 } });
    await mockPhoton(ctx);
    const p = await ctx.newPage(); p.on('dialog', (d) => d.dismiss());
    await p.goto(U);
    for (const [name, data, hash, act] of SCREENS) {
      await p.evaluate((d) => { localStorage.clear(); if (d) for (const k in d) localStorage[k] = d[k]; }, data);
      await p.goto(U + '#history'); await p.goto(U + hash); await p.waitForTimeout(120);
      if (act) { await act(p); await p.waitForTimeout(120); }
      const where = `${name} [${scheme}, ${sizeName}]`;
      const r = await p.evaluate(() => {
        const vis = (e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 && e.type !== 'file'; };
        const sel = 'a[href], button, input, textarea, select, summary, [tabindex]:not([tabindex="-1"])';
        const els = [...document.querySelectorAll(sel)].filter(vis);
        const name = (e) => (e.id ? '#' + e.id : '') || e.getAttribute('name') || e.getAttribute('aria-label') || e.textContent.trim().replace(/\s+/g, ' ').slice(0, 28) || e.tagName;
        const out = { count: els.length, small: [], close: [], inputFont: [], tinyText: [], clipped: [], overflow: document.documentElement.scrollWidth > innerWidth + 1 };
        const rects = els.map((e) => [e, e.getBoundingClientRect()]);
        for (const [e, r] of rects) {
          if (r.width < 48 || r.height < 48) out.small.push(`${name(e)} ${Math.round(r.width)}×${Math.round(r.height)}`);
          if (/INPUT|TEXTAREA|SELECT/.test(e.tagName) && parseFloat(getComputedStyle(e).fontSize) < 16) out.inputFont.push(name(e));
          if ((e.scrollWidth > e.clientWidth + 1) && e.tagName !== 'INPUT' && e.tagName !== 'TEXTAREA') out.clipped.push(name(e));
        }
        // targets overlapping or nearer than 2px to each other (excluding nested elements)
        for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
          const [a, ra] = rects[i], [c, rc] = rects[j];
          if (a.contains(c) || c.contains(a) || a.closest('label') === c || c.closest('label') === a) continue;
          if (!!a.closest('.tabs') !== !!c.closest('.tabs')) continue; // fixed bar vs content scrolled behind it
          const gapX = Math.max(rc.left - ra.right, ra.left - rc.right), gapY = Math.max(rc.top - ra.bottom, ra.top - rc.bottom);
          if (Math.max(gapX, gapY) < 2) out.close.push(`${name(a)} ↔ ${name(c)}`);
        }
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) { const t = walker.currentNode; if (!t.textContent.trim()) continue; const el = t.parentElement; if (!vis(el) || el.closest('svg')) continue;
          const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 13) out.tinyText.push(`"${t.textContent.trim().slice(0, 20)}" ${fs}px`); }
        // svg chart text measured separately (scales with width)
        for (const t of document.querySelectorAll('svg text')) { const h = t.getBoundingClientRect().height; if (h && h < 11) out.tinyText.push(`chart "${t.textContent.slice(0, 12)}" ~${h.toFixed(1)}px tall`); }
        // Can the last control on the page be scrolled fully clear of the fixed tab bar?
        scrollTo(0, document.documentElement.scrollHeight);
        const inMain = [...document.querySelectorAll(sel.split(', ').map((x) => 'main ' + x).join(', '))].filter(vis);
        const last = inMain[inMain.length - 1];
        const barTop = document.querySelector('.tabs').getBoundingClientRect().top;
        if (last && last.getBoundingClientRect().bottom > barTop) out.hidden = name(last);
        scrollTo(0, 0);
        return out;
      });
      await p.addScriptTag({ content: AXE });
      const axe = await p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`));
      checks++; targets += r.count;
      r.small.forEach((x) => add('Tap target under 48px: ' + x, where));
      r.close.forEach((x) => add('Targets touching/overlapping: ' + x, where));
      r.inputFont.forEach((x) => add('Input text under 16px: ' + x, where));
      [...new Set(r.tinyText)].forEach((x) => add('Text under 13px: ' + x, where));
      r.clipped.forEach((x) => add('Text clipped inside: ' + x, where));
      if (r.overflow) add('Page scrolls sideways', where);
      if (r.hidden) add('Last control stuck behind tab bar: ' + r.hidden, where);
      axe.forEach((x) => add('axe ' + x, where));
    }
    await ctx.close();
  }
  console.log(`${SCREENS.length} screens × 2 themes × 3 sizes = ${checks} checks, ${targets} interactive elements measured\n`);
  for (const [k, v] of issues) console.log(`• ${k}\n    on ${v.size}: ${[...v].slice(0, 3).join('; ')}${v.size > 3 ? ' …' : ''}`);
  if (!issues.size) console.log('No issues found');
  if (issues.size) process.exitCode = 1;
  await b.close();
})();
