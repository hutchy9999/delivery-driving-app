# Shift Profit

A personal web app for delivery driving. It shows your **real profit per hour** after fuel, insurance and maintenance, not just what Deliveroo pays out.

- Works offline. You can add it to your Android home screen.
- No account, no server. Everything is stored only on your phone.

## Using it

Below fee/mileage, **Offer screenshot** lets you select your latest PNG/JPG/WebP screenshot. Local OCR tries for up to **10 seconds**, autofills identifiable payment/mileage and shows editable pickup/drop-off text for review. Multiple labelled drop-offs are supported. Ambiguous numbers are left for manual entry; edits you make while reading are preserved. **Confirm** stays available, and **Use manual entry** stops reading. No screenshot or full OCR transcript is saved or uploaded by this app; selected location text and amounts are retained with the job and backup. The original Android screenshot remains in your gallery. OCR software/models download on first use from pinned jsDelivr packages; an initial connection is needed and OCR is not guaranteed to finish within ten seconds. Confirm uses only the reviewed values. Location text is not automatically verified or geocoded. Real offer layouts may need tuning; check every imported offer.

**Settings → Job workflow** switches between **Simple** (default) and **Detailed** for your next job. Simple asks only for fee and offer miles: **Confirm → Finish job**, then returns to the offer screen and runs the optional five-second location capture. No restaurant, arrival or collection entry is required. Shift start/end, actual odometer mileage, final earnings and profitability remain available. Detailed retains restaurant/postcode lookup and all timing stages. Accepted jobs keep their mode; existing in-progress jobs keep the Detailed flow. Simple jobs record acceptance/completion and leave restaurant stages unrecorded, rather than inventing timings. Backups preserve both types.

In **Places**, tap a restaurant to edit its name and area (saved automatically). Under **Wait times**, each completed delivery has **Edit wait**. Enter the actual **Restaurant wait (minutes)** and **Save corrections**; this updates the place average and shift review without inventing arrival/collection timestamps. Manual waits are labelled. Clear the minutes field to return to the recorded timestamp duration. History → Edit delivery offers the same input. Original values remain available.

Enter the **pickup postcode** from your delivery offer, with or without spaces. Saved places appear first; online lookup resolves the postcode through Postcodes.io and lists nearby OpenStreetMap restaurants through Overpass. Choose the correct branch: nearby results are not guaranteed to share the postcode. **Use postcode only** is available immediately, including offline or when lookup is busy. You can name that pickup later in Places; until then its wait history is postcode-level. Restaurant-name search remains available. Existing notes and parking information are preserved when choosing a saved branch.

After **Delivered**, completion saves immediately and a small card attempts a fresh location for up to **5 seconds**, stopping early at estimated accuracy of **30 m or better**. Keep this app visible; you can switch its tabs. **Skip** cancels without adding a location. At the deadline, a fresh fix within 100 m is saved as approximate; poorer/no fixes are not saved. Switching apps or locking the phone stops capture. Your browser requests location permission. Turn this off in **Settings → Delivery location**. Coordinates, accuracy and capture time stay local and are included in backups; no route or address lookup is performed. History shows saved locations and allows removal. Retry only while still at the drop-off; this records where you press Delivered, not the customer's address.

Expand a completed delivery in History or a shift review and choose **Edit delivery** to correct the offer fee, offer miles or timestamps. Save explicitly, or Cancel without changes. Corrected records are marked and retain **Original recorded values**. Restaurant wait averages update with corrected arrival/collection timings. Unknown acceptance/arrival times may stay blank; collection and completion are required. Saved shift earnings/mileage remain separate final totals.

After **End shift → Finish & save**, the **Shift review** page shows profit per full shift hour, recorded deliveries/hour, restaurant waiting and time outside timed deliveries. It compares actual shift mileage with entered offer mileage. Reopen it from History. Missing records are labelled; the mileage difference is not an exact measure of unpaid travel. No extra delivery-stage taps are needed.

Provider selection lives in **Settings → Delivery provider**, keeping the top of Shift, Order, Places and History free of selector pills. **Just Eat** is the default; choose Deliveroo, All or an additional named provider in Settings. Your explicit choice is remembered. Add another named provider in the same section. There is no generic Other option.

The Order tab starts with the Offer / Pickup / Waiting / Deliver steps, followed by the provider badge. Start your shift from the Shift tab; Order does not show an off-shift banner or start a shift automatically.

