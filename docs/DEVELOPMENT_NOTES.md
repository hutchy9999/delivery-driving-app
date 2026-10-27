# Development notes and decisions

## Follow-up: preserve pickup target on APK reopening (27 October 2026)

At James's request, fix only the first review finding: a recreated WebView forgot its transient pickup target and overwrote the native service's still-valid target with an empty one. Native state now reports the attached job ID and whether it has a matching, unexpired, unfinished pickup target, without exposing coordinates. UI reconciliation preserves that target when it has no replacement. Existing expiry is not extended, and targets from expired/different jobs are not reused. A regression test reproduced the overwrite before the change and passes afterwards, alongside the existing native-adapter checks. APK version 0.1.1-trial replaces 0.1.0-trial using the same signing identity. Other review findings are intentionally outside this fix.

## Follow-up: optional Android trial and diagnostics (27 October 2026)

James requested an APK preserving existing features with on-shift GPS and automatic pickup-stop estimates to avoid duplicating platform taps. His Nothing Phone (2a) runs Android16. Capacitor8 packages shared screens; a Java location foreground service records private SQLite points/events while other apps are open or the screen is locked. Tracking is opt-in and shift-scoped, requests ten-second cadence (five-second minimum), and has visible notification/pause and explicit end/cancel stop. Raw traces are not automatically uploaded. Final costs still use odometers.

Pickup inference compares independently measured stops with expected targets, records uncertainty and preserves Simple mode's unknown timestamps. Manual corrections override learning. Three independent valid branch observations precede lifetime mean use; Settings default applies earlier. Google comparison targets are temporary and excluded from backups. Single-pickup inference needs field validation.

The supplied private web backup round-trip passed with external requests blocked: 2 shifts, 7 deliveries, 2 places and all original fields/settings/locations preserved. No personal file, credential or signing key is committed/packaged. Android save-picker backups include native readings; legacy restore switches tracking off. Web/APK storage remain separate. Keep private signing files for future compatible updates.

James additionally requested end-of-day diagnostics to share for analysis. Settings exposes bounded local logs, download and clear. Workflow/OCR/traffic/error/lifecycle and native service/GPS quality/gap/pickup decisions are retained without screenshots, addresses, exact coordinates, fees or API keys. Logs have seven-day/size limits and logging failures cannot block core saving. See [Android trial notes](ANDROID_TRIAL.md) for build, migration, validation and limits. Cache v33 adds diagnostics to the web offline shell; the APK skips service workers and bundles its own assets.

## Follow-up: Google-only traffic-aware offer duration (27 October 2026)

James enabled Routes API and Maps JavaScript API, restricted a browser key to his GitHub Pages host and the two APIs, and explicitly authorised sending current foreground GPS position plus offer pickup/drop-off postcodes to **Google only**. A first network implementation including Postcodes.io was rejected by automatic review; after clarification James chose Google only. No new traffic postcode lookups use Postcodes.io. Existing restaurant search and map postcode lookup retain their prior services. The key is entered directly in Settings on the user's phone, not in chat or GitHub. Device-only credentials/preferences/usage are excluded from normal backups and cost snapshots.

Reuse Google's supported browser Routes library rather than adding a backend. The SDK loads only when traffic is enabled; no Google map is constructed. Foreground GPS and SDK preparation start alongside screenshot OCR; after extraction, two `TRAFFIC_AWARE` requests calculate current position→pickup and pickup→ordered drop-offs. The latter departs after predicted arrival plus collection delay. Intermediate drop-offs preserve screenshot order, with no waypoint optimisation. Only complete UK postcodes are sent as address strings; names/full address text and image bytes are not sent. Multiple distinct pickup postcodes or more than five drop-offs fall back instead of silently omitting stops. Coordinates are not obtained from a new third-party geocoder. Postcode-centre routing is labelled approximate.

