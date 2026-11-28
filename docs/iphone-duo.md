# iPhone Duo (fold phone)

How the app lays out on the iPhone Duo, why, and how to test it. Issue #544, pull request #549, app 5.5.0.

## The device

The iPhone Duo is a fold phone (iOS 27.1 and later). The app meets five states, and the phone goes from one to
another while the app runs:

| State | App window | Where iOS puts the status items and the tab bar |
|---|---|---|
| Closed (cover screen) | 466 × 678 pt | A column of 84 pt on the right, with the camera hole at its top |
| Open (inner screen), full screen | 951 × 669 pt | The same column on the right |
| Open, split view, app in the left half | 469 × 669 pt | The tab bar is a column on the **left**; the window has no camera column |
| Open, split view, app in the right half | 469 × 669 pt | A column on the right |
| Open, turned a quarter | 669 × 951 pt | No column: the status items are at the top (82 pt), the tab bar is a normal one at the bottom |

The tab bar is the native iOS tab bar (react-native-navigation). On this phone iOS draws it as a vertical bar.

Facts that the code depends on (measured on the iOS 27.2 simulator):

- The window safe area is `right = 84` when the phone is closed or open in full screen. In the left half of a split
  view the window has no side safe area; the tab bar is then in the safe area of the tab's own view (`left = 84`).
- `Dimensions.get('screen')` stays the cover screen (466 × 678), also when the phone is open.
- `UITraitCollection.verticalBarEdge` is 1 (leading) or 2 (trailing) on this phone and 0 on every phone that has no
  vertical bar. It is also 0 on this phone when it is open and turned a quarter.
- Open, the window is far wider than the device screen (951 or 669 against 466). On every other phone the window is
  never wider than the screen.
- A window that has no root view controller (during a reload of the JavaScript side) reports the camera corner as a
  safe area at the top (`top = 82, right = 0`).
- iOS resizes the scene itself. An app cannot ask for one half of the screen: `UIRequiresFullScreen` is ignored and
  the scene has no size restrictions on this phone.

## What the app does

The app keeps **one layout** in every state: the cover screen without the 84 pt column, 382 pt wide and 678 pt
high. That is about the size of an iPhone SE, so every size is one that the app already has.

| State | Result |
|---|---|
| Closed | The column fills the screen left of the 84 pt column |
| Open, full screen | The column is on the right half, beside the tab bar. The left half shows the background |
| Split view, left half | Tab bar on the left, column beside it |
| Split view, right half | Column on the left of the tab bar |
| Open, turned a quarter | A box of 382 × 678 pt in the middle of the window, above the tab bar |

A backdrop is the exception: the dim or blur of an overlay covers the whole window (also the tab bar and the free
part), and the box or panel of the overlay stays in the column.

The boot splash covers the whole window: the launch screen background is the blue of the splash image.

## The free half of the open screen, and the state for JavaScript

Open with the app on the whole inner screen, the left half of the window is free. It has its own component, the
extra panel: `src/components/General/FoldPhoneExtraPanel/FoldPhoneExtraPanel.tsx`. The screen wrapper renders it in
the free part, beside each screen of the app (not beside an overlay: its backdrop covers the whole window), with the
props `width`, `height` (the free part, in points), `side` (`left` on the iPhone Duo) and `screen` (the name of the
screen it is beside). **It renders nothing for now**: the free part shows the background of the app. The names are
general on purpose (`FoldPhone`, `FoldPhoneExtraPanel`): another fold phone can use them when its native side tells
the same values.

The state of the phone is in `src/common/helpers/foldPhone.ts`:

```ts
import { FoldPhone } from '@common/helpers/foldPhone';

FoldPhone.getState();     // { mode, window, app, free? }
FoldPhone.hasFreeArea();  // true in the mode 'open'
const listener = FoldPhone.addListener((state) => { /* opened, closed, split view, turned */ });
listener.remove();
```

`mode` is `cover` (closed), `open` (the whole inner screen), `split` (one half, beside another app), `turned` (open,
turned a quarter) or `none` (every phone that is no fold phone; no listener is ever called there). `app` is the
place of the screens of the app in the window; `free` is the free part and is only there in the mode `open`.

All of this is JavaScript and the native side already sends what it needs. To show something in the free half
later, change `FoldPhoneExtraPanel` (and use `FoldPhone` where code has to follow the state): that can go out with an
over-the-air update, without a new native build.

## Where the code is

