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
4. **Data entry:** the Delivered change did not capture platform identity; the subsequent platform-selector change below adds it and allows explicit platform correction. Customer/destination area, actual delivery mileage, customer-arrival time and rejected offers remain unrecorded. Individual fee/timestamp editing and deletion remain deferred.
5. **Storage:** records remain local to the browser. Backups are important; there is no cloud sync. General storage error handling and import validation could be strengthened beyond the completion-save handling added here.
6. **Earlier insurance format:** the existing restore path merges default settings into old shifts. This can insert `insurancePerHour` and override the calculation helper's fallback for older monthly-insurance records. This pre-existing compatibility issue was identified, not fixed in this scope.
7. **Settings timing:** existing shifts snapshot settings when being finished, rather than at shift start. Changing settings during an active shift affects that shift's eventual calculation.

## Practical next steps

First use this small end-to-end workflow for real shifts. Record complete working periods, total mileage and final earnings, and check whether the extra completion tap is sustainable. Review full-shift results before investing in advanced features.

Then prioritise clearer duration/cost assumptions, correcting missed timestamps, minimal platform/destination-area capture and simple comparisons of observed shift profitability. Do not infer demand just from accepted-delivery counts: those also reflect where and when the driver worked and which offers they accepted.

Foreground location suggestions can reuse the existing browser GPS approach. Reliable collection while Maps or platform apps are open, or the screen is locked, is a separate problem: installed web apps can be suspended. Consider a small Android tracking component only if real use shows sufficient benefit. Preserve the web interface and calculation code where practical, but explicitly design the data exchange; a separate native app cannot simply share Chrome's local storage.

Automatic geofence events should be editable suggestions rather than exact restaurant or food-collection timestamps. Background detection involves accuracy, battery, permissions and event-delay tradeoffs. No native companion, automatic arrival/departure detection, traffic integration or predictive/AI recommendation system was added in this change.

## Follow-up: app-wide platform selector (23 October 2026)

James approved a mockup using the existing theme and then requested that the selector apply across Shift, Order, Places and History. The agreed initial order is **All → Just Eat → Deliveroo**, with All on the far left and selected on first use. A generic Other option was rejected; additional named platforms are created explicitly in Settings. Selection persists across tabs and reloads.

The implementation separates a **view preference** from an **accepted order's recorded platform**:

- The selector lives under the application title, outside individual tab content. It does not start/stop platform-specific clocks or retrospectively relabel accepted orders.
- All on the Order tab shows today's combined recorded fees and deliveries. A specific platform must be chosen before accepting a new order. During an active order, the Order tab continues to show that order, labelled with its original platform even if the global selection changes. Its identity also survives returning to the offer step.
- Deliveries snapshot `platformId` and `platformName` at acceptance. Collected waits carry the platform ID and order ID, allowing Places to filter actual recorded collections without duplicating restaurant notebooks. Parking, notes and the existing restaurant wait averages remain shared.
- Shift shows selected-platform delivery activity alongside clearly labelled **all-platform** shift clocks, mileage and profit. It does not present fee totals as platform net profit or divide overlapping working hours between apps. Active shifts restored without a stable ID do not inherit unrelated unlinked deliveries.
- History filters completed deliveries. Linked shifts, when filtered, still show clearly labelled full-shift totals. The daily fee summary uses local calendar dates; the complete delivery history still includes earlier dates.
- A delivery's expanded History record has a platform correction selector that saves explicitly chosen changes automatically. Matching restaurant-wait associations are updated too. No provider is guessed for older records, which remain visible under All as **Platform not recorded**.
- Additional platforms receive stable IDs in Settings, with case-insensitive duplicate/reserved-name checks and a 40-character name limit. Built-in ordering and names remain stable. Labels are escaped before rendering.
- Backup version 3 includes `platforms` and `selectedPlatform` alongside delivery snapshots and the current order. Versions 1/2 remain readable; absent provider configuration restores the default platforms and All view, without discarding historical platform-name snapshots. Unlisted historical platform fees still appear in All totals.
- Switching the global selector while editing a shared shift/settings/place form updates the selector without rebuilding the form or discarding typing.
- Service-worker cache version is now `v15`. Existing settings, shifts, places and delivery records are preserved.

Validation adds `tests/platforms.js` for default ordering, cross-tab selection, accepted-order identity, daily totals, shared Places records, explicit corrections, legacy records, custom providers, form preservation, backup round-trips and offline reloads. Existing functional, delivery and accessibility checks also run. The mobile audit now covers 30 states in two themes at three widths (180 combinations). This remains browser/emulated-phone validation; real-shift use on James's phone is still needed.