The main duration is **total estimated job time**, and effective profit/hour divides estimated net profit by that same total. Include travel to pickup, collection wait, travel to every drop-off and parking/handover allowance per drop-off. Use route mileage once for preview fuel/maintenance and full duration for insurance. Entered offer miles remain saved on the delivery for existing shift/mileage reconciliation; route results are not substituted into recorded history. Unknown return/repositioning travel, time waiting for the next offer, depreciation and tax remain excluded. Optional Detailed Minutes override predictions explicitly.

James clarified the wait rule while implementation was in progress: use the Settings collection-wait default until **three independent valid observations** exist at that exact branch, then use its **lifetime arithmetic mean**, not a recent window or weighted prior. Match saved restaurant name plus postcode uniquely; ambiguous/unmatched branches use the default. Deduplicate jobs and notebook wait events by order identity, prefer corrected job waits, preserve explicit manual waits and omit obviously abandoned long automatic timers. Simple screenshot jobs can link to that known branch without another selection tap; their acceptance/completion alone is never a measured restaurant wait. Places also displays lifetime recorded averages. The old mileage-only combined stop allowance remains separate from the new explicit collection wait + per-drop-off handover assumptions.

One 10-second deadline covers the screenshot-triggered traffic attempt, not an additional ten seconds after OCR. First use, permissions, network and OCR speed mean a complete live result is not guaranteed. Fresh GPS uses a short watch, stopping early at 30 m or better and accepting a best fix up to 100 m within five seconds. No background tracking; hiding/navigating away, cancellation, acceptance or deadline prevents late UI/storage updates or a late second request. Google requests already dispatched cannot be recalled. Confirm stays available. Ready predictions expire after 90 seconds; there is no automatic traffic polling. Address edits restart after a debounce; amount edits recalculate locally without extra route requests.

The default is off until Save key & enable traffic explicitly opts in. Settings explains sharing and has removal controls. A conservative per-device Pacific-month counter reserves two calls before a calculation and stops at 4,500; this is not an account-wide billing guarantee, cannot see other devices and resets if browser data is cleared. Google Cloud quotas are still needed. Recheck enabled/key state before dispatching either request. SDK/API failures are shown generically without echoing provider errors or credentials. Browser keys are protected by referrer/API restrictions rather than treated as hidden server secrets.

Google route content remains in memory only, outside localStorage/backups, and is not plotted on the existing OpenStreetMap map. Attribution is displayed with estimates; public privacy/terms pages describe processing, external services and usage. Cache v32 includes these pages and the new local scripts. Keys are deliberately not restored with phone backups.

Validation uses a simulated Google SDK and synthetic screenshots/coordinates: correct request shape and waypoint ordering, Google-only egress scope, the full-duration profit formula, default/three-wait/lifetime behaviour, correction deduplication, multiple handovers, caps, failed/denied location, provider fallback, ten-second deadline, cancellation/late results, privacy/backup exclusions, and light/dark small-phone accessibility. Existing app regression suites are also run. Live authenticated Google responses and real phone end-to-end latency cannot be verified without James entering his restricted key in his own installed app; this limitation must be stated at release.

## Follow-up: earlier map visibility (26 October 2026)

At James's request, the current map minimum is **3 usable jobs across 2 recorded shifts**, reduced from the original 5/3 below. It applies independently to each area after time/provider filtering. These remain exploratory, limited-history results, not statistical confidence or a demand forecast. Empty-state and method text derive their thresholds from the shared constants. Boundary checks cover two jobs/two shifts being hidden, three jobs/two shifts appearing, and records from only one shift remaining hidden. Cache v31 publishes the update.

## Follow-up: observed pickup earnings map and navigation (26 October 2026)

James approved the Areas mockups, requested no grey/unknown-area circles, discussed stable circle sizing/evidence thresholds, and asked for Google Maps directions from selected-area statistics. He then authorised building the feature. Areas replaces the bottom Places label; Earnings map and Saved places are local views. Existing `#places`/`#place/:id` routes, notebook edits, waits and parking remain intact. Shift has a small map shortcut below its existing controls.

