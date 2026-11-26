# iPad

How the app behaves on an iPad, why, and how to test it. Issue #553, app 5.5.0.

The app is an iPhone app (`LSRequiresIPhoneOS`, device family 1). It is not made for the iPad, but an iPad can install
it from the App Store and runs it as an iPhone app. This document is about that.

## What an iPad does with the app

Measured on the simulators of Xcode 27.2. Sizes are in points.

| | iPadOS 26.5 | iPadOS 27.2 |
|---|---|---|
| What the app gets | The screen of a phone: 390 × 844, window = screen. The system scales it and shows it in a window | The real screen of the iPad (1032 × 1376 on an iPad Pro 13) and a real window on it |
| Window at first | The phone screen, scaled up to the height of the iPad | Half the width of the screen and its whole height: 516 × 1376 (iPad Pro 13), 512 × 1366 (iPad Pro 12.9), 410 × 1180 (iPad A16) |
| The user changes the size | The system scales the same phone screen; a portrait app does not see it | The app gets every size, from 375 × 486 to the first size. The system keeps the size for the next start, also after an update of the app |
| The iPad turns | The system turns the phone screen; the content of a portrait app stays upright | The window stays upright. The app is asked to turn |
| Safe area of the window | top 20, bottom 25 | iPad Pro: top 47, bottom 34 in portrait; in landscape top 0, bottom 20, **left 47, right 47**. iPad with a home button: top 20 in portrait, nothing in landscape |

**iPadOS 26.5: 5.4.0 is right there in every state, and nothing is changed for it.** The app tells the two apart by
the screen it gets: a short side of less than 600 pt is the screen of a phone.

Up to 5.4.0 the app knew portrait only and took its sizes from the window it started in. On iPadOS 27 that gave:

