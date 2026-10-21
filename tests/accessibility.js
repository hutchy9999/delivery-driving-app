// Visits every screen in light and dark mode; runs axe + a 48px tap-target check.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const MIN = 48;
(async () => {
  const b = await chromium.launch();
  const out = {};
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ ...devices['Pixel 7'], colorScheme: scheme });
    const p = await ctx.newPage();
    p.on('dialog', d => d.accept());
    await p.goto('http://localhost:8765/');
    const shift = { id: 'abc', start: '2026-10-20T10:00:00Z', end: '2026-10-20T15:00:00Z', startOdo: '100', endOdo: '130', miles: 30, earnings: 75, note: 'rainy', settings: { fuelPrice: 1.7, mpg: 32, maintPence: 5, insurancePerHour: 1.16 } };
    const screens = [
      ['home-empty', async () => { await p.evaluate(() => localStorage.clear()); await p.goto('http://localhost:8765/#home'); }],
      ['settings', async () => p.goto('http://localhost:8765/#settings')],
      ['history-empty', async () => p.goto('http://localhost:8765/#history')],
      ['add', async () => p.goto('http://localhost:8765/#add')],
      ['home-data', async () => { await p.evaluate(s => { localStorage['sp.shifts'] = JSON.stringify([s]); localStorage['sp.settings'] = JSON.stringify(s.settings); }, shift); await p.goto('http://localhost:8765/#history'); await p.goto('http://localhost:8765/#home'); }],
      ['history', async () => p.goto('http://localhost:8765/#history')],
      ['order-empty', async () => p.goto('http://localhost:8765/#order')],
      ['order-good', async () => { await p.fill('[name=fee]', '4'); await p.fill('[name=miles]', '1.5'); }],
      ['order-ok', async () => { await p.fill('[name=fee]', '5'); await p.fill('[name=miles]', '3'); }],
      ['order-poor', async () => { await p.fill('[name=fee]', '5'); await p.fill('[name=miles]', '7'); }],
      ['shift', async () => p.goto('http://localhost:8765/#shift/abc')],
      ['edit', async () => p.goto('http://localhost:8765/#edit/abc')],
      ['active', async () => { await p.goto('http://localhost:8765/#home'); await p.click('#start'); }],
      ['end', async () => p.goto('http://localhost:8765/#end')],
    ];
    for (const [name, go] of screens) {
      await go(); await p.waitForTimeout(150);
      await p.addScriptTag({ content: AXE });
      const axe = await p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag22aa', 'best-practice'] })).violations
        .map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 4).join(' | ')}`));
      const small = await p.evaluate((MIN) => [...document.querySelectorAll('a,button,input,select,[onclick]')]
        .filter(e => e.offsetParent !== null && e.type !== 'file')
        .map(e => { const r = e.getBoundingClientRect(); return [e.id || e.name || e.textContent.trim().slice(0, 30) || e.tagName, Math.round(r.width), Math.round(r.height)]; })
        .filter(([, w, h]) => w < MIN || h < MIN), MIN);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      const key = name;
      out[key] = out[key] || {};
      out[key][scheme] = { axe, small, overflow };
    }
    await ctx.close();
  }
  for (const [k, v] of Object.entries(out)) {
    console.log('==', k);
    for (const [s, r] of Object.entries(v)) {
      if (r.axe.length) console.log(' ', s, 'axe:', r.axe.join('\n      '));
      if (r.small.length) console.log(' ', s, 'small:', JSON.stringify(r.small));
      if (r.overflow) console.log(' ', s, 'HORIZONTAL OVERFLOW');
    }
  }
  await b.close();
})();