The map is descriptive, not machine learning or a demand forecast. Use combined estimated profit divided by combined acceptance-to-completion hours, never a simple average of individual hourly rates. Jobs require valid nonnegative fee/mileage, positive recorded duration and a known pickup position. Cost snapshots prefer job, then linked shift, then current settings. Unknown positions/timings are excluded, not inferred from customer GPS. Provider selection is map-local. Current weekday +/- one hour is the initial filter; midnight windows cross into the neighbouring weekday. Explicit fallbacks show all times or the same time Monday–Friday, with broader-history labels.

`areas.js` contains pure grouping/filter/calculation helpers. Stable local hexagonal bins use a 250 m circumradius (roughly 500 m across); centres and grouping do not move when filters or record counts change. Geographic projection is a Manchester-latitude metre approximation suitable for this local UK app, not a general global clustering engine. Show a circle only after 5 usable jobs across 3 explicitly linked, recorded shifts whose bounds contain those jobs. These are exploratory minimums, not a calibrated statistical confidence level. Sparse areas remain uncoloured; no grey placeholders. Circle colour follows current good/borderline hourly thresholds; size represents geography, not earnings, sample count or demand.

Known pickup locations are read from saved places and snapshotted on new Detailed acceptances. An explicit Locate pickup postcodes action resolves at most 10 unique pickup postcodes per attempt through Postcodes.io; same-postcode jobs share one request. Only pickup postcodes are sent. Returned centres are validated, saved as `delivery.pickupLocation` with provenance/postcode/time, retained by backup v3's existing record preservation, and labelled approximate/branch-unconfirmed. This supports Simple screenshot jobs without adding required delivery taps. No automatic text/address geocoding or background GPS is introduced. Failures are retryable and do not remove jobs; leaving the view aborts pending lookups. Lookup rechecks current job identity/postcode before writing.

`areas-ui.js` renders filters, map, an accessible area-list alternative, details and linked job records. Navigation uses universal Google Maps URLs with driving mode and no forced origin or immediate navigation. Prefer a saved parking spot associated with a pickup in the selected area; otherwise use a recorded pickup or labelled postcode centre. Do not route to an invented safe parking point or arbitrary centroid. Android can hand the URL to Google Maps; browser fallback remains possible. Users choose directions while parked. Centre on me is a user-triggered, one-shot foreground fix, displayed transiently without saving or starting tracking.

Leaflet 1.9.4 is vendored with its BSD licence, avoiding CDN availability on normal startup. OpenStreetMap street tiles use the official HTTPS endpoint, visible attribution and normal browser HTTP caching. They are not bulk-downloaded or put into the service-worker offline cache. The map tile service receives viewport/IP, not job records; Google Maps receives a destination only after the link is used. Cache v30 includes the new app-shell scripts/library/CSS. Offline local statistics and destination links work even without street tiles. Third-party street maps/directions still need connectivity.

Limitations are visible in the UI: estimated job costs use offer miles; between-job waiting and unentered repositioning miles are excluded, as are depreciation and tax. This must not be called total shift profit/hr or evidence that the next offer will arrive there. Accepted-job history reflects where the driver chose to work and cannot establish demand in unvisited areas. Precise customer-location history is deliberately not displayed as pickup evidence. More advanced positioning recommendations and background route tracking remain deferred.

Validation: new pure-model and browser suites cover minimum evidence, stable grouping, weighted rates, historical settings, invalid/duplicate records, provider/time/midnight filters, customer/pickup separation, parking/Google Maps URLs, preserved notebook, explicit postcode lookup/retry/persistence, light/dark mobile accessibility, and offline shell/statistics. Existing delivery, shifts, corrections, OCR, providers, charts and mobile checks are run alongside them. All test data is synthetic in isolated browser profiles, never James's phone history.

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

## Follow-up: postcode-first pickup entry after the first run (25 October 2026)

