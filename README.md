# Shift Profit

A personal web app for delivery driving. It shows your **real profit per hour** after fuel, insurance and maintenance, not just what Deliveroo pays out.

- Works offline. You can add it to your Android home screen.
- No account, no server. Everything is stored only on your phone.

## Using it

1. **Settings:** enter your petrol price (£/L), UK MPG, insurance (£ per hour on shift, e.g. Zego pay-as-you-go), and your tax reserve %.
2. **Start shift:** optionally type in your odometer reading, then tap **Start shift**.
3. **End shift:** enter your total earnings from Deliveroo and your odometer reading. You get profit per hour, costs and take-home.
4. **History:** shifts are grouped by week. Tap a shift to see the full breakdown, or to edit or delete it.
5. **Backups:** in Settings, use **Download backup file** now and then. Clearing Chrome's data deletes your shifts.

## How it calculates

- Fuel = miles ÷ MPG × 4.546 litres per UK gallon × price per litre
- Maintenance = miles × pence per mile
- Insurance = hours on shift × £ per hour
- Profit = earnings − fuel − maintenance − insurance
- Take-home = profit − tax reserve %

Each shift keeps a copy of the settings it was recorded with, so changing petrol price later doesn't rewrite old shifts.

## Files

Plain HTML, CSS and JavaScript, with no build step. `calc.js` holds the maths, `app.js` the screens, and `sw.js` provides offline support. Hosted with GitHub Pages.

## Tests

`tests/` has two browser checks that run on a phone-sized screen. `functional.js` taps every button and fills every input, including mistakes on purpose. `accessibility.js` checks every screen in light and dark mode for contrast, labels and tap targets of at least 48px.

```
cd tests && npm install
npm run serve &   # serves the app on localhost:8765
npm test
```
