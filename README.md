# Shift Profit

A personal web app for delivery driving. It shows your **real profit per hour** after fuel, insurance and maintenance, not just what Deliveroo pays out.

- Works offline. You can add it to your Android home screen.
- No account, no server. Everything is stored only on your phone.

## Using it

1. **Settings (⚙️ top right):** enter your petrol price (£/L), UK MPG, and insurance (£ per hour on shift, e.g. Zego pay-as-you-go).
2. **Shift tab:** daily profit graph for the last 14 days, with average profit, fuel and hours per day worked. Tap **Start shift** (optionally with your odometer reading), and **End shift** to enter your earnings.
3. **Order tab**, in four steps:
   - **Offer:** type the fee and miles (and minutes if the offer shows them), and optionally the restaurant. As you type its name, the dropdown shows your saved places first, then matching restaurants near your work area from OpenStreetMap, each with its street, area and postcode, so you can pick the right branch. It shows the order's profit per hour and a verdict: worth taking, borderline or not worth it. If you've timed that restaurant before, it uses its own average wait.
   - **Pickup:** shows your saved parking for the restaurant, with directions to it. On a first visit, tap **Save parking spot here** once you've parked. Tap **I've arrived** to start the wait timer.
    - **Waiting:** tap **Got the food** to save the wait time and start the delivery timer. While waiting, you can note where you parked, the time limit, how easy it was, and a note for next time.
    - **Deliver:** once the handover is finished and you're back in your car, safely parked, tap **Delivered**. This saves the fee, restaurant, offer mileage and timestamps, then opens the next offer. The timer survives switching apps or reopening the app. It includes driving, parking, walking and handover, without automatic location tracking.
4. **Places tab:** your restaurants, with average wait, parking and notes. Sort by most visited or slowest wait. Tap one to edit it.
5. **History tab:** completed deliveries with expandable timings, followed by shifts grouped by week. Deliveries recorded during a shift also appear in its breakdown. Offer fees don't add to shift earnings automatically: enter the final total from your platforms, including tips, when ending your shift.
6. **Work area (⚙️ → Restaurant search):** the town or city your search results come from. Starts as Manchester. Searching sends only what you type and this area to Photon (OpenStreetMap search), never your location.
7. **Backups:** in Settings, use **Download backup file** now and then. Backups include completed deliveries and the current order as well as shifts, places and settings. Older backups can still be restored. Clearing Chrome's data deletes your records.

## How it calculates

- Fuel = miles ÷ MPG × 4.546 litres per UK gallon × price per litre
- Maintenance = miles × pence per mile
- Insurance = hours on shift × £ per hour
- Profit = earnings − fuel − maintenance − insurance
- Order £/hr = (fee − miles × running cost per mile − minutes × insurance) ÷ minutes × 60. Without minutes, minutes = miles ÷ town speed × 60 + stop time, where stop time is the restaurant's average wait (last 10 visits) + parking & handover time, or the general stop time if the restaurant hasn't been timed.

Each shift keeps a copy of the settings it was recorded with, so changing petrol price later doesn't rewrite old shifts.

## Files

For project goals, the reasoning behind the delivery workflow, implementation details, validation and deferred improvements, read [Development notes and decisions](docs/DEVELOPMENT_NOTES.md).

Plain HTML, CSS and JavaScript, with no build step. `calc.js` holds the maths, `app.js` the screens, and `sw.js` provides offline support. Hosted with GitHub Pages.

## Tests

`tests/` has four browser checks. `delivery.js` covers completion, offline/reload recovery, backup round-trips, old records and shift reconciliation. All checks return a non-zero exit code on failure. `functional.js` taps every button and fills every input, including mistakes on purpose. `accessibility.js` checks every screen in light and dark mode for contrast and labels. `mobile.js` sweeps every screen and state in light and dark at three widths (Pixel 7, a small 320px phone, and large text): tap targets of at least 48px that don't touch, inputs with 16px text, no text under 13px, nothing clipped, nothing scrolling sideways, nothing stuck behind the tab bar, plus a full accessibility scan.

```
cd tests && npm install
npm run serve &   # serves the app on localhost:8765
npm test
```
