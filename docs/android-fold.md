# Android fold layout

Issue [#557](https://github.com/WietseWind/Xaman-App/issues/557) follows the one-phone-layout decision in
[iPhone Duo #544](https://github.com/WietseWind/Xaman-App/issues/544). Android keeps its own system insets and
horizontal native tab bar; it does not use the Duo's side-bar dimensions.

## Layout contract

The new native build permits window resizing. A positive public hinge-sensor feature or sensor, on Android 11
or later, enables the fold layout. A model name or a screen aspect ratio does not identify a fold.
Devices without that capability keep their portrait policy and ordinary full-screen size formulas.

### Portrait policy

Source `2b72e6055` requests portrait on Android folds, including the unfolded display. `LaunchActivity` no longer
unlocks fold rotation; navigator defaults and early fold overlays use the same portrait request. Resizable iPad
windows retain their existing rotation policy. The intended fullscreen result is a display whose longer side is
the height. This requires actual native verification; setting the request alone is not evidence of that result.

Two API 34 properties are declared at application level, the scope documented by
[WindowManager](https://developer.android.com/reference/android/view/WindowManager#PROPERTY_COMPAT_ALLOW_ORIENTATION_OVERRIDE):
`PROPERTY_COMPAT_ALLOW_ORIENTATION_OVERRIDE=false` and
`PROPERTY_COMPAT_ALLOW_DISPLAY_ORIENTATION_OVERRIDE=false`. They opt out of OEM compatibility treatments that
replace an Activity's requested orientation or keep a fullscreen display in its natural landscape orientation.
Each Activity retains its own orientation request; these properties do not separately request portrait for SDK
Activities.

The existing application-level `PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY=true` remains the temporary API 36
compatibility opt-out. It does not guarantee physical display rotation. Android can letterbox a portrait Activity
within another display orientation, and a split-screen Activity cannot choose the overall display orientation.
See the [Activity orientation contract](https://developer.android.com/guide/topics/manifest/activity-element#screen)
and [Android 16 restrictions](https://developer.android.com/develop/adaptive-apps/guides/app-orientation-aspect-ratio-resizability).
When targeting API 37, the API 36 opt-out no longer preserves these restrictions on displays of at least sw600dp.

The stock API 36 Pixel Fold control demonstrates the limit: the portrait request leaves the display at
2208 × 1840 with a 1380 × 1840 portrait Activity letterbox. A real sensor quarter-turn changes both display and
fullscreen Activity to 1840 × 2208. This is a portrait request with a verified physical-turn result; it is not an
automatic display-rotation guarantee. No device compatibility setting was changed to obtain the result.
Android documents no app property equivalent for
[`OVERRIDE_RESPECT_REQUESTED_ORIENTATION`](https://developer.android.com/guide/practices/device-compatibility-mode#override_respect_requested_orientation),
which is separate from the two OEM opt-outs above.

The layout still reads real window, display, inset and input bounds. It does not swap measured width and height,
rotate the content tree, or invent portrait coordinates when Android supplies another window shape. Keyboard and
touch geometry must continue to match the actual window, including split mode.

This is not universal Galaxy Fold identification. Early Samsung Galaxy Fold, Z Fold2 and Z Flip devices can use
proprietary hinge interfaces instead of the standard sensor, as documented in
[Chromium's device gate](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/base/android/java/src/org/chromium/base/DeviceInfo.java).
An OS upgrade alone does not prove that the standard feature exists. These devices retain the compatibility path;
the emulator results do not establish support for them. On the target Galaxy hardware, check the public feature
and sensor and repeat cold-inner start before treating this issue as fully verified for that model.

Android's public display APIs do not reliably expose an inactive cover display. The first active display mode
therefore supplies a stable phone model for the app process: its natural width in dp, halved when at least
600 dp wide, and its longer physical dimension in dp. This is a layout policy, not a claim to measure an unseen
cover display. It can differ from the physical cover width on other fold models. The native process retains the
model across Activity recreation and JavaScript reload.

The Activity's `attachBaseContext` configuration override changes only font scale and locale. Copying the complete
startup configuration also pins screen size, orientation and window bounds. In the native control, the real decor
and Application reached portrait and then the inner display while the Activity still reported the original
landscape window. A fresh
[Configuration delta](https://developer.android.com/reference/android/content/res/Configuration#Configuration())
leaves those fields undefined so Android can update them. The existing font-scale and English-locale policies
remain intact; no extra window polling or React Native cache patch is added.

Every registered screen stays mounted in one phone column. The column is on the right of the current app window;
it fits down when the window is smaller. The native bottom-tab container follows that same visible width and
keeps its existing height and navigation insets. The free area uses the existing empty `FoldPhoneExtraPanel`.
Modal and overlay backdrops cover the whole app window; their content stays in the phone column.

The requested full-width, full-height layout inside either true Android split pane is still pending separate
geometry work. The current fixed-column split screenshots do not prove that request. Fullscreen use of a wide
inner display keeps the phone column; split mode must eventually fill its available pane without stretching
text or controls, with the bottom controls and sheets following the same pane.

Android blur backdrops are bounded to that window. An adaptive native layout flag preserves Yoga's positions
instead of letting Android's `FrameLayout` replace them. Controls remain descendants of the blur view, so the
native blur capture excludes them instead of drawing a blurred copy behind the controls. The blur cancels the
column scale so its bitmap samples the visible window at its actual size; its React content keeps the column
scale. The large iOS backdrop bleed does not become an Android bitmap. Ordinary full-size phone and iOS blur trees
retain the existing path; the native Android layout flag defaults to the original behaviour.

New Android builds also wrap ordinary phone screens so a later split-screen entry can resize without replacing
the screen. At full size those transparent views retain the existing sizes. A cold start or JavaScript reload in
ordinary split mode receives a full portrait-display size hint, so returning to full size does not retain the
small startup window. This hint does not identify a fold or enable rotation. Pixel rounding uses the native pixel
grid, including float values received through `onLayout`. Old Android native builds and all iOS builds keep their
existing registration path. This feature needs a new Android binary; JavaScript alone cannot enable it.

The native tab width follows the current global window. A detached stack screen cannot publish its stale local
view width. If the visible column is narrower than the native menu's minimum item widths, the menu fits uniformly
inside it; all five native click targets remain present. Its container height and system navigation inset remain
under the existing native layout policy.

Adaptive Android forms use a new, read-only keyboard geometry query. It reads the current window and IME
insets, with the showing popup's visible frame as a fallback. It does not change the existing keyboard height
events or their cached maximum. Native input origins are physical coordinates; input heights and scroll offsets
are logical values. The adaptive path converts the overlap with the column scale once. It rechecks focus,
layout and scale changes, and rejects late work after hide or unmount. Standard Android keyboard events cover
cases where the old popup emitter misses a change. The ordinary full-screen and iOS scroll formula stays intact;
an unavailable native method keeps the existing custom-event fallback.

Android's standard keyboard Show event can arrive before its final IME inset. In the native test it reported
Show with a negative height, then the current keyboard top changed from 383 dp to 122 dp on the next frame without
another Show event. The old popup can also disappear during split mode while JavaScript listeners remain.
Adaptive work therefore leases an independent observer on the current Activity decor. Its own global-layout,
pre-draw and attachment listeners emit only changed geometry; they do not replace RNN's inset callbacks, request
frames or use a timer. Consumers requery the current window. Hide, context loss, close and unmount release the
lease; pause/destroy detach the native listeners. The popup measurement/event protocol and its event timing remain unchanged.

The existing zero-width keyboard-height popup is marked [non-touchable](https://developer.android.com/reference/android/widget/PopupWindow#setTouchable(boolean)).
It measures the window and never receives app input. The native split test found that its old window disappeared
after the first Cancel tap while no React Native touch event arrived; the unchanged baseline showed the same
capture pattern. Its focus, modal and input-method settings, height maximum, 100 ms event timer and cleanup stay
unchanged. Native first-tap and keyboard checks validate this input policy separately from the geometry helpers.

A scaled short form can also have too little scroll range even with the correct keyboard top. Its adaptive
padding reserves the measured part of the scroll viewport behind the keyboard, caller clearance and one physical
pixel for rounding. It reserves that range even when Name already fits, so the user can scroll to a lower
field with the same keyboard open. A visible input does not trigger an automatic scroll or shrink a range already
used by the user. Hide clears the owned padding target. This needs no content-height cache and preserves the
existing scroll animation. The ordinary full-screen and iOS formulas remain on their legacy path.

A form first opened in split mode can later return to full size without a remount. New Android native builds
therefore select the current window height after the legacy field measurements complete. A stale split height
must not scroll a field that already fits above the keyboard. The arithmetic and timers stay unchanged; iOS and
old native builds retain their captured-height path. Invalid live dimensions also retain that fallback.

The native tab background also follows live theme changes after resize. It updates an opaque child background
only when its opaque parent differs, and refreshes native items only when their default color differs. Repeated
layout calls, transparent backgrounds and startup defaults do not trigger another item refresh.

`FoldPhone` modes describe layout geometry, not a raw hinge posture. A rotated Android window with a right-aligned
full-height column can still be `open`; the Duo's `turned` state describes its vertically centred box.

## Source and checks

| File | Responsibility |
|---|---|
| `AndroidWindowLayout.java` | Public hardware gate and process-stable model |
| `AndroidWindowLayoutMath.java` | Model and native column geometry |
| `LaunchActivity.java` | Fold portrait request and native tab placement |
| `DeviceUtilsModule.java` | Capability/model constants and validated UI-thread width update |
| `androidWindow.ts` | Pixel-aligned fit and native capability checks |
| `androidWindowLayout.tsx` | Live window updates, stable screen instance and free panel |
| `KeyboardProvider.java` | Non-interactive legacy height observer; its measurement/event protocol stays intact |
| `KeyboardWindowGeometry.java`, `KeyboardModule.java` | Current keyboard coordinates without changing the old event protocol |
| `KeyboardWindowGeometryObserver.java`, `androidKeyboardGeometry.ts` | Owned frame listener and shared leases while adaptive keyboard work is active |
| `KeyboardAwareScrollView.tsx` | Focused-field visibility in a scaled Android column |
| `adaptiveOverlayKeyboard.ts` | Current keyboard coordinates, total overlay displacement and stale-request guards |
| `ActionPanel.tsx` | Read-only current displacement for a resize during its existing spring |
| `sideSafeArea.tsx` | Android dispatch and full-window backdrops |
| `sizes.ts`, `device.ts` | One fold width shared by screen sizes and tab icons |

The focused Jest checks cover sizes, ordinary-device formulas, native compatibility, transformed geometry,
screen/input retention, listener cleanup and native-width deduplication. The native JVM harness compiles the real
production helpers and bridge/tab-placement methods against public-API and view doubles; it does not run Android's
layout engine. Real emulator screenshots, native bounds and actual taps are required in addition to these tests.

## Manual test matrix

| State or flow | Check |
|---|---|
| Stock fold, actual fullscreen inner display | Cold start unfolded, then turn the device; record display rotation, display bounds and app window bounds. Verify the longer physical display side is the height, rather than accepting a portrait letterbox inside a landscape display |
| Portrait cold/live transitions | Cold start on the cover and inner display; fold/unfold while Home, a stack screen and an overlay are open. Confirm the actual fullscreen portrait result and retained account, screen and draft |
| Fullscreen password keyboard | Open the empty production password overlay with safe synthetic props where necessary; focus the field, verify real IME visibility, hide it with Back, then Cancel. Record entry scope and confirm no authentication/signing action |
| Cold start on cover, inner, each split side | Phone content, last row, native tabs and navigation area fit |
| Fold, unfold, turn and resize while running | Account, current screen, input and PIN state remain correct |
| Onboarding and account creation | Buttons, PIN entry/repeat, keyboard and secret-confirmation flow work |
| Home, Events, xApps, Settings and centre button | Native tab targets match the visible column |
| Network/account sheets and warning dialogs | Full-window backdrop; content and Cancel/Back remain usable |
| Camera permission, pause/resume and Close | Permission path returns to a usable scanner/Home |
| Regular Android phone | Compare the same screens and controls before and after |
| Large text, three-button navigation and keyboard | Controls remain reachable; system insets occur once |
| Add Contact: full size → split, and form first opened in split | Bottom tag remains above the real keyboard; Name → tag works with the same open keyboard; Cancel saves nothing |
| Destination-tag sheet in split | Focused input is above the real keyboard; Cancel returns to the underlying screen |
| Light → Dark → Light after unfold | Native tabs and labels remain readable without a restart |

These portrait checks define acceptance for source `2b72e6055`; recorded build and native results are in
`repro/issue-557/validation.json`. Distinguish a physical quarter-turn from an automatic app-forced display turn,
and record split behavior separately. Full-pane split acceptance remains pending the geometry change above.

The test emulator uses Android's stock Pixel Fold display/state mechanism, with separate cover and inner displays.
One task-only profile has a narrow cover (884 × 2208 px) and an inner display (1768 × 2208 px). Its vendor hinge
overlay still has the stock Pixel Fold position. This proves app-window behaviour on an Android fold emulator;
it does not prove Samsung One UI, physical hinge placement, camera hardware or NFC behaviour. A Galaxy Fold
hardware check remains necessary before a device-specific release claim.

See `repro/issue-557/README.md` for the captured evidence and the exact tested revision.
