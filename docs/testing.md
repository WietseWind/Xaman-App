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

### Throwaway runs
`scripts/e2e/run-throwaway.sh ios|android [--debug] [-- ./e2e/03_import_account.feature]`
(or `make test-e2e-throwaway PLATFORM=android ARGS="--debug"`):
- clones the checkout (APFS copy-on-write) to `~/Code/e2e-runs/xaman-e2e-<name>`, without the release keystore;
- creates its own simulator (`Xaman-e2e-<name>`) or starts its own read-only emulator on a free port 5556–5584.
  It never uses emulator-5554 (AVD Xaman_API36) or a USB phone;
- builds and installs fresh. Android builds Release with its release test APK by default; `--debug` runs its own Metro;
- stops a run whose log stays silent for 20 minutes (`E2E_STALL_MINUTES`);
- leaves results in `<clone>/.e2e-artifacts`: `summary.txt`, `cucumber.json`, `rerun.txt`, step screenshots.

### When something goes wrong
- A step fails after 2 minutes unless it sets its own timeout. A step still running after 1 minute leaves a
  `STALLED-…` screenshot.
- After a failed scenario the app is restarted and unlocked, and the run goes on (`DETOX_CONTINUE_ON_FAIL=no`
  stops at the first failure). If the app cannot be restarted twice in a row, or the Android device goes offline,
  the remaining scenarios fail at once.
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

