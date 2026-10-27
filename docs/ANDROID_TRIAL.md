# Android trial 0.1.0

First device-trial build for James's Nothing Phone (2a), Android16. Capacitor8 packages existing screens; a Java foreground service and SQLite database add shift GPS. Targets API36, minimum Android10. This is not a Play Store release.

## Install and migrate

1. Keep the latest web-app JSON backup somewhere safe. Copy the signed APK to the phone and open it. Android may request permission to install from that browser/file manager.
2. Open installed Shift Profit → Settings → Your data → Restore from backup file. Select the backup and confirm replacement. Check History/settings before a real shift.
3. The supplied 27 October backup was privately tested: 2 shifts, 7 deliveries, 2 places and every original field survived import/export, including existing locations. No personal backup is bundled or committed.
4. Enter the Google key privately again for traffic. Keys are excluded from backups. Real Google authentication and screenshot speed in the phone's WebView need testing; desktop mocks do not establish these.
5. Enable Android shift GPS in Settings. Start a shift with the app visible; allow **precise location while using the app** and notifications. The ongoing foreground-service notification allows recording while another app is open or the screen is locked. No permanent all-day location permission is requested.
6. First perform a parked/walking test: start, switch apps/lock, reopen and inspect fix count, then end/save. Verify the notification disappears. Android app permissions & battery opens system settings if battery management interrupts tracking. Reliability must be tested on this phone.

Use one version as the main record keeper: browser and APK do not synchronize. Installing an update with the same signing key preserves APK data; uninstalling deletes it. APK JSON backups use Android's save picker and include native GPS points/events. Cancelling does not claim a backup was saved. Legacy web backups work; tracking is off after restoration.

## Behaviour and limits

- Same minimal workflow: Start shift/odometer → optional screenshot or fee/miles → Confirm → Finish job → End shift/final odometer and actual earnings. No extra routine pickup taps.
- Requests fixes every **10 seconds**, minimum **5 seconds**; actual cadence depends on Android/signal/battery. Fresh fixes reporting accuracy ≤50m are retained. Jumps and long gaps are excluded from mileage. GPS mileage is approximate; final shift costs still use odometers.
- Raw points/events remain in app-private SQLite, without automatic upload. Existing jobs/places remain in WebView local storage. Explicit private JSON exports combine both.
- Expected pickup comes from an independently saved point or a temporary approximate Google route endpoint after traffic lookup. Without a target, routes record but restaurant waiting is not invented. Screenshot text alone cannot locate an unknown venue offline.
- Known targets use a 100m radius, postcode targets 180m, departure hysteresis and two outside readings. Low-speed arrival requires reported accuracy ≤35m. A known-point stop needs one minute to train; an approximate target needs five minutes, at least three samples and ≤35m accuracy throughout. Gaps over two minutes reset the candidate. Uncertain/shorter stops are excluded from learning.
- These are **GPS collection-stop estimates**, including parking/walking, not food-ready times or guaranteed venue identification. Traffic queues, nearby businesses and shared postcodes can confuse detection. Correct inaccurate waits with existing tools. Only one pickup target/stop per job is currently supported.
- Eligible stops link to the job and may create a uniquely named place using reviewed screenshot text and independently measured GPS centroid. Simple arrival/collection timestamps stay unknown. Manual corrections take precedence.
- Until **three independent valid branch observations**, prediction uses Settings' default wait. Afterwards it uses the lifetime mean, deduplicating corrected jobs.
- Google comparison targets expire after six hours, clear on completion/shift end and are excluded from backups. Google route results are not stored as history or used for the OSM heatmap.
- Notification Pause stays paused until Resume. Force-stop, reboot, revoked permissions or battery restrictions can interrupt recording. Reopen to resume. Missing intervals are not fabricated; process-death recovery is best effort.

Review/input only safely parked. Physical Nothing/Android16 screen-lock GPS, battery use, permissions, Android saving, Google authentication and OCR latency remain **device-trial checks**.

## Diagnostics to share after a shift

Settings → Diagnostics → Download diagnostics log saves JSON through Android's picker (browser download on web). Share that file for troubleshooting. Retention is up to seven days within caps of 1,500 browser and 5,000 native events. Clearing logs does not delete deliveries or GPS history.

Logs contain workflow changes, connectivity/visibility, screenshot duration/field-presence counts, traffic status, script error type/location, native service/pause/provider events, aggregated GPS quality, gaps and pickup candidate/eligibility decisions. They exclude coordinates, addresses, screenshots, full OCR text, fees and API keys. Native quality is summarized about once a minute. Logging failures never block core saving. Logs cannot guarantee capture of every crash/OS kill. The separate private backup contains actual records/routes; do not confuse it with diagnostics.

## Build and credentials

Requires Node22+, JDK21, SDK36/Build Tools36.0.0. Set ANDROID_HOME or ignored android/local.properties.

```powershell
npm ci
npm run android:sync
./android/gradlew.bat -p android assembleRelease testReleaseUnitTest lintRelease
```

Release signing requires the ignored private keystore and `private/signing.properties` containing storePassword/keyPassword. Preserve these privately for compatible updates; never upload them. An independent developer must restore the signing material privately or configure a new key, which cannot update this installation in place. Output: `android/app/build/outputs/apk/release/app-release.apk`.

Asset preparation copies a public-file allowlist. Credentials, backups, signing keys and tests do not ship. Source changes require sync/build/install; Pages updates do not replace bundled screens. The bundled HTTPS origin matches the owned GitHub Pages host for browser-key referrer compatibility; no remote server.url or broad navigation allowance exists. Real Google WebView authentication needs verification; do not remove key restrictions to work around failure.

Validation covers Java stop logic, mocked native bridge, web regressions, private backup round-trip, build/lint/signature checks. Emulator launch failed in this desktop environment; no emulator/physical-device pass is claimed. Inherited CLI moderate npm advisories concern iOS/dev tooling (uuid/xcode), outside the Android runtime; dependencies remain pinned.

Sources: [Android location service](https://codelabs.developers.google.com/codelabs/while-in-use-location), [foreground-service restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start), [Capacitor target matrix](https://capacitorjs.com/docs/android/setting-target-sdk), [Google endpoint reference](https://developers.google.com/maps/documentation/javascript/reference/route).