James found fee/mileage entry easy but had trouble finding restaurants such as McDonald's by name. Pickup selection is now postcode-first across Offer, Pickup and Waiting. Full UK postcode-shaped inputs are normalized with/without spaces; saved matches are instant and whitespace-insensitive, including earlier saved address strings. Name search through Photon remains available. Partial postcodes prompt for the full code instead of creating a misleading named place.

Full postcode lookup resolves coordinates via Postcodes.io, then asks Overpass for named restaurants/fast food/cafes/food courts within 300 m. Results matching the postcode rank first; nearby results explicitly require checking the branch/address, with no automatic selection. Successful lookups are cached in memory, aborted on changed input, bounded to eight seconds, and protected against stale results. Existing OSM identities retain notes/waits/parking. No live GPS is requested for search. Settings explains the two new external services and the data they receive.

Use postcode only is available immediately even offline or on lookup failure. It creates an explicitly unconfirmed postcode pickup without inventing restaurant coordinates or directions; repeated postcode-only use reuses that record. Wait metadata identifies postcode-level history, which may combine businesses. Naming the place later in Places marks the record as named. Existing places, deliveries and backups remain intact. Cache v25.

Mocked integration checks cover normalization, exact/nearby branch labels, saved identity/notes, fee/mileage preservation, offline reuse, postcode-only fallback without duplication, partial input, retained name search, service errors and no results. Live Postcodes.io returned successfully; live Overpass was at capacity during verification, so restaurant availability is explicitly best effort and the immediate fallback is essential. Functional and light/dark accessibility checks are rerun. No real delivery data was edited.

## Follow-up: edit place names and manually correct restaurant waits (25 October 2026)

After a first-run visit showed an incorrect one-minute wait, James requested direct editing. Places now clearly opens Edit place with the existing auto-saving name/area fields, and lists all linked completed deliveries with an Edit wait link. Corrections opened there return to that place. History/correction labels use a linked place's current name while retaining the recorded restaurantName as a fallback if the place is deleted.

Edit delivery now includes Restaurant wait (minutes), populated from the current effective duration. Changing it records a manualWaitMins override without inventing timestamps. Clearing it returns to timestamp-derived duration. Explicit zero is valid; invalid/negative values or values above 1440 minutes are rejected. Existing originalValues retains the pre-first-correction values, including the original wait override where present. Untouched datetime inputs retain their original representation even when the browser drops zero seconds from the rendered value.

The linked place wait cache and its last-ten average use the effective duration, including explicit manually confirmed waits beyond the automatic 90-minute timer cap. No duplicate sample is added. Completed-delivery history labels manual durations; shift review adds entered manual waits as durations and explains their exact timing/overlap is unknown. Automatic timed intervals still merge overlaps. Acceptance-to-completion, outside-order time, mileage and financial totals are unchanged. Backup v3 retains metadata; no migration needed. Cache v26.

New checks exercise place renaming and preserved notes, Edit wait return navigation, one-to-seven-minute correction, original timestamp retention, averages/review, validation/cancel, zero and clearing the override. Existing correction, shift-review, functional and light/dark accessibility suites are rerun. Real phone data is not edited by development checks.

## Follow-up: Order CTA wording (25 October 2026)

At James's explicit request, the first Order CTA now reads Picked up instead of Taking it -> Pickup. This is a label-only change: it still accepts the offer and opens the Pickup stage; arrival, restaurant waiting and the later Got the food collection timestamp retain their existing behaviour. Cache v27.

## Follow-up: Simple and Detailed job workflows (25 October 2026)

James found duplicating every delivery status across two apps too demanding and requested a minimal option. Settings now starts with Job workflow: Simple (default) or Detailed. Simple offers only fee, offer miles and the existing estimated verdict, followed by Confirm. That snapshots provider, shift id, settings, acceptance time and workflow mode, then shows Finish job with no restaurant/arrival/collection stages. Completion saves immediately, returns to the offer screen and invokes the existing optional five-second foreground location capture. Starting/ending shifts, odometers, final earnings, shared expenses, charts and reconciliation remain unchanged.

