# e2e on a physical iPhone

Detox drives iOS simulators only. For an iPhone on USB the same feature files and steps run through
[WebDriverAgent](https://github.com/appium/WebDriverAgent) (WDA), the XCUITest server of the Appium
project.

| File | What it is |
|---|---|
| `register.js` | Loaded first by cucumber for a phone run. From then on `require('detox')` gives `detox.js`. |
| `detox.js` | The part of the Detox API that the steps use, sent to WDA. |
| `wda.js` | The HTTP client for WDA. |
| `aliases.js` | Test IDs that a phone does not show on their own, and the group that stands in for each. |

A simulator or Android run never loads these files.

## Run

```bash
scripts/e2e/run-throwaway.sh ios --device <UDID> --app <signed Xaman.ipa or .app>
```

- Xaman on the phone is replaced by that build and its data is deleted.
- Nothing is built for a phone. The build must be signed with a profile that includes the phone
  (an ad hoc export of a store archive, or a development build).
- The phone: on USB, unlocked, trusted, Developer Mode on, iOS 17 or later (Xcode needs its
  developer services; an iOS 16 phone can not be driven from a current Xcode).

## WebDriverAgent, once per phone

In `$E2E_WDA_DIR` (default `$E2E_WORK/wda`), in a Terminal window of the desktop session (signing
needs the unlocked login keychain):

```bash
npm pack appium-webdriveragent && tar xzf appium-webdriveragent-*.tgz
xcodebuild build-for-testing -project package/WebDriverAgent.xcodeproj -scheme WebDriverAgentRunner \
  -destination "id=<UDID>" -derivedDataPath dd \
  DEVELOPMENT_TEAM=<team id> CODE_SIGN_STYLE=Automatic PRODUCT_BUNDLE_IDENTIFIER=<a bundle id of the team> \
  -allowProvisioningUpdates
```

The runner starts it on the phone for a run and stops it afterwards.

## What is different on a phone

WDA sees the accessibility tree, the same that VoiceOver uses. Detox sees every view.

- A group that is one accessible element (a button with its texts, a token row, a row of secret
  numbers, a mnemonic word row) hides the test IDs inside it. `aliases.js` names the group for an
  inner ID; a few steps have a branch for a phone (`process.env.E2E_IOS_DEVICE`).
- Text is typed with the keyboard of the phone, slowly (8 keys a second, a pause after the first
  character) and read back where the field shows it. Faster typing lost characters.
- A real phone asks things a simulator does not: biometrics and notifications in the set-up.
- Skipped on a phone, and reported as skipped:
  - the camera permission cases (iOS has no way to take back the camera answer of one app from
    outside the phone);
  - the scenarios that end the process of an xApp page.
- The keychain outlives the app. The app starts its set-up again on a fresh install all the same.