## Follow-up: compact Shift dashboard and interactive profit (23 October 2026)

James approved an interactive mockup before implementation. The purpose is to make progress during a shift visible, with a compact company breakdown above the graph. The existing vanilla JS architecture, teal theme, dark mode and bottom navigation are retained; no chart dependency or backend was added.

- Shift's compact **Today · offer fees** card always shows today's combined completed-delivery fees and individual platform amounts, including custom/unknown historical platforms. It uses completion date, regardless of which shift a delivery belongs to. The platform selector highlights a company's row; it does not hide the other companies on this overview. Order and History retain their existing filters. These are gross offer fees, not company-specific profit or final reconciled earnings.
- **Today** is initially selected. Its x-axis is local time and its y-axis is pounds. The curve accumulates recorded shifts that started today, plus the current active shift (including an explicitly labelled overnight shift). Points represent shift starts, completed deliveries and the latest/saved end of a shift. No intermediate delivery timings are invented for older shifts with no linked delivery history.
- **Last 2 weeks** shows daily profit for 14 local calendar dates and the period total. Saved shifts are grouped by start date, with an active shift's estimate included on its start date. This preserves a single attribution per shift, rather than splitting overnight mileage/earnings across midnight. Today's completed-fee card and the shift-start-based profit grouping can therefore differ for overnight work.
- Tap/drag selects the nearest time/date point, with exact pounds/pence below the graph. Arrow buttons also work with keyboard/screen readers. The last point is selected initially. Negative profit is supported; the graph is not forced to rise. Period preference is local cosmetic state (`sp.chartRange`) and is not added to backup data.
- Live profit = completed **linked** offer fees minus entered offer miles × (fuel allowance + maintenance allowance), minus insurance for **all elapsed shift time**. This includes insurance during waiting/idle time. It excludes current unfinished deliveries, unrecorded approach/return/repositioning miles, late tips and adjustments. Missing fee/mileage fields trigger an incomplete-estimate message. An unlinked historical delivery cannot inflate a running shift's profit.
- The clock/profit refresh every 15 seconds while Shift is visible, and on return to the page. Refresh preserves selected points, keyboard focus and the open explanation, and pauses during graph dragging. This is timestamp-based UI refresh, not background tracking.
- Saved shift endpoints use the existing `calcShift` result, reconciling to final earnings and total mileage entered at shift end. Historical intermediate delivery costs remain estimates: final vehicle costs are apportioned by cumulative offer miles (or elapsed time if no offer mileage is available). The endpoint can change for tips, corrected mileage or other adjustments. Straight chart segments are visual interpolation between recorded events, not observations of earnings throughout the journey.
- All graph profit is **before tax**, after configured fuel, maintenance and insurance. Depreciation remains excluded. Costs are allowances, not exact bills. Platform-specific net profit is deliberately not invented from shared working time/mileage.
- Existing records and backup format v3 remain intact. Cache version is bumped to `v16` so the installed/offline app can obtain the update.

### GPS and later recommendations: explicitly deferred

James chose **no new GPS implementation** for this update, because he has not yet completed a shift and estimates are sufficient to test the workflow. The pre-existing manual parking-location feature remains as it was.

We discussed collecting the best fresh reported-accuracy fix over 5–10 seconds on opening the app. That would supply checkpoints, but distances between sparse coordinates are straight lines; a road-routing API would estimate a possible route rather than establish the actual route driven. Continuous foreground browser samples still leave gaps when Maps/Just Eat is open or the screen is locked. Frequent refresh cannot solve the web app's background restrictions.

At the default 1.40 GBP/litre, 45 UK MPG and 5p/mile maintenance, vehicle allowances are approximately 19.14p/mile; half a mile of error is about 10p, one mile about 19p. Insurance at 1.16 GBP/hour is about 9.67p per five minutes. These illustrate sensitivity, not a promise of 10–20p real-world accuracy. Compare the live estimate with full-shift odometer mileage and final earnings before trusting it.

A locally installed Android app with a native background-location component may become worthwhile after actual use establishes the benefit. Packaging the website as an APK alone does not provide reliable continuous tracking: permissions, Android background limits, accuracy filtering and persistent storage/data exchange still need design. Preserve and reuse the current interface and calculations where practical. Later GPS traces could be combined with editable timing checkpoints to analyse waits, route cycles and repositioning. Predictive accept/decline or positioning recommendations need sufficient representative delivery/idle/rejected-offer data and validation; none are implemented here.