Detailed retains postcode/restaurant selection, progress pills and arrival/wait/food-collection actions. Each accepted job keeps its mode despite preference changes; existing in-progress orders without a mode retain their Detailed workflow. The selected mode affects subsequent jobs. Simple estimates ignore hidden restaurant/manual-time draft data and explain that configured speed/stops are assumptions. Fee and mileage are required for Simple confirmation. Cancellation and unfinished-order shift guards remain available.

Simple completed records deliberately leave restaurant arrival/collection blank, rather than fabricate data. History labels Simple records and handles absent collection times. Correction forms allow collection to remain unknown for Simple jobs. Backup v3 accepts active/completed Simple jobs without collectedAt and retains the workflow preference, preserving older Detailed records and backups. No route tracking or extra required input was added. Cache v28.

A dedicated Simple suite covers the default/minimal form, invalid-input recovery, confirm/finish, reload, mid-job preference changes, shift guards, offline completion and GPS, active/completed backup restore, correction without restaurant timestamps, odometer reconciliation, old Detailed jobs and light/dark phone accessibility. Existing suites explicitly select Detailed in their fixtures so both workflows remain covered; the full suite is rerun. Phone-sized Simple offer and active-job screenshots are inspected. No real user records are edited.

Validation passed: the full suite, including 169 functional assertions, both workflow modes and 37 mobile states x 2 themes x 3 sizes (222 combinations, 2832 measured targets), reported no issues. Confirming the next job also clears the previous location status card, so no separate dismissal is required.

## Follow-up: local offer screenshot import (26 October 2026)

James requested a file upload immediately below offer fee/mileage, to reduce transcription of collection and multiple drop-off addresses. Both workflows now offer an optional screenshot picker. Local Tesseract.js OCR fills identifiable payment/mileage and opens editable pickup/drop-off review fields before Confirm. Clear total labels take precedence; multiple ambiguous amounts/distances are left for manual entry rather than summed or guessed. Multiple labelled drop-off blocks are retained, including repeated addresses. Clear screenshot layouts help, but no real Just Eat sample was available for this implementation, so parsing remains explicitly best effort and review is required.

The screenshot is processed in a browser worker, with a ten-second whole-attempt deadline including first-use loading. Successful reading returns sooner. Use manual entry cancels; Confirm remains usable while reading. Changing tabs/confirming/clearing cancels work, and late results cannot change a new order. Numbers edited during reading are preserved. Failure/low-confidence/ambiguous-field messages explain what needs manual entry. Selected-file references and the processing canvas are cleared; no image or full OCR transcript is added to storage/backups or sent to a server. Android's original screenshot is not deleted.

Only reviewed amounts and offerDetails text (pickup, drop-off array, import source/time) are retained on the job and backup v3. Locations remain editable text, not verified/geocoded positions or automatic restaurant identity matches. The pickup's first address/name segment labels the job when no restaurant is selected. Active and completed jobs expose Offer locations. No extra stage buttons, API keys, backend or cloud LLM were added.

Pinned Tesseract.js 7.0.0, core 7.0.0 and English model 1.0.0 load from jsDelivr only when importing. First use needs connectivity; software/model caching does not store screenshots. offer-ocr.js is part of the app's offline shell; cache v29. Browser recognition of a synthetic two-drop-off offer completed in about 4.1 seconds on this computer. This is not a phone benchmark or a guarantee for real offers.

New checks cover conservative parsing, multiple destinations, review/autofill, edits winning over late OCR, cancellation/timeouts, Confirm during reading, completion persistence, backup round-trip, phone overflow and light/dark accessibility of review. A real browser OCR smoke test used a generated synthetic image and external runtime/model downloads, rather than mocking recognition. Existing workflow and mobile suites are rerun. Real Just Eat samples should be used to tune wording/layout recognition after the first on-phone trial.
