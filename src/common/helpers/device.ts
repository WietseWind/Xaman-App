import { Platform, PixelRatio, NativeModules, Dimensions } from 'react-native';

const { DeviceUtilsModule, UniqueIdProviderModule } = NativeModules;

/**
 * Get window layout insets
 * @returns {top: 0, bottom: 0}
 */
const GetLayoutInsets = (): { top: number; bottom: number } => {
    return DeviceUtilsModule.layoutInsets;
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
const IOS_ITEM_ROW = 49;
// Center dock on iPhone SE (375pt, 49pt item row). 24 was a hair small.
const SE_CENTER_PT = 25.2;
const SE_WIDTH = 375;
const TAB_CHROME_EXPONENT = 0.22;

const tabOsMajor = (): number => {
    const raw = GetDeviceOSVersion();
    const n = parseInt(String(raw).split(/[^\d]/)[0], 10);
    return Number.isFinite(n) ? n : 99;
};

/**
 * Displayed center-dock size (points/dp). Same 0.65/0.9 factors as the tab icons.
 *
 * - Grows with slot width (SE 375 → Pro ~402).
 * - Extra tab-bar chrome (home indicator) uses a damped curve, not bar/49,
 *   so large phones don’t look empty and don’t overflow.
 * - iOS UITabBar does not paint UIImage.pointSize 1:1: @3x+notch ~0.57 of
 *   requested (measured), iOS 16 @2x a bit under the iOS 26 SE sim.
 */
const getTabIconDisplayPt = (factor?: number): number => {
    const { width } = Dimensions.get('window');
    const inset = GetLayoutInsets()?.bottom || 0;
    const slot = width / TAB_COUNT;
    const bar = IOS_ITEM_ROW + (Platform.OS === 'ios' ? inset : 0);
    const f = factor || 1;
    const fromSlot = SE_CENTER_PT * (slot / (SE_WIDTH / TAB_COUNT)) * (0.65 / f);
    const chrome = Math.pow(Math.max(bar, IOS_ITEM_ROW) / IOS_ITEM_ROW, TAB_CHROME_EXPONENT);
    return fromSlot * chrome;
};

const tabBarPaintEfficiency = (): number => {
    if (Platform.OS !== 'ios') {
        return 1;
    }
    const ratio = PixelRatio.get() || 2;
    const notched = (GetLayoutInsets()?.bottom || 0) > 0;
    if (ratio >= 3) {
        return notched ? 0.61 : 0.72;
    }
    // iPhone 8 (iOS 16, @2x, 375pt) vs SE sim (iOS 26): same points, smaller paint.
    if (tabOsMajor() < 18) {
        return 0.68;
    }
    return 1;
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
    const { width } = Dimensions.get('window');
    const slot = width / TAB_COUNT;
    const f = factor || 1;
    const fromSlot = ANDROID_CENTER_DP * (slot / (SE_WIDTH / TAB_COUNT)) * (0.65 / f);
    return Math.round(Math.min(fromSlot, isCenter ? ANDROID_CENTER_CAP : ANDROID_SIDE_CAP));
};

/**
 * Get the latest real time base on device CPU ticks
 * @returns Promise<number>
 */
const GetElapsedRealtime = (): Promise<number> => {
    return new Promise((resolve) => {
        DeviceUtilsModule.getElapsedRealtime()
            .then((ts: string) => {
                return resolve(Number(ts));
            })
            .catch(() => {
                throw new Error('Unable to fetch elapsed real time!');
            });
    });
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