### Verification

`tests/charts.js` checks pure timeline calculations and browser behaviour: elapsed insurance, idle/negative profit, linked versus unrelated records, missing inputs, multiple shifts, historical reconciliation, old shifts, point inspection, escaped restaurant labels, keyboard/drag controls, period persistence, overnight work and empty states. Existing functional checks were updated for the approved default/summary layout. The mobile sweep adds populated, fortnight and expanded-explanation chart states, across both themes and three widths. This is emulated-browser validation; James's first real shift remains the practical check.

Validation passed: 168 functional assertions, delivery/platform/chart suites, light/dark accessibility scans and 33 mobile states × 2 themes × 3 widths (198 combinations, 3,000 measured interactive elements). The chart suite also checks that elapsed insurance refreshes with a graph control focused, retaining focus and the expanded explanation. Phone-sized light/dark screenshots of both chart periods were inspected. No new network or location requests are introduced.

## Follow-up: workflow protection and mobile usability (23 October 2026)

After reviewing the deployed chart update, James requested the unfinished-delivery workflow fix immediately, followed by assessment priorities 1–4: accessible shift controls, primary arrival action, stable offer entry and less competing summary/help content. These were implemented within the existing design rather than producing separate mockups for each adjustment. Settings reorganisation and broader filtering changes were not included. GPS and learning-progress features remain deferred.

### Workflow protection

- Ending or cancelling a shift is blocked while any accepted/in-progress order remains unfinished, including returning an accepted order to Offer and older orders missing acceptance timestamps. The notice offers **Return to current order** and **Keep shift running**. It does not fabricate delivery completion or silently discard the order.
- Direct navigation to `#end` is protected, as is the save handler if another tab creates an unfinished order after the form opens. Existing shift drafts are retained. Pickup now exposes explicit order cancellation; backing to Offer also presents confirmed cancellation rather than an unconfirmed clear action for accepted work. Completing or deliberately cancelling the order allows reconciliation to continue.
- Untouched finish times use the actual save instant rather than a stale minute from when the form opened. An explicit finish minute cannot precede a linked completed delivery. Completion seconds within the selected finish minute are retained so a delivery is not excluded from the profit timeline by datetime-input rounding. This validation applies when finishing the active shift; it does not introduce general timestamp editing or historical-record repair.

### Layout and interaction changes

- Shift starts with its Start/End controls, ahead of fees and graph. Active duration and platform scope share one compact status row. Optional cancellation/starting-odometer details sit in the **••• Shift options** disclosure. A pending order has a return link from Shift.
- The company fee breakdown is retained. The graph remains interactive and all-platform. Its plot/readout are shorter, axis wording is concise, and the duplicate running clock is removed. Empty graphs use a compact useful message instead of blank axes and disabled point arrows. Additional saved day/week summaries are under one disclosure, preserving their information without competing with the main profit number.
- Pickup puts **I've arrived** directly below restaurant identity (or before restaurant selection when none is known), consistently using primary styling. Parking capture/directions remain available as secondary actions. Existing manual GPS parking capture is reused without new tracking capabilities.
- Offer fee/mileage inputs precede a compact reserved-space verdict; restaurant selection and acceptance follow. Normal fee/mileage updates no longer grow a large result card above the input form. Optional offer minutes and full calculation assumptions expand below the acceptance action, reopening automatically when a saved offer has entered minutes. Calculator mathematics and offer-time semantics are unchanged.
- The active-order platform badge remains visible. The longer platform-lock explanation appears only when the selected specific platform differs from the order's recorded platform. The provider selection never relabels accepted work.
- Existing records, local storage keys and backup v3 are preserved. Service-worker cache is now `v17`.

### Verification

`tests/shift-guard.js` covers unfinished pickup/waiting/delivery/accepted-offer states, direct navigation, cancellation protection, draft retention, completion/cancellation recovery, submit-time rechecking and finish-time bounds. `tests/usability.js` checks action placement, stable acceptance-button position across normal offers, optional-time persistence, pickup hierarchy, resume-order access and guarded recovery. Existing functional, delivery, platform, chart, accessibility and mobile checks remain in the suite. The mobile audit includes the guard, optional offer details and shift options. Phone screenshots of the new screens use disposable sample data, not James's records. Real Android keyboard/outdoor use still requires on-device verification.

