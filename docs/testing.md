# Testing

## Unit tests
`make test` runs the unit test suite.

Our tests are written using [Jest](https://facebook.github.io/jest/).

To write a test, place a Javascript file with the `.test.ts` suffix in the
`__tests__` directory inside of any subfolder of `/src`. The test will be
automatically picked up by the test runner.

## End to End tests
The e2e suite uses [Detox](https://github.com/wix/Detox) with [Cucumber](https://github.com/cucumber/cucumber-js):
features in `e2e/*.feature`, steps in `e2e/step_definitions`, hooks in `e2e/support`. It drives the real
Xaman backend and the Xahau testnet, so it needs internet.

### The whole suite, the same way every time
`scripts/e2e/run-suite.sh` runs the suite on iOS Release and then on Android Release, each on its own throwaway
clone and its own new simulator or emulator, and writes one outcome for the round:

```bash
E2E_AVD=<avd name> E2E_IOS_RUNTIME=com.apple.CoreSimulator.SimRuntime.iOS-26-5 scripts/e2e/run-suite.sh --name my-round
```

`--only ios|android` runs one platform, `--rounds 3` runs everything three times to show that the result repeats,
`-- e2e/01_setup.feature e2e/02_generate_account.feature` runs some features (a feature needs the ones before it
that it builds on: at least 01 and 02). The round's outcome is in `~/Code/e2e-runs/results/<name>/outcome.txt`.

### Throwaway runs
`scripts/e2e/run-throwaway.sh ios|android [--debug] [--cleanup] [-- ./e2e/03_import_account.feature]`
(or `make test-e2e-throwaway PLATFORM=android ARGS="--debug"`) is one run on one platform:
- clones the checkout (APFS copy-on-write) to `~/Code/e2e-runs/clones.noindex/xaman-e2e-<name>`, without the
  release keystore. The `.noindex` folder keeps Spotlight (and Time Machine) away from the clones: indexing each
  new clone loaded the machine for the whole run;
- creates its own simulator (`Xaman-e2e-<name>`) or starts its own read-only emulator on a free port 5556–5584.
  It never uses emulator-5554 (AVD Xaman_API36) or a USB phone;
- builds and installs fresh. Android builds Release with its release test APK by default; `--debug` runs its own Metro;
- waits when another run is going on the same machine: two runs next to each other make both slow and change
  their timing (`E2E_PARALLEL=yes` runs anyway);
- starts the tests on a quiet machine: it waits until the CPU is mostly idle for half a minute
  (`E2E_QUIET_MAX_SECONDS`, default 600). A simulator that just booted for the first time keeps the whole machine
  busy for minutes, and the app is then several times slower;
- stops a run whose log stays silent for 20 minutes (`E2E_STALL_MINUTES`);
- leaves everything in `<clone>/.e2e-artifacts` and copies what is worth keeping to
  `~/Code/e2e-runs/results/<name>/`, so the clone can be deleted (`--cleanup` does that, with the simulator).

### What a run does about a failure
A failure that comes from timing must not need a person. In this order:
1. **Android, a tap that did not arrive.** A tap is an injected touch and now and then one is lost. The step after a
   tap knows what the screen looked like before it: when the screen it waits for stays away and nothing changed for
   8 seconds, a Next, Back or tab tap is sent once more. A button that signs, submits, confirms or toggles is never
   tapped twice (`e2e/helpers/androidTapCheck.js`).
   Before a tap the on-screen keyboard has to be gone when it covers the target. "Is it up" is read from `dumpsys`
   and from the UI dump, because one of the two was wrong in full runs. Escape normally closes it; when Escape does
   nothing, the keyboard's own Done key is tapped. When nothing closes it, the step fails with that reason: a tap is
   never sent onto a keyboard (it would hit a key, which is how a Next tap got lost).
2. **A second attempt.** A failed scenario is tried once more at once, after the app is restarted (`E2E_RETRY`,
   default 1).
3. **A rerun of the story.** When a scenario still failed, the features are run once more from the first one on a
   clean app (iOS: an erased simulator), up to the last feature with a failure (`E2E_RERUN_FAILED=no` turns it off).
   The suite is one story, so one failure usually takes the scenarios that build on it with it.

`outcome.txt` says how the run went, with the code, device, Node version and machine load it ran on:

| Result | Meaning |
|---|---|
| `passed` | every scenario passed at its first attempt |
| `passed, with scenarios that needed a second attempt` | they are listed; look at why |
| `passed on the rerun (failed in the first run)` | the first run's failures are listed; look at why |
| `failed` / `failed (also in the rerun)` | a real failure |

The exit code is 0 for the first three, so read the outcome and not only the code. What helped is written down:
`tap-checks.txt` (taps sent a second time), `text-entry-fallbacks.txt` (text that needed another route),
`tap-effects.tsv` (how long each tap took to show). Every failed attempt leaves a folder in `failures/` with the
error, the screenshots of the last steps and, on Android, the UI dump, the last taps, keyboard and focus state and
the device log.

To prove the recovery itself, faults can be injected (`e2e/helpers/faultInjection.js`): `E2E_DROP_TAP` withholds
taps, `E2E_FAIL_SCENARIO` fails a scenario once, for a whole run, or always, and `E2E_KEEP_KEYBOARD`,
`E2E_IME_DUMPSYS_BLIND` and `E2E_IME_ESCAPE_DEAD` together make the keyboard fault of the full runs. Never for a run
whose result counts.

### When something goes wrong
- A step fails after 2 minutes unless it sets its own timeout. A step still running after 1 minute leaves a
  `STALLED-…` screenshot.
- After a failed scenario the app is restarted and unlocked, and the run goes on (`DETOX_CONTINUE_ON_FAIL=no`
  stops at the first failure). If the app cannot be restarted twice in a row, the Android device goes offline, or
  the set-up (feature 01) failed, the remaining scenarios are not run.
- Preflight before Detox starts: network, a booted simulator, and an Android emulator that is online, booted and
  on a port adb tracks (with a warning under 4 GB RAM).

### Environment
| Variable | Meaning |
|---|---|
| `DETOX_CONFIGURATION` | `ios.e2e+xaman.ios`, `android.e2e+xaman.android.arm64` (Release) or `android.e2e+xaman.android.debug.arm64` (Debug + Metro) |
| `ANDROID_SERIAL` | the emulator to use. Android configs match only this serial, and every adb call in the helpers uses it |
| `E2E_IOS_SIMULATOR` | simulator name for `ios.e2e` (default `Xaman-e2e`) |
| `DETOX_REINSTALL=yes` | install the freshly built app first |
| `DETOX_REUSE=yes` | keep the installed app and its state (split runs). After feature 05 also set `E2E_PASSCODE=958347` |
| `E2E_ARTIFACTS_DIR` | screenshots and logs (default `e2e/artifacts`) |
| `E2E_CRED_FILE` | faucet account file (default: one per artifacts directory, in the temp directory) |
| `E2E_RETRY` | attempts after the first for a failed scenario (default 1) |
| `E2E_RERUN_FAILED=no` | no rerun of the story after a failed run |
| `E2E_TAP_REPEAT=no`, `E2E_TAP_CHECK=no` | Android: never send a tap twice / do not look at the screen around taps |
| `E2E_PARALLEL=yes` | do not wait for another run on this machine |

### Android Release builds
`./gradlew app:assembleRelease app:assembleAndroidTest -DtestBuildType=release` builds the release app and its
test APK. `-DtestBuildType=release` adds Detox's app rules and `android/app/proguard-e2e.pro` to R8. Store builds
never set it, so their R8 rules and output are unchanged.

## Type checking with TypeScript
Use [Typescript](https://www.typescriptlang.org/) to find and prevent type related issues.

## Linting
`make check-style` checks the codebase against our linting rules. We're using
the AirBnB [ES6](https://github.com/airbnb/javascript) and [React](https://github.com/airbnb/javascript/tree/master/react) style guides.


## Cosoms

- Run cosmos server
```bash
npm run cosmos
```

- Uncomment following line in `<rootDir>/index.js`
```js
import './.cosmos/cosmos.app';
```

- Comment out all other lines and Start your application again

