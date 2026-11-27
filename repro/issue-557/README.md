# Android fold evidence — issue #557

These are unedited native screenshots from a task-only Android 16 fold emulator. The account is a new, unfunded
test account. No secret, PIN or physical-device data is included.

Baseline: `68a7e821cf2e77a65115e4e3c36f5507034d4d4a`, app 5.5.0 (554), actual Android APK and its frozen JavaScript.
The narrow profile has a real separate 884 × 2208 px cover display and 1768 × 2208 px inner display at density 2.625.
Split screenshots use the system's Recents → Split action beside Android Settings; they are not image crops or
forced app bounds. See [the device limits](../../docs/android-fold.md).

| Before | Observed result |
|---|---|
| [Cover Home](before-cover-home.png) | Existing phone layout fits the cover |
| [Cold inner Home](before-cold-inner-home.png) | Content stretches over the inner display |
| [Right split Home](before-split-right-home.png) | Android letterboxes the app, with a system expand control |

The baseline account-creation flow, PIN lock/unlock, five tab controls, keyboard, sheets and camera-permission
return path were exercised with native taps. The account remained saved after a cold start and split transitions.
The fixed-app matrix and final artifact checks are pending. This document does not claim a completed regression
check or a Samsung hardware test.
