/**
 * The app on an iPad (issue 553, docs/ipad.md): what the native side tells about it.
 *
 * In a file of its own, without the other device helpers: the sizes of the app (theme/sizes.ts) are made from it.
 */
import { NativeModules, Platform } from 'react-native';

const positive = (value: unknown): number => {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
};

/**
 * The device is an iPad. The app is an iPhone app there, in a window of the system. False on every phone.
 * @returns boolean
 */
const IsPadDevice = (): boolean => {
    return Platform.OS === 'ios' && NativeModules.DeviceUtilsModule?.isPadDevice === true;
};

/**
 * iPad (iPadOS 27): the size the app is laid out for. The window of the app is a real window there: the user can
 * change its size, and it has another shape when the iPad turns. The app keeps one layout, that of a phone of this
 * size, in a box in that window (sideSafeArea.tsx), and asks the system to keep the window at this size.
 * Undefined on every phone, and on an iPad whose system gives the app the screen of a phone (older iPadOS).
 * @returns {width, height} | undefined
 */
const GetPadLayout = (): { width: number; height: number } | undefined => {
    if (!IsPadDevice()) {
        return undefined;
    }
    const width = positive(NativeModules.DeviceUtilsModule?.padLayout?.width);
    const height = positive(NativeModules.DeviceUtilsModule?.padLayout?.height);
    return width > 0 && height > 0 ? { width, height } : undefined;
};

export { IsPadDevice, GetPadLayout };
