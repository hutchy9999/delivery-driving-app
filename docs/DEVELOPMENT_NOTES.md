# Development notes and decisions

Recorded 23 October 2026. This is a handover for James and future developers or coding assistants, including Claude Code. It summarises the discussion and implementation decisions rather than reproducing a chat transcript.

## Purpose and constraints

- James is evaluating self-employed Just Eat and Deliveroo driving, aiming for approximately £1,400 per month after vehicle expenses and tax, using as few delivery hours as possible to leave time for Voco.
- Optimise earnings per **total working hour**, not payment per delivery or only time spent carrying food.
- At the time of this discussion, James had not completed his first delivery. There is no substantial real-world dataset on which to base predictions.
- Keep the Android experience fast and simple. All entry and review while working must happen safely while parked. Missing optional details must not prevent recording work.
- Preserve the existing application and design. Avoid a framework migration, backend or native rebuild until actual use establishes the need.

## Existing application verified against the source

The review began at commit `7900b0dba4d22ce9562cfa073947c778dde96184`, on default branch `ccr-36df8c2a-0k4g7w`. The GitHub Pages deployment matched the source.

The app uses plain HTML/CSS/JavaScript, `calc.js` for calculations, `app.js` for screens and browser-local storage, and a service worker plus manifest for offline/home-screen use. There is no account, server database or cloud sync. GitHub stores code, not the driver's personal records.

Existing functionality included shift start/end, odometer-based mileage, manually reconciled earnings, history and a 14-day chart, CSV exports, JSON backups, restaurant branch lookup through Photon/OpenStreetMap, notes, parking details, Google Maps directions and restaurant wait timing.

On-demand GPS **already existed for saving parking spots**. There was no continuous GPS tracking, customer destination recording, platform-specific delivery ledger or traffic service.

The order workflow previously ended at **Got the food**. It saved a restaurant wait then cleared the order, including the fee and offer mileage. It did not retain customer-delivery timing or completed delivery records. This was the specific gap agreed for the first implementation.

## Agreed interaction and why

The updated workflow is:

**Offer → Pickup → Waiting → Deliver → next offer**

1. **Taking it → Pickup** records acceptance time when tapped in this app.
2. **I've arrived** records restaurant arrival and starts the wait timer.
3. **Got the food** saves the restaurant wait and starts the collection-to-completion timer automatically.
4. **Delivered** records completion after customer handover, once James is back in his car and safely parked.

The final interval includes driving, parking, walking, customer handover and returning to the car. It is **not a measurement of driving time alone**. Acceptance-to-completion includes the earlier restaurant journey and wait too, to the extent the buttons were pressed at the corresponding events.

There is deliberately no extra customer-arrival button. One extra completion tap was accepted as a practical starting point. Just Eat/Deliveroo still need their own completion actions; this app has no integration that observes or updates those platforms.

The shift clock continues between orders. Repositioning and waiting for another offer still count in full-shift profitability. A completed order does not imply the driver is immediately earning again.

## Implementation details

- Reused existing teal colours, light/dark themes, rounded cards, large buttons, timer styles and bottom navigation. Added a fourth progress pill, wrapping into two columns on narrow screens.
- **Got the food** now retains the current order and advances to the final stage instead of clearing it.
- Completed orders are stored locally under `sp.deliveries`. Each record retains its ID, restaurant ID/name, entered offer fee/miles/minutes, available acceptance/arrival/collection/completion timestamps, and available shift/settings context.
- Restaurant names are retained with the delivery so deleting a saved place does not erase its historical label.
- Shifts started by the updated app have stable IDs, reused when saving the completed shift. Older active shifts receive an ID when accepting a new order. Missing historical events are not invented for older in-flight orders.
- History shows expandable completed deliveries. Linked records also appear in shift details. Offer mileage remains labelled as mileage **from the offer**, not GPS-measured actual mileage.
- Delivery fees do **not** automatically add to shift earnings. Final platform totals and tips remain the source for shift reconciliation, avoiding double-counting.
- Completion saves the record before clearing the order; repeated clicks do not duplicate the same delivery. A failed completion save displays an error and leaves the order available for retry.
- Timestamp-based elapsed time survives switching apps/reopening and can complete offline. This is not continuous background execution or background GPS.
- JSON backups are now version 2 and include both completed deliveries and the current order. Version 1 backups remain supported; restoring one clears current order/delivery state absent from that backup. Restore is replacement, not a merge.
- The service worker cache version was bumped from `v13` to `v14`. Existing data keys for settings, shifts and places were preserved.

