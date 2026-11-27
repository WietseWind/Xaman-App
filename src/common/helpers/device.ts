import { Platform, PixelRatio, NativeModules, Dimensions, I18nManager } from 'react-native';

import { GetPadLayout, IsPadDevice } from './padLayout';
import { getAndroidLayoutSize } from './androidWindow';

const { DeviceUtilsModule, UniqueIdProviderModule } = NativeModules;

// A side inset as a number: 0 for anything that is not a positive number (Android and older native code send none)
const sideInset = (value: unknown): number => {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
};

// The width of the column that iOS keeps on a side of the screen for the vertical tab bar and, on the cover screen,
// the camera and the status items (iPhone Duo, iOS 27.2).
const VERTICAL_BAR_COLUMN = 84;
// The top inset the app takes on that phone: the plain status bar. Turned a quarter, the open phone has a status
// area of 82 pt at the top of the window, but the app is not laid out under it there (sideSafeArea.tsx).
const FOLD_PHONE_TOP = 20;
// The open inner screen against the cover screen: 951 or 669 wide against 466. On every other phone the window is
// never wider than the screen.
const FOLD_PHONE_WIDER = 1.2;

// iPad: the insets of the one phone layout the app has there (see GetPadLayout in padLayout.ts). The top is at
// least the plain status bar; the bottom is that of an iPhone with a home indicator, when the iPad has one.
const PAD_TOP_MIN = 20;
const PAD_BOTTOM = 34;

/**
 * The edge on which iOS puts a vertical tab bar: 1 leading, 2 trailing. 0 on every phone that has no such bar:
 * all phones but the iPhone Duo.
 * @returns 0 | 1 | 2
 */
const GetVerticalBarEdge = (): 0 | 1 | 2 => {
    const edge = DeviceUtilsModule.verticalBarEdge;
    return edge === 1 || edge === 2 ? edge : 0;
};

/**
 * A phone whose app window changes while the app runs, with a vertical tab bar in most of its states: the iPhone Duo.
 * Known by the edge of that bar, or by a window that is wider than the screen of the device (the open inner screen
 * is larger than the cover screen, which stays the `screen`; so the phone is also known when the app starts on the
 * open phone turned a quarter, where there is no vertical bar). False on every other phone.
 * @returns boolean
 */
const IsFoldPhone = (): boolean => {
    if (Platform.OS !== 'ios' || IsPadDevice()) {
        return false;
    }
    if (GetVerticalBarEdge() !== 0) {
        return true;
    }
    const windowWidth = Dimensions.get('window').width;
    const screenWidth = Dimensions.get('screen').width;
    return screenWidth > 0 && windowWidth > screenWidth * FOLD_PHONE_WIDER;
};

/**
 * Get window layout insets
 *
 * left / right: a safe area on a side of the screen in portrait. 0 on every phone, except one that has a part of
 * the system on a side (iPhone Duo: the status area and the tab bar are on the right).
 * On such a phone the window itself has no side safe area in some states (the app in one half of the open screen:
 * the tab bar is then a column in the safe area of the tabs only; the open phone turned a quarter: no column at
 * all). The app keeps one layout in all states, so the column is counted in all of them, on the edge of the bar.
 * The top is then the plain status bar height: the app is laid out in a box that stays clear of the status area.
 * @returns {top: 0, bottom: 0, left: 0, right: 0}
 */
const GetLayoutInsets = (): { top: number; bottom: number; left: number; right: number } => {
    const insets = DeviceUtilsModule.layoutInsets;
    let left = sideInset(insets?.left);
    let right = sideInset(insets?.right);
    if (GetPadLayout()) {
        // iPad: the window has other insets in portrait and in landscape (in landscape the top inset is on the
        // sides). The one layout of the app takes the same insets in both: those of the phone it is laid out as.
        return {
            ...insets,
            top: Math.max(sideInset(insets?.top), left, right, PAD_TOP_MIN),
            bottom: sideInset(insets?.bottom) > 0 ? PAD_BOTTOM : 0,
            left: 0,
            right: 0,
        };
    }
    if (left + right <= 0 && !IsFoldPhone()) {
        // every phone but the iPhone Duo: as the native side sends it
        return { ...insets, left, right };
    }
    if (left + right < VERTICAL_BAR_COLUMN && IsFoldPhone()) {
        const column = VERTICAL_BAR_COLUMN - left - right;
        if ((GetVerticalBarEdge() === 1) !== I18nManager.isRTL) {
            left += column;
        } else {
            right += column;
        }
    }
    const top = IsFoldPhone() && insets?.top > FOLD_PHONE_TOP ? FOLD_PHONE_TOP : insets?.top;
    return { ...insets, top, left, right };
};

/**
 * The safe area on the two sides of the screen together. 0 on every phone but one with a system part on a side.
 * @returns number
 */
const GetSideInsets = (): number => {
    const { left, right } = GetLayoutInsets();
    return left + right;
};

/**
 * The width that content can use: the window without a safe area on its sides. The window width on every phone
 * that has no such area. On a phone with one that is open (iPhone Duo unfolded) it is the width of the cover screen
 * without the safe area: the app keeps that layout in a column (see theme/sizes.ts).
 * @returns number
 */