- **Landscape:** the app does not turn, the window stays upright: the content is drawn on its side and is cut off
  (the photo in issue #553).
- **A window of another size:** the layout was made for the size at the start. After a change of the size the
  content is cut off or does not fill the window. In the first window (2.7 times as high as wide) every screen is
  stretched.

## What the app does now

Two parts, both only for an iPad that gives the app a window of its own (iPadOS 27).

### 1. The app turns with the iPad

`AppDelegate.m` (`application:supportedInterfaceOrientationsForWindow:`) answers all orientations on such an iPad and
portrait everywhere else, and the default options of the navigation (`navigator.ts`) do the same. The content then
stays upright in the window, in portrait and in landscape.

An overlay says its orientation itself (`Navigator.showOverlay`). The navigation library gives the default options
only to the screens of the main window, and an overlay that is shown before they are set (the lock screen at the
start of the app) falls back to the portrait of `Info.plist`: it would be drawn on its side after a turn.

It is not possible to hold an iPad in portrait: iPadOS only locks the orientation for a scene that fills the screen
(`prefersInterfaceOrientationLocked`), and the window of an iPhone app never does.

An iPad that gives the app the screen of a phone keeps portrait. With all orientations the system also offers that
phone screen low and wide (844 × 390), and the app has no layout for that.

### 2. One phone layout, in a box (iPadOS 27)

The app keeps **one layout** in every window: that of a phone. The native side picks the size once, from the screen
of the iPad, so that it fits in portrait and in landscape (`DeviceUtilsModule padLayoutSize`):

| Short side of the screen | Layout | iPads |
|---|---|---|
| 932 or more | 430 × 932 (iPhone Pro Max) | iPad Pro 13, iPad Pro 12.9, iPad Air 13 |
| 844 to 931 | 390 × the short side | – |
| 600 to 843 | 375 × the short side | iPad Pro 11 (834), iPad Air 11, iPad A16 (820), iPad mini (744) |

`AppSizes` is made for that size, with the insets of that phone (the same in portrait and in landscape), so every
screen, the pin pad, the sheets and the tab icons have sizes the app already has on a phone.

The screen wrapper (`withSideSafeArea`, the same one as for the iPhone Duo) puts each screen in a box of that size in
the middle of the window:

| Window | Result |
|---|---|
| The size of the layout | The box is the window: the app looks as on that phone |
| Larger (the first window, a high window) | The box is in the middle; the rest of the window shows the background of the app |
| Smaller than the layout | The whole box, made smaller to fit (`transform: scale`). Nothing is cut off |

The tab bar is the native one: it stays at the end of the window. A backdrop (the dim or blur of an overlay, the
lock screen) covers the whole window, as on the iPhone Duo, and a sheet that comes up from the end of the screen
starts at the end of the window.

The native view of the wrapper tells the size of the window each time it changes, so the box follows the window
while the app runs. No screen is made again.

### The size of the window

`SceneDelegate.m` asks the system to keep the window at the size of the layout (`sizeRestrictions`, minimum and
maximum). What iPadOS 27.2 does with that, measured:

- It holds the **width**, from the moment the user changes the size of the window (the window goes to the width of
  the layout and stays there), and it does not let the window get lower than the layout. It does not hold the
  maximum height.
- It does **not** change a window by itself: not at the start of the app, and not when the limits are set. The size
  that the system kept from before stays until the user changes it. That is why the box is needed.
- A minimum that is larger than the window makes the system draw the window at the minimum size while the app stays
  in the smaller one (a black area beside the app, until the next start). So the minimum is only set while the
  window is not smaller than the layout.

There is no call that forces a size: `UIRequiresFullScreen` is ignored by iOS 27, and a scene geometry request on iOS
only takes orientations.

## Where the code is

| File | Part |
|---|---|
| `ios/Xaman/Libs/Utils/DeviceUtils.m` | `isPadDevice` (the model, not the interface idiom: that is "phone" for an iPhone app; never a Mac), `padLayoutSize`, the constants `isPadDevice` and `padLayout` for JavaScript |
| `ios/Xaman/AppDelegate.m` | All orientations on an iPad with a window of its own, portrait everywhere else |
| `ios/Xaman/SceneDelegate.m` | `keepPadWindowSize`: the limits of the window, at the start and each time the app becomes active |
| `src/common/helpers/padLayout.ts` | `IsPadDevice`, `GetPadLayout`: what the native side tells |
| `src/common/helpers/device.ts` | `GetLayoutInsets` gives the insets of the layout on an iPad; an iPad is never taken for a fold phone |
| `src/theme/sizes.ts` | `AppSizes` is made for the layout size on an iPad (`AppSizes.padLayout`) |
| `src/common/helpers/sideSafeArea.tsx` | `padBoxFor` (the place and the scale of the box), the box in the wrapper, the backdrops |
| `src/common/helpers/navigator.ts` | `orientation: ['all']` on an iPad with a window of its own, in the default options and in the options of each overlay |

A new overlay follows the rule in `docs/iphone-duo.md` ("A new overlay or a new full-screen backdrop"): the same
helpers make its backdrop reach the edges of the window on an iPad.

## Phones: nothing changes

- `isPadDevice` is true only when the model of the device starts with "iPad", and the layout size is only more than
  0 when that iPad also has a screen that is no phone screen. On an iPhone (and on an iPad of older iPadOS) the
  native side answers portrait, sends a layout size of 0, and sets no window limits.
- `GetPadLayout()` is `undefined` on every phone and on Android, and then `AppSizes`, the insets, the wrapper and the
  backdrops take the paths they had. `src/theme/__tests__/sizes.sideSafeArea.test.ts` compares every number with the
  5.4.0 formulas for 11 phones, also when the native side sends the iPad fields with "no iPad" values.
- `withSideSafeArea` still returns the screen class itself on a phone.

## How to test

### Unit tests

```bash
npx jest --forceExit src/theme src/common/helpers/__tests__/padLayout.test.tsx src/common/helpers/__tests__/sideSafeArea.test.tsx src/common/helpers/__tests__/device.sideInsets.test.ts
```

### On a simulator

An iPad simulator of iOS 27.2 (for example "iPad (A16)" and "iPad Pro 13-inch (M5)"), and one of iOS 26.5 for the
older behaviour. Install the app with `xcrun simctl install`; an iPhone app runs on an iPad simulator as on an iPad.

1. A fresh install: onboarding, the passcode screens, home. The app is a phone in the middle of a high window.
2. Stop and start the app: the lock screen. Its blur covers the whole window, the pin pad is in the box.
3. Drag the handle in the lower right corner of the window: smaller (the app gets smaller as a whole), larger (the
   window goes to the width of the layout). Stop and start the app in each: the same picture as before the stop.
4. Turn the iPad (Device Hub: Controls → Rotate) while the app runs, and start the app in landscape: the content is
   upright.
5. In each state: the action sheet of the centre tab button, the account switcher, an alert, the tab bar.

`scripts/e2e/ipad-walk.py` does this walk through WebDriverAgent and saves a picture of each step. It works with a
Release build, so the same walk can be made with an older build to compare.

## Known limits

- All of this is from the simulators. Not checked on a real iPad.
- In the first window after an install, and in a window that is higher than the layout, the app does not fill the
  window: the rest shows the background. The system does not let the app change that window.
- In a window smaller than the layout the tab bar keeps its own size (it is a native view), while the screens above
  it are made smaller.
- In landscape on an iPad Pro the window has a safe area of 47 pt on each side. The screens of the app do not use
  it, but the native tab bar keeps its items out of it.
- Text entry: the keyboard of the iPad comes over the lower part of the screen and the field with the cursor stays
  in view (checked on one form, portrait and landscape, simulator only). In portrait the form moves up more than
  it has to.
- Camera (QR scan), Tangem cards (no NFC on an iPad) and biometrics on an iPad were not looked at.
- Split View and Slide Over of iPadOS with another app beside Xaman were not tested.
- A Mac that runs the iOS app is left as it was (`isiOSAppOnMac`): it is not an iPad for this code.