## Verification performed

- 167 existing/updated functional assertions passed.
- Added `tests/delivery.js` covering collection/completion, retained fields, switching screens, reload, offline completion, duplicate taps, failed storage write/retry, current-order and completed-record backups, old backup compatibility, cancellation and shift reconciliation.
- Accessibility checks passed in light and dark themes.
- Mobile checks passed across 27 screen states, two themes and three widths: 162 checks and 1,836 interactive elements measured. The new delivery screen and expanded history were included.
- Inspected phone-sized screenshots in light/dark themes and completed-delivery history.
- Updated browser checks to return non-zero exit codes when their assertions or audits fail. The previous scripts could print failures and still exit successfully.

See `tests/package.json` for the suite. Tests expect the app served on `http://localhost:8765/`, Playwright Chromium and dependencies installed in `tests/`. `SCREENSHOT_DIR` optionally enables screenshots in `delivery.js`. This validation used emulated Android browser dimensions; it is not a substitute for trying the workflow on James's actual phone during a real shift.

## Known limitations and deferred work

These were discussed, but are **not implemented by the Delivered change**:

1. **Offer-calculator time semantics:** a positive entered duration overrides the estimated restaurant wait/parking/handover model. Confirm whether that input represents a whole cycle before trusting the verdict. The calculator has no explicit approach/repositioning/idle-time components.
2. **Take-home target:** calculations deduct fuel, maintenance and hourly insurance, but remain before tax, have no explicit depreciation setting, and do not plan against the £1,400 monthly target. A default “worth taking” threshold is not an after-tax earnings guarantee.
3. **Limited learning:** restaurant wait is the mean of the last ten visits, used even after one visit. No sample-confidence treatment, individual-wait correction or time/day/platform model exists.
4. **Data entry:** platform identity, customer/destination area, actual delivery mileage, customer-arrival time and rejected offers are not recorded by this change. Completed delivery records currently have no individual edit/delete UI; decide the correction workflow before depending on detailed historical analytics.
5. **Storage:** records remain local to the browser. Backups are important; there is no cloud sync. General storage error handling and import validation could be strengthened beyond the completion-save handling added here.
6. **Earlier insurance format:** the existing restore path merges default settings into old shifts. This can insert `insurancePerHour` and override the calculation helper's fallback for older monthly-insurance records. This pre-existing compatibility issue was identified, not fixed in this scope.
7. **Settings timing:** existing shifts snapshot settings when being finished, rather than at shift start. Changing settings during an active shift affects that shift's eventual calculation.

## Practical next steps

First use this small end-to-end workflow for real shifts. Record complete working periods, total mileage and final earnings, and check whether the extra completion tap is sustainable. Review full-shift results before investing in advanced features.

Then prioritise clearer duration/cost assumptions, correcting missed timestamps, minimal platform/destination-area capture and simple comparisons of observed shift profitability. Do not infer demand just from accepted-delivery counts: those also reflect where and when the driver worked and which offers they accepted.

Foreground location suggestions can reuse the existing browser GPS approach. Reliable collection while Maps or platform apps are open, or the screen is locked, is a separate problem: installed web apps can be suspended. Consider a small Android tracking component only if real use shows sufficient benefit. Preserve the web interface and calculation code where practical, but explicitly design the data exchange; a separate native app cannot simply share Chrome's local storage.

Automatic geofence events should be editable suggestions rather than exact restaurant or food-collection timestamps. Background detection involves accuracy, battery, permissions and event-delay tradeoffs. No native companion, automatic arrival/departure detection, traffic integration or predictive/AI recommendation system was added in this change.