Validation passed: 167 functional assertions; delivery, platform, chart, shift-guard and usability suites; light/dark accessibility scans; and 36 mobile states × 2 themes × 3 sizes (216 combinations, 3,240 measured targets). The mobile sweep found and prompted fixes for spacing below the offer-detail disclosure and hidden disclosure contents; the final sweep reported no issues. Smaller poor-offer verdict text has stronger light-mode contrast. Shift options close on Escape or an outside click. Editing only the shift start leaves the finish automatic; older draft time edits remain respected. James requested publication at this point to conserve usage; additional refinements remain deferred.

## Follow-up: provider selection in Settings (24 October 2026)

James requested removing the persistent All / Just Eat / Deliveroo pills from every main tab to recover vertical screen space. Provider selection now exists only in **Settings → Delivery provider**, with the current option highlighted. Just Eat is the default so a first shift/order does not require visiting Settings. All remains available there for combined history/Places/Order views, and the Shift profit graph and company totals continue to cover all providers regardless of that preference.

The old implicit/default All view falls back to Just Eat until an explicit choice is made through the new Settings control (`sp.providerSettings`). Existing specific provider choices are retained. Choosing All in Settings persists it deliberately; backup v3 can still restore an explicit All selection. Imports without provider metadata now default to Just Eat. No accepted order, recorded delivery or saved shift is relabelled or migrated. Changing the view rebuilds only the Settings control, preserving other input in that screen. Empty-state instructions now point to Settings instead of a nonexistent selector above.

Tests navigate through Settings when changing providers and cover the new default, upgrade from the old All view, selection persistence, locked accepted-order identity, custom providers, backup compatibility and absence of a selector on main screens. Existing workflow, calculation, accessibility and mobile checks remain applicable. Cache version is `v18`; records and backup format remain unchanged.

## Follow-up: graph-first Shift and net earnings (24 October 2026)

James explicitly changed the preferred Shift hierarchy to **title/settings → graph → Net earnings today → Start/End shift**. This supersedes the earlier request for controls before the graph. The Today / Last 2 weeks switch remains available and empty graphs retain monetary/time or date axes without invented data points. Point controls and detailed methodology appear when data exists. Empty labels are short enough for narrow phones; graph totals use quieter typography so the daily earnings card remains the main amount.

**Net earnings today is not a renamed offer-fee total.** It uses the existing Today profit model: recorded completed linked-offer earnings and entered mileage allowances plus elapsed insurance while active, reconciled to final shift earnings/mileage once saved. It is before tax, excludes depreciation, and may omit unrecorded travel. The card stays on Today even while the graph shows two weeks. Payments, modeled expenses and provider gross-payment amounts remain accessible in **Payments and expenses**; no provider-specific net profit is fabricated from shared costs. Both graph and net card refresh during a running shift, preserving expanded details and focus. Existing attribution by shift start date is retained; the current overnight shift is explicitly labelled when included from its start.

No GPS, new prediction model or storage migration was added. Existing delivery records, provider choices and backup v3 remain intact. Cache version is `v19`. Tests cover restored empty axes, the requested visual order, true net-versus-gross amounts, independent Today earnings across graph periods, elapsed-insurance refresh and the expandable breakdown, alongside existing workflow/accessibility/mobile checks.


## Follow-up: compact Order header (24 October 2026)

James requested more usable space on Order: the Offer / Pickup / Waiting / Deliver progress steps now appear first, with the provider badge immediately below. The off-shift warning and its inline Start shift shortcut have been removed. Shift still starts explicitly on the Shift tab; opening or accepting an order does not start the shift clock automatically. Accepted-order provider identity and the provider-mismatch explanation are retained. No records, calculations or backup formats change. Cache version is `v20`. Functional and platform checks now start shifts through Shift; mobile usability checks cover the off-shift layout and absence of an automatic start.


## Follow-up: post-shift review (24 October 2026)

James requested priority one: a quick review using existing records, including actual shift mileage versus entered offer mileage. End shift still opens the reconciliation form; Finish & save opens the enhanced saved-shift review, also accessible through History and after editing. Profit per hour uses the entire shift and configured costs before tax, excluding depreciation. The review adds linked delivery count/rate, recorded restaurant waiting and time outside timed deliveries, plus actual miles, entered offer miles and their signed difference.

All-platform review totals ignore the current provider filter. Only explicitly shift-linked deliveries completed inside the saved shift count. Valid time intervals are clipped to the shift and merged to avoid double counting overlapping jobs. Coverage counts expose missing timings. Outside timed deliveries includes repositioning, breaks, demand waiting and missing entries; it is not labelled idle time. Mileage differences are withheld if any recorded delivery lacks mileage and are never labelled exact unpaid travel. No records are reassigned and no new routine input, GPS or predictions are introduced. Existing profit calculations, local storage and backup v3 are preserved. Cache v21. Tests cover overlaps, missing data, boundaries, signed differences, mobile themes and edit/save navigation.