All on the Order tab shows today's combined overview. Choose a provider in Settings to enter a new offer. Accepted orders keep their own provider even when you switch views. In History, expand a delivery to correct its provider if needed; older records stay **Platform not recorded** until assigned explicitly.

Shift clocks, profit and expenses always cover the full shift across all platforms. The Shift graph comes first, followed by **Net earnings today** after configured expenses and before tax, then the Start/End shift controls. **Payments and expenses** expands the cost breakdown and each provider's payments before costs. Places filters recorded collections while sharing each restaurant's parking, notes and wait averages.

1. **Settings (⚙️ top right):** enter your petrol price (£/L), UK MPG, and insurance (£ per hour on shift, e.g. Zego pay-as-you-go).
2. **Shift tab:** the graph sits directly below the title/settings icon, retaining empty axes before there is data. Switch between **Today** (cumulative profit against time) and **Last 2 weeks** (daily profit). Tap or slide across populated graphs, or use the arrow buttons, to inspect exact amounts. **Net earnings today** below the graph always shows today's amount, independently of the selected graph period. During a shift, **Estimated live** uses completed offer fees/miles and insurance for all elapsed shift time; unrecorded travel, tips and adjustments can change the result. Enter the optional starting odometer before **Start shift**; use **End shift** to reconcile final earnings and total mileage. Complete or explicitly cancel an unfinished order before ending/cancelling its shift. The result is before tax and excludes depreciation. Review while safely parked. Shift cancellation is under **••• → Shift options**, and saved day/week summaries expand further down.
3. **Order tab**, in four steps:
   - **Offer:** type the fee and miles, and optionally the restaurant. The compact estimate stays between the inputs and acceptance button; **Offer time & calculation** expands optional minutes and assumptions. As you type the restaurant's name, the dropdown shows saved places first, then nearby OpenStreetMap matches with street, area and postcode. The estimate shows profit per hour and a verdict: worth taking, borderline or not worth it. If you've timed that restaurant before, it uses its own average wait.
   - **Pickup:** **I've arrived** is the main action beneath the restaurant name and starts the wait timer. Saved parking, directions and notes follow. **Save parking spot here** remains optional and should only be used once safely parked. Use **Cancel order** if the accepted order was abandoned.
    - **Waiting:** tap **Got the food** to save the wait time and start the delivery timer. While waiting, you can note where you parked, the time limit, how easy it was, and a note for next time.
    - **Deliver:** once the handover is finished and you're back in your car, safely parked, tap **Delivered**. This saves the fee, restaurant, offer mileage and timestamps, then opens the next offer. The timer survives switching apps or reopening the app. It includes driving, parking, walking and handover, without automatic location tracking.
4. **Places tab:** your restaurants, with average wait, parking and notes. Sort by most visited or slowest wait. Tap one to edit it.
5. **History tab:** completed deliveries with expandable timings, followed by shifts grouped by week. Deliveries recorded during a shift also appear in its breakdown. Offer fees don't add to shift earnings automatically: enter the final total from your platforms, including tips, when ending your shift.
6. **Work area (⚙️ → Restaurant search):** the town or city your search results come from. Starts as Manchester. Searching sends only what you type and this area to Photon (OpenStreetMap search), never your location.
7. **Backups:** in Settings, use **Download backup file** now and then. Backups include completed deliveries, the current order, platform definitions and the selected view as well as shifts, places and settings. Older backups can still be restored. Clearing Chrome's data deletes your records.

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

`tests/` has eight browser checks. `shift-guard.js` verifies pending-order protection and finish-time bounds. `usability.js` checks primary-action placement, stable offer layout, disclosure behaviour and pickup hierarchy. `charts.js` verifies live/historical profit calculations, elapsed insurance, reconciliation, point controls, period persistence, overnight shifts and empty/missing-data states. `platforms.js` verifies the global selector, accepted-order identity, filtering, platform corrections and backup compatibility. `delivery.js` covers completion, offline/reload recovery, backup round-trips, old records and shift reconciliation. All checks return a non-zero exit code on failure. `functional.js` taps every button and fills every input, including mistakes on purpose. `accessibility.js` checks every screen in light and dark mode for contrast and labels. `mobile.js` sweeps every screen and state in light and dark at three widths (Pixel 7, a small 320px phone, and large text): tap targets of at least 48px that don't touch, inputs with 16px text, no text under 13px, nothing clipped, nothing scrolling sideways, nothing stuck behind the tab bar, plus a full accessibility scan.

```
cd tests && npm install
npm run serve &   # serves the app on localhost:8765
npm test
```
