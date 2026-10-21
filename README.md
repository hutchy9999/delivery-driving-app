# Shift Profit

A personal web app for delivery driving. It shows your **real profit per hour** after fuel, insurance and maintenance, not just what Deliveroo pays out.

- Works offline. You can add it to your Android home screen.
- No account, no server. Everything is stored only on your phone.

## Using it

1. **Settings (⚙️ top right):** enter your petrol price (£/L), UK MPG, and insurance (£ per hour on shift, e.g. Zego pay-as-you-go).
2. **Shift tab:** daily profit graph for the last 14 days, with average profit, fuel and hours per day worked. Tap **Start shift** (optionally with your odometer reading), and **End shift** to enter your earnings.
3. **Order tab**, in three steps:
   - **Offer:** type the fee and miles (and minutes if the offer shows them), and optionally the restaurant. It shows the order's profit per hour and a verdict: worth taking, borderline or not worth it. If you've timed that restaurant before, it uses its own average wait.
   - **Pickup:** shows your saved parking for the restaurant, with directions to it. On a first visit, tap **Save parking spot here** once you've parked. Tap **I've arrived** to start the wait timer.
   - **Waiting:** tap **Got the food** to save the wait time. While waiting, you can note where you parked, the time limit, how easy it was, and a note for next time.
4. **Places tab:** your restaurants, with average wait, parking and notes. Sort by most visited or slowest wait. Tap one to edit it.
5. **History tab:** shifts grouped by week. Tap a shift to see the breakdown, or to edit or delete it.
6. **Backups:** in Settings, use **Download backup file** now and then. Clearing Chrome's data deletes your shifts and places.

## How it calculates

- Fuel = miles ÷ MPG × 4.546 litres per UK gallon × price per litre
- Maintenance = miles × pence per mile
- Insurance = hours on shift × £ per hour
- Profit = earnings − fuel − maintenance − insurance
- Order £/hr = (fee − miles × running cost per mile − minutes × insurance) ÷ minutes × 60. Without minutes, minutes = miles ÷ town speed × 60 + stop time, where stop time is the restaurant's average wait (last 10 visits) + parking & handover time, or the general stop time if the restaurant hasn't been timed.

Each shift keeps a copy of the settings it was recorded with, so changing petrol price later doesn't rewrite old shifts.

## Files

Plain HTML, CSS and JavaScript, with no build step. `calc.js` holds the maths, `app.js` the screens, and `sw.js` provides offline support. Hosted with GitHub Pages.

## Tests

`tests/` has three browser checks. `functional.js` taps every button and fills every input, including mistakes on purpose. `accessibility.js` checks every screen in light and dark mode for contrast and labels. `mobile.js` sweeps every screen and state in light and dark at three widths (Pixel 7, a small 320px phone, and large text): tap targets of at least 48px that don't touch, inputs with 16px text, no text under 13px, nothing clipped, nothing scrolling sideways, nothing stuck behind the tab bar, plus a full accessibility scan.

```
cd tests && npm install
npm run serve &   # serves the app on localhost:8765
npm test
```