const GetUsableWindowWidth = (): number => {
    const androidLayout = getAndroidLayoutSize();
    if (androidLayout) return androidLayout.width;
    const pad = GetPadLayout();
    if (pad) {
        return pad.width;
    }
    const sideInsets = GetSideInsets();
    const windowWidth = Dimensions.get('window').width;
    if (sideInsets <= 0) {
        return windowWidth;
    }
    const screenWidth = Dimensions.get('screen').width;
    return (screenWidth > 0 ? Math.min(windowWidth, screenWidth) : windowWidth) - sideInsets;
};

/**
 * Check if device have bottom notch
 * @returns boolean
 */
const HasBottomNotch = (): boolean => {
    if (Platform.OS === 'ios') {
        const { bottom } = GetLayoutInsets();
        return bottom > 0;
    }
    return false;
};

/**
 * Check if device have bottom notch
 * @returns boolean
 */
const HasTopNotch = (): boolean => {
    // TODO: check for android devices
    if (Platform.OS === 'ios') {
        const { top } = GetLayoutInsets();
        return top > 20;
    }
    return false;
};

/**
 * IOS: check if device is jail broken
 * @returns Promise<boolean>
 */
const IsDeviceJailBroken = (): Promise<boolean> => {
    if (Platform.OS !== 'ios') {
        return Promise.resolve(false);
    }
    return DeviceUtilsModule.isJailBroken();
};

/**
 * Android: check if device is rooted
 * @returns Promise<boolean>
 */
const IsDeviceRooted = (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
        return Promise.resolve(false);
    }
    return DeviceUtilsModule.isRooted();
};

/**
 * Get device default timezone
 * @returns Promise<string>
 */
const GetDeviceTimeZone = (): Promise<string> => {
    return DeviceUtilsModule.getTimeZone();
};

/**
 * Get device local settings
 * @returns Promise<object>
 */
const GetDeviceLocaleSettings = (): Promise<any> => {
    return new Promise((resolve) => {
        DeviceUtilsModule.getLocalSetting()
            .then((settings: any) => {
                resolve(settings);
            })
            .catch(() => {
                // if failed to fetch the local settings default to EN
                resolve({ delimiter: ',', languageCode: 'en', locale: 'en_US', separator: '.' });
            });
    });
};

/**
 * Gets the device brand name
 * @returns string
 */
const GetDeviceBrand = (): string => {
    return `${DeviceUtilsModule.brand} ${DeviceUtilsModule.model}`;
};

/**
 * Gets the device OS version.
 * @returns string
 */
const GetDeviceOSVersion = (): string => {
    return `${DeviceUtilsModule.osVersion}`;
};

const TAB_COUNT = 5;
const TAB_ASSET_PT = 64;
const DEFAULT_ITEM_ROW = 49;
const SE_WIDTH = 375;
const TAB_CHROME_EXPONENT = 0.22;
// Center dock occupies this fraction of the compact 49pt item row (~25.2pt).
const CENTER_OF_ITEM_ROW = 0.514;
// Xaman-se (SE 2/3, iOS 18+, 375 @2x) paints hotter than the USB iPhone 8
// at the same point size — icons sat flush with the 49pt row. Shrink SE
// only (center more than sides); 8 cannot run iOS 18.
const SE_IOS18_CENTER_PT = 0.8;
const SE_IOS18_SIDE_PT = 0.86;
// The centre button on the vertical tab bar of the iPhone Duo: about 37 pt of the 48 pt bar (it was 46).
const FOLD_PHONE_CENTER_PT = 0.8;

const tabOsMajor = (): number => {
    const raw = GetDeviceOSVersion();
    const n = parseInt(String(raw).split(/[^\d]/)[0], 10);
    return Number.isFinite(n) ? n : 99;
};

const isCompactIos18At2x = (): boolean => {
    if (Platform.OS !== 'ios') {
        return false;
    }
    const width = GetUsableWindowWidth();
    return tabOsMajor() >= 18 && (PixelRatio.get() || 2) < 3 && width <= SE_WIDTH;
};

const tabBarItemRow = (): number => {
    const h = Number(DeviceUtilsModule.tabBarMetrics?.itemHeight);
    return Number.isFinite(h) && h > 0 ? h : DEFAULT_ITEM_ROW;
};

/**
 * Displayed center-dock size (points/dp). Same 0.65/0.9 factors as the tab icons.
 *
 * Sized from the compact tab-bar *item row* (49pt) plus a damped extra for
 * home-indicator chrome. Slot width still grows SE 375 → Pro ~402.
 *
 * iOS UITabBar paint is not 1:1 with UIImage.pointSize. That tracks the
 * loaded asset's pixel buffer (PixelRatio), not notch / iOS version:
 * iPhone SE 3rd gen is the same 375×667 @2x panel as iPhone 8 (750×1334),
 * not @3x like 17 Pro. Treating “iOS 26 @2x” as 1:1 paint made Xaman-se
 * tiny next to the USB iPhone 8. Matching the 8 exactly then filled the
 * SE 49pt row with no padding (center dock especially). Nudge SE
 * iOS 18+ @2x only.
 */