| File | Part |
|---|---|
| `ios/Xaman/Libs/Utils/DeviceUtils.m` | Constants `layoutInsets.left/right` and `verticalBarEdge`. `SideSafeAreaView`: a native view that sends its own side safe area, its width and height and the bar edge each time they change |
| `src/common/helpers/device.ts` | `IsFoldPhone` (the bar edge, or a window far wider than the device screen), `GetLayoutInsets` (side insets; the 84 pt column is counted in every state), `GetVerticalBarEdge`, `GetUsableWindowWidth` (tab icon sizes; the centre button is 0.8 of its size on the vertical bar, which is 48 pt wide) |
| `src/theme/sizes.ts` | `AppSizes` takes the size of the layout: width `min(window, screen) − side insets`, height `min(window, screen)` |
| `src/common/helpers/sideSafeArea.tsx` | `withSideSafeArea` wraps every registered screen and puts it in the column (`sideMarginsFor`, `columnStyleFor`). `SideSafeAreaFill` and `sideBleedEdges / sideBleedAbsolute / sideBleedMargin` make a backdrop reach the edges of the window |
| `src/common/helpers/foldPhone.ts` | `FoldPhone`: the state of the phone (mode, window, place of the app, free part) and its change event |
| `src/components/General/FoldPhoneExtraPanel/` | The extra panel: the free part of the open screen, empty for now |
| `src/app.tsx` | Every screen is registered through `withSideSafeArea` |
| `src/common/helpers/glassTabBar.ts` | With the bar on a side, the end of a tab screen only keeps the bottom safe area |
| `ios/LaunchScreen.storyboard` | Background colour = the blue of the splash image |

### A new overlay or a new full-screen backdrop

Screens need nothing: the wrapper puts them in the column. A new **overlay** has to say what its backdrop is:

- A view with a dim colour: put `<SideSafeAreaFill style={{ backgroundColor: … }} />` in it as a child.
- A view that fills its parent with an absolute position and has no children (a dim layer): add `sideBleedEdges` to
  its style.
- A blur or other view with children: `sideBleedAbsolute` (absolute position) or `sideBleedMargin` (normal flow).

On every other phone these render nothing and are `undefined`.

## Other phones: nothing changes

Everything is gated on a side safe area greater than 0. The native side only reports one on the iPhone Duo, and
`IsFoldPhone` only counts the column on iOS when there is a vertical bar or the window is far wider than the screen:

- `AppSizes` is the same to the last number. `src/theme/__tests__/sizes.sideSafeArea.test.ts` holds a copy of the
  5.4.0 formulas and compares every number and every scale function for 11 phones (iPhone SE to Pro Max, Android
  small to tablet), also with odd values from the native side.
- `withSideSafeArea` returns the screen class itself: no wrapper, the same component tree.
- `SideSafeAreaFill` renders nothing and the `sideBleed*` styles are `undefined`.
- The splash image covers the whole screen on every phone in portrait, so the launch screen background is not
  visible there.
- Android sends no side insets and no bar edge.

When you change this code, keep that rule: a phone without a side safe area must take the old path with the old
numbers. Add the phone to the unit test when in doubt.

## How to test

### Unit tests

```bash
npx jest src/theme src/common/helpers/__tests__/sideSafeArea.test.tsx src/common/helpers/__tests__/device.sideInsets.test.ts src/common/helpers/__tests__/glassTabBar.test.ts
```

### On the simulator (Xcode 27.2 or later, device type "iPhone Duo")

The simulator window is the Device Hub app of Xcode. The bar under the device has three buttons: Closed, Partially
Open, Open.

1. Closed: home, the four other tabs, a settings screen, add account, the lock screen, an alert, the account
   switcher. Nothing is under the column on the right; the pin pad is inside the screen.
2. Press **Open** while the app runs: the same column goes to the right half. Press **Closed**: back. The app keeps
   its screen and does not restart. Open, turn the device a quarter (Controls → Rotate Right): the app is a box in
   the middle of the window; Rotate Left: back.
3. Open, then go to the home screen of iOS → App Library → hold the Xaman icon → **Open in Split View**: Xaman is in
   the left half, with the tab bar on the left. Open another app this way and choose Xaman in the right half: the
   tab bar is on the right.
4. Stop the app and start it in each state (closed, open, turned): the layout is the same as when it gets there on
   the fly.
5. A fresh install: onboarding and the set-up screens in each state. Then the lock screen, the action sheet of the
   centre tab button and the account switcher in each state.

**Simulator fault, not an app fault:** at "Zoom to Fit" and other scaled zoom levels the Device Hub window does not
pass mouse clicks in the lowest 84 pt of the cover screen (the Settings tab, low buttons). Use **View → Physical
Size**. Touches from the system itself (XCUITest, WebDriverAgent) reach the app in every zoom.

### Regular phones

The whole e2e suite on a regular iPhone simulator and on Android, and the pixel comparison of the same screens with
the build before the change on an iPhone SE and a Pro Max simulator (`scripts/e2e/compare-screens.py`; both are in
`docs/testing.md`).

## Known limits

- Not checked on a real iPhone Duo; all of this is from the simulator of iOS 27.2.
- A cold start and a reload of the JavaScript side while the app is in a split view were not tested. The values
  from the native view put the column right after the first frame.
- The height in `AppSizes` is the one of the state the app started in (678 closed or turned, 669 open).
- Open and turned a quarter, the app is a box of the cover layout and does not use the rest of the window. A split
  view in that position (windows narrower than the layout) was not tested.
- The faint background pattern of some screens (add account, scan, empty states) stops at the column.
- The width of the column (84 pt) is a constant in `device.ts`. The live safe area is used when the view has one.