## Follow-up: delivery correction tools (24 October 2026)

James requested editing completed delivery fees, entered offer miles and timestamps without increasing routine delivery interactions. Expand any completed delivery and choose Edit delivery. A separate form saves explicitly or cancels; corrected records are marked and retain originalValues from before the first correction and the latest correctedAt time. Further corrections retain that first snapshot. This is an original/latest record, not a full revision history. Existing provider correction remains separate.

Acceptance and restaurant arrival may remain unknown; collection and completion are required for a completed delivery. Validation rejects negative/nonfinite fee or miles, reversed timestamps, future events and times outside an existing linked shift. Untouched timestamp precision, including milliseconds, is preserved. Stale forms cannot overwrite another tab's newer record. Corrected linked restaurant waits are updated or removed and sorted chronologically for the existing last-ten average; waits above the existing 90-minute cap remain excluded. Unlinked historical wait samples are never guessed or removed. A failed delivery write rolls back the wait-cache update. Saved shift financial totals still use the final entered shift earnings/mileage, not revised offer estimates; the form explains this. Live timelines and shift review recalculate from corrected records. No shift relinking, GPS or destination capture was added.

Backup v3 retains the additional record metadata without a migration. Cache v22. New browser checks cover save/cancel/no-op, originals across repeated edits, timestamp precision/order/bounds, wait synchronization, immutable shift totals, storage failure rollback, concurrent edits, backup restoration, legacy records and phone layouts/light-dark accessibility.

## Follow-up: brief delivery-completion location capture (24 October 2026)

James approved a foreground-only location sample after Delivered, refining the maximum attempt to five seconds and the early finish target to estimated accuracy of 30 metres or better. Completion is saved before requesting location. A separate status card survives navigation among this app's tabs and shows finding, saved accuracy, skipped, interrupted or failed states. Skip cancels the watcher and discards any pending fix. Hiding the app or locking the screen cancels capture; reload does not restart it. All callbacks are tied to the specific delivery/capture attempt, so a late result cannot affect a new order or retry.

The browser high-accuracy watcher requests fresh positions, keeps the best finite valid fix and stops at 30 m or better, or after five seconds. At the deadline a best fresh fix within 100 m is retained with an explicit approximate label; poorer or stale fixes are rejected. This threshold is a pragmatic area-analysis fallback, not a guarantee of actual position accuracy. Coordinates, reported accuracy and the location timestamp are saved as deliveryLocation on the completed record. No mileage, route or customer handover is inferred. Retrying is limited to two minutes after completion and labelled Retry at drop-off; the saved timestamp distinguishes capture from completion. A failed location write leaves completion intact.

Capture is enabled by default for this explicitly requested feature, subject to the browser's location permission prompt, and can be disabled in Settings. Saved locations can be removed in delivery history. No reverse-geocoding, customer address lookup or background tracking was added. Coordinates remain local to this app and are included in backups; backup v3 also retains the capture preference. Import stops any current capture. Existing correction tools preserve location metadata. Cache v23.

Tests mock browser location rather than requesting James's location. They cover immediate completion, internal tab navigation, early finish, five-second best-fix fallback, stale/poor/invalid fixes, Skip and late callbacks, retry, permission denial, hidden-page cancellation, Settings off, quota failure, backup round-trip, removal and light/dark phone accessibility. Existing delivery/offline/backup, correction and functional suites are rerun. Real Android permission prompts, acquisition speed and lock-screen behaviour still need an on-phone trial; no 30 m accuracy guarantee is made.

## Follow-up: compact Shift earnings summary (24 October 2026)

James reported that the starting odometer fell beneath the fixed phone menu. Net earnings today now uses two columns: title and amount on the left, platform/tax scope, completed-delivery count and the Payments and expenses disclosure on the right. The expanded breakdown spans the full card width. This recovers vertical space while retaining the graph-first hierarchy, explicit expense assumptions, keyboard/touch targets and all financial calculations. Overnight and incomplete-data notices remain full-width. No data or backup changes. Cache v24.

Mobile usability verifies the starting odometer is wholly above the tab bar at a 390x844 viewport and checks closed/expanded summaries at 320, 360 and 390 widths. Phone light/dark screenshots are reviewed; chart refresh/focus and accessibility checks remain applicable. Smaller viewport heights, enlarged text, extra warnings or expanded details can still require scrolling; the page is never clipped or locked to one screen.
