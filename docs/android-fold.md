# Android fold layout

Issue [#557](https://github.com/WietseWind/Xaman-App/issues/557) follows the one-phone-layout decision in
[iPhone Duo #544](https://github.com/WietseWind/Xaman-App/issues/544). Android keeps its own system insets and
horizontal native tab bar; it does not use the Duo's side-bar dimensions.

## Layout contract

The new native build permits window resizing. A positive public hinge-sensor feature or sensor, on Android 11
or later, enables the fold layout and rotation. A model name or a screen aspect ratio does not identify a fold.
Devices without that capability keep their portrait policy and existing size formulas.

Android's public display APIs do not reliably expose an inactive cover display. The first active display mode
therefore supplies a stable phone model for the app process: its natural width in dp, halved when at least
600 dp wide, and its longer physical dimension in dp. This is a layout policy, not a claim to measure an unseen
cover display. It can differ from the physical cover width on other fold models. The native process retains the
model across Activity recreation and JavaScript reload.

Every registered screen stays mounted in one phone column. The column is on the right of the current app window;
it fits down when the window is smaller. The native bottom-tab container follows that same visible width and
keeps its existing height and navigation insets. The free area uses the existing empty `FoldPhoneExtraPanel`.
Modal and overlay backdrops cover the whole app window; their content stays in the phone column.

Android blur backdrops are bounded to that window. Their native blur view is a sibling of the React controls,
since Android's `FrameLayout` otherwise replaces the child positions assigned by Yoga. The blur cancels the
column scale so its native bitmap samples the visible window at its actual size. The large iOS backdrop bleed
does not become an Android bitmap. Ordinary full-size phone and iOS blur trees retain the existing path.

New Android builds also wrap ordinary phone screens so a later split-screen entry can resize without replacing
the screen. At full size those transparent views retain the existing sizes. Pixel rounding uses the native pixel
grid, including float values received through `onLayout`. Old Android native builds and all iOS builds keep their
existing registration path. This feature needs a new Android binary; JavaScript alone cannot enable it.

## Source and checks

| File | Responsibility |
|---|---|
| `AndroidWindowLayout.java` | Public hardware gate and process-stable model |
| `AndroidWindowLayoutMath.java` | Model and native column geometry |
| `LaunchActivity.java` | Fold rotation policy and native tab placement |
| `DeviceUtilsModule.java` | Capability/model constants and validated UI-thread width update |
| `androidWindow.ts` | Pixel-aligned fit and native capability checks |
| `androidWindowLayout.tsx` | Live window updates, stable screen instance and free panel |
| `sideSafeArea.tsx` | Android dispatch and full-window backdrops |
| `sizes.ts`, `device.ts` | One fold width shared by screen sizes and tab icons |

The focused Jest checks cover sizes, ordinary-device formulas, native compatibility, transformed geometry,
screen/input retention, listener cleanup and native-width deduplication. The native JVM harness compiles the real
production helpers and bridge/tab-placement methods against public-API and view doubles; it does not run Android's
layout engine. Real emulator screenshots, native bounds and actual taps are required in addition to these tests.

## Manual test matrix

| State or flow | Check |
|---|---|
| Cold start on cover, inner, each split side | Phone content, last row, native tabs and navigation area fit |
| Fold, unfold, turn and resize while running | Account, current screen, input and PIN state remain correct |
| Onboarding and account creation | Buttons, PIN entry/repeat, keyboard and secret-confirmation flow work |
| Home, Events, xApps, Settings and centre button | Native tab targets match the visible column |
| Network/account sheets and warning dialogs | Full-window backdrop; content and Cancel/Back remain usable |
| Camera permission, pause/resume and Close | Permission path returns to a usable scanner/Home |
| Regular Android phone | Compare the same screens and controls before and after |
| Large text, three-button navigation and keyboard | Controls remain reachable; system insets occur once |

The test emulator uses Android's stock Pixel Fold display/state mechanism, with separate cover and inner displays.
One task-only profile has a narrow cover (884 × 2208 px) and an inner display (1768 × 2208 px). Its vendor hinge
overlay still has the stock Pixel Fold position. This proves app-window behaviour on an Android fold emulator;
it does not prove Samsung One UI, physical hinge placement, camera hardware or NFC behaviour. A Galaxy Fold
hardware check remains necessary before a device-specific release claim.

See `repro/issue-557/README.md` for the captured evidence and the exact tested revision.