const getTabIconDisplayPt = (factor?: number): number => {
    // the width without a safe area on a side: there the tab bar stands on that side, and the icons take the size of
    // a phone as wide as the rest of the screen
    const width = GetUsableWindowWidth();
    const inset = GetLayoutInsets()?.bottom || 0;
    const itemRow = tabBarItemRow();
    const slot = width / TAB_COUNT;
    const bar = itemRow + (Platform.OS === 'ios' ? inset : 0);
    const f = factor || 1;
    const seCenter = itemRow * CENTER_OF_ITEM_ROW;
    const fromSlot = seCenter * (slot / (SE_WIDTH / TAB_COUNT)) * (0.65 / f);
    const chrome = (Math.max(bar, itemRow) / itemRow) ** TAB_CHROME_EXPONENT;
    let pt = fromSlot * chrome;
    if (isCompactIos18At2x()) {
        const isCenter = (factor || 1) < 0.8;
        pt *= isCenter ? SE_IOS18_CENTER_PT : SE_IOS18_SIDE_PT;
    }
    // The vertical tab bar of the iPhone Duo is 48 pt wide, less than the bar of other phones is high: the centre
    // button gets the same share of space around it as it has there.
    if ((factor || 1) < 0.8 && IsFoldPhone()) {
        pt *= FOLD_PHONE_CENTER_PT;
    }
    return pt;
};

const tabBarPaintEfficiency = (): number => {
    if (Platform.OS !== 'ios') {
        return 1;
    }
    // @3x catalog is 192px; @2x is 128px. SE 3rd gen and iPhone 8 are both @2x.
    return (PixelRatio.get() || 2) >= 3 ? 0.61 : 0.68;
};

/**
 * iOS RNN `icon.scale` (UIImage.scale). Point size = 64pt * PixelRatio / scale.
 */
const GetBottomTabScale = (factor?: number): number => {
    if (Platform.OS !== 'ios') return 0;
    const displayPt = getTabIconDisplayPt(factor);
    const requested = displayPt / tabBarPaintEfficiency();
    const ratio = PixelRatio.get() || 2;
    return (TAB_ASSET_PT * ratio) / requested;
};

/**
 * Android RNN `iconWidth` / `iconHeight` in dp (AHBottomNavigation dpToPx, 1:1).
 * Independent of iOS 25pt target — 20–28dp looked tiny next to the iOS dock.
 */
const ANDROID_CENTER_DP = 44;
const ANDROID_CENTER_CAP = 52;
const ANDROID_SIDE_CAP = 34;

const GetBottomTabIconDp = (factor?: number): number => {
    const isCenter = (factor || 1) < 0.8;
    if (Platform.OS !== 'android') {
        const displayPt = getTabIconDisplayPt(factor);
        return Math.round(Math.min(displayPt, isCenter ? 36 : 26));
    }
    const width = GetUsableWindowWidth();
    const slot = width / TAB_COUNT;
    const f = factor || 1;
    const fromSlot = ANDROID_CENTER_DP * (slot / (SE_WIDTH / TAB_COUNT)) * (0.65 / f);
    return Math.round(Math.min(fromSlot, isCenter ? ANDROID_CENTER_CAP : ANDROID_SIDE_CAP));
};

/**
 * Get the latest real time base on device CPU ticks
 * @returns Promise<number>
 */
const GetElapsedRealtime = async (): Promise<number> => {
    const ts: unknown = await DeviceUtilsModule.getElapsedRealtime();
    if ((typeof ts !== 'number' && typeof ts !== 'string') || (typeof ts === 'string' && ts.trim() === '')) {
        throw new Error('Invalid elapsed real time');
    }
    const realTime = Number(ts);
    if (!Number.isFinite(realTime) || realTime < 0) {
        throw new Error('Invalid elapsed real time');
    }
    return realTime;
};

/**
 * Get device unique id
 * @returns string
 */
const GetDeviceUniqueId = (): string => {
    return UniqueIdProviderModule.getDeviceUniqueId();
};

/**
 * Android: hide the native boot image after the first screen has painted.
 */
const HideLaunchSplash = (): void => {
    if (Platform.OS !== 'android' || typeof DeviceUtilsModule?.hideLaunchSplash !== 'function') {
        return;
    }
    DeviceUtilsModule.hideLaunchSplash();
};

/* Export ==================================================================== */
export {
    HasBottomNotch,
    HasTopNotch,
    GetBottomTabScale,
    GetBottomTabIconDp,
    GetLayoutInsets,
    GetSideInsets,
    GetVerticalBarEdge,
    IsFoldPhone,
    GetUsableWindowWidth,
    IsDeviceJailBroken,
    IsDeviceRooted,
    GetDeviceTimeZone,
    GetDeviceLocaleSettings,
    GetElapsedRealtime,
    GetDeviceBrand,
    GetDeviceOSVersion,
    GetDeviceUniqueId,
    HideLaunchSplash,
};
