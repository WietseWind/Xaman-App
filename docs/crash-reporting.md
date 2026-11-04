# Crash reporting (Firebase Crashlytics)

All JS reporting goes through `src/common/libs/crash` (`CrashReporter`). Nothing else may call
`@react-native-firebase/crashlytics` directly.

## Secrets never leave the device

Every message, stack, breadcrumb, custom key and Analytics param is scrubbed by
`src/common/libs/crash/scrub.ts` before it is sent. (Crashlytics shows recent Analytics events in a
report, so Analytics params count too.) The scrubber redacts:

| What | Rule |
|---|---|
| Private and public keys, hashes, encryption keys | hex runs of 32+ characters |
| Family seeds (`s…`, `sEd…`), base58 public keys | XRPL base58 tokens with a valid checksum, or 25+ random-looking base58 characters |
| Secret numbers, passcode | two or more 6-digit groups, any lone 6-digit number (also after `:` or `.`; the fraction of a decimal like `1.123456` is kept), 24+ digits |
| Mnemonics | runs of 12+ words of 3–8 letters, in any case and with any common separator |
| Tokens and passwords | values of `token`, `secret`, `password`, `passcode`, `passphrase`, `pin`, `seed`, `mnemonic`, `privateKey`, `authorization`… keys; Analytics params and custom keys with such names are redacted whole; `Bearer`/`Basic` credentials; JWTs; long random base64 |
| URLs | query string and fragment |

Addresses (r… and X-addresses) are public and kept. Percent-encoded text is decoded first. The
rules prefer false positives: a lost detail is cheap, a leaked key is not. Frame lines of a JS stack
keep their line and column numbers (symbolication needs them). Their function and file names are
scrubbed like any other text: a frame-shaped line can come from an error message or from a stack
set by code.

`src/common/libs/crash/install.ts` is the first import in `index.js`. In release builds it installs
the outermost global error handler, which scrubs an uncaught error **in place** before React Native
Firebase, React Native or the native crash handler see it. The native crash
(`RCTFatalException` / `JavascriptException`) therefore carries the scrubbed message too.
`firebase.json` turns off RNFB's own JS error reporting, so each error is recorded once, by us.

Rules for code:

- Report with `LoggerService.recordError(context, error)` or `CrashReporter.recordError(error, context)`.
  `context` is constant text that names the place, never data.
- Breadcrumbs (`CrashReporter.breadcrumb`) take names, types and states only: screen names, a
  detected link or scan **type**, a network **key**. Never a URL, a scanned value, a push payload,
  React Native Navigation events (they carry `passProps`) or an account object.
- Never call `setUserId`.

## What a report contains

- **Uncaught JS errors**, recorded as fatal, plus **unhandled promise rejections** (Hermes; the
  RNFB tracker hooks a Promise that Hermes doesn't use, so these were lost before).
- **Handled errors** from `LoggerService.recordError` / `logError`, recorded as non-fatals. These
  include signing, Tangem, account add, migration and purchase failures. User cancellations are
  skipped, and each issue is recorded once per session.
- **Issue names that stay stable** across builds and devices, for example
  `Unexpected error in sign process [PIN]: TypeError: Cannot read property '<n>' of undefined @ signWithPrivateKey`.
  Numbers, ids and offsets are normalized out, so one bug stays one issue.
- **Breadcrumbs (Logs tab):**
  - boot steps;
  - screens, modals and overlays;
  - app state, lock state;
  - network switch, connect and close;
  - link, scan and push types;
  - signing start and done;
  - `logger.error` messages.
- **Keys:** `screen`, `modal`, `overlay`, `app_state`, `network`, `network_id`, `developer_mode`,
  `locale`, `theme`.

Every uncaught JS crash also shows up as one shared native issue, `RCTFatalException: Unhandled JS
Exception` (iOS) or `JavascriptException` (Android). That is React Native terminating the app after
the JS report. The JS issue has the details.

## Symbolicating a JS stack

Release builds run Hermes bytecode, so JS frames look like `main.jsbundle:1:123456`. Crashlytics
can't use JS source maps, so every release build archives its own **outside the repo**, with
`scripts/archive-sourcemap.sh` (called by the Xcode bundle phase for Release, and after
`createBundleReleaseJsAndAssets` on Android):

```text
~/xaman-sourcemaps/                      (or $XAMAN_SOURCEMAPS_DIR)
  ios/5.4.0-457/20261104-201530-56b4a9ebd1/
    main.jsbundle.map.gz
    build-info.json                      platform, version, build, commit, dirty, time, host
  android/5.4.0-457/20261104-202212-56b4a9ebd1/
    index.android.bundle.map.gz
    build-info.json
```

Every build gets its own folder (UTC time, commit, `-dirty` for uncommitted changes), so nothing is
ever overwritten, also when the same version and build is built again. A release build fails when
its map can't be archived. **Back this folder up**: without the exact map of a shipped build, its
offsets can't be resolved. To symbolicate, paste the frames from the Crashlytics event (on the
machine that built it, or after copying the folder):

```bash
node scripts/symbolicate-crash.js ios 5.4.0-457 < stack.txt
```

If that version and build was built more than once, the script uses the newest build and lists the
others; pick one with `--map <path to .map.gz>`.

```text
    at onPress (address at main.jsbundle:1:123456)
→   at onPress (address at src/screens/Home/HomeView.tsx:720:12 [HomeView#onPress])
```

## Native symbols

- **iOS:** the `[RNFB] Crashlytics Configuration` phase uploads the app dSYM. `Copy vendor dSYMs`
  adds the Hermes and Veriff dSYMs from `ios/vendor-dSYMs/`, which exists only on the build machine.
- **Android:** release builds upload NDK symbols (`uploadCrashlyticsSymbolFileRelease`) unless built
  on CI or with `-PskipCrashlyticsSymbols`. Only libraries built from source are unstripped (e.g.
  VisionCamera). The React Native and Hermes AARs in `android/app/libs/` ship stripped, so their
  frames stay unsymbolicated. To change that, keep the unstripped `.so` files from the same React
  Native build that produced the AARs, and point `unstrippedNativeLibsDir` at them too.
