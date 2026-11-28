/** Android window support, separate from the iOS side safe area. */
import { NativeModules, Platform } from 'react-native';

export type AndroidLayoutSize = { width: number; height: number };

export type AndroidWindowFrame = {
    left: number;
    width: number;
    height: number;
    scale: number;
    logicalLeft: number;
    logicalTop: number;
    logicalHeight: number;
    logicalWidth?: number;
};

const positive = (value: unknown): value is number => {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
};

/** Old native builds and iOS retain their existing screen registration. */
export const supportsAndroidWindowLayout = (): boolean => {
    return Platform.OS === 'android' && NativeModules.DeviceUtilsModule?.supportsAndroidWindowLayout === true;
};

/** The native side supplies this only after positive fold hardware detection. */
export const getAndroidFoldLayout = (): AndroidLayoutSize | undefined => {
    if (!supportsAndroidWindowLayout()) return undefined;
    const layout = NativeModules.DeviceUtilsModule?.androidFoldLayout;
    if (!positive(layout?.width) || !positive(layout?.height)) return undefined;
    return { width: layout.width, height: layout.height };
};

/** A stable ordinary split model is a size hint, never fold identity or rotation. */
export const getAndroidLayoutSize = (): AndroidLayoutSize | undefined => {
    const fold = getAndroidFoldLayout();
    if (fold) return fold;
    if (!supportsAndroidWindowLayout()) return undefined;
    const layout = NativeModules.DeviceUtilsModule?.androidWindowLayout;
    if (!positive(layout?.width) || !positive(layout?.height)) return undefined;
    return { width: layout.width, height: layout.height };
};

/**
 * Fit the existing phone layout into a live Android window. The view fills the
 * available height; it does not create a gap above the native bottom tab bar.
 * Scaling uses the window height, not the shorter tab-content height, so an
 * unchanged cover screen or regular phone keeps its existing size.
 */
export const androidWindowFrame = (
    view: AndroidLayoutSize,
    window: AndroidLayoutSize,
    layout: AndroidLayoutSize,
    density = 1,
    fullPane = false,
): AndroidWindowFrame | undefined => {
    if (![view.width, view.height, window.height, layout.width, layout.height, density].every(positive)) {
        return undefined;
    }
    // onLayout crosses the bridge as floats, whereas Dimensions uses pixel
    // integers divided by density. Snap the measured view back to that same
    // pixel grid: a float such as 411.428558 must not shrink a 1080px phone.
    const viewWidth = Math.round(view.width * density) / density;
    const viewHeight = Math.round(view.height * density) / density;
    const windowHeight = Math.round(window.height * density) / density;
    if (![viewWidth, viewHeight, windowHeight].every(positive)) return undefined;
    if (fullPane) {
        return {
            left: 0, width: viewWidth, height: viewHeight, scale: 1,
            logicalLeft: 0, logicalTop: 0, logicalWidth: viewWidth, logicalHeight: viewHeight,
        };
    }
    const fit = Math.min(1, viewWidth / layout.width, windowHeight / layout.height);
    const width = Math.min(viewWidth, layout.width, Math.floor(layout.width * fit * density + 1e-6) / density);
    if (!positive(width)) return undefined;
    const scale = width / layout.width;
    const left = Math.max(0, viewWidth - width);
    const logicalHeight = viewHeight / scale;
    return {
        left,
        width,
        height: viewHeight,
        scale,
        // React Native scales a view around its centre. Compensate for that
        // centre so the visible rectangle stays at the right edge, top to bottom.
        logicalLeft: left - (layout.width - width) / 2,
        logicalTop: (viewHeight - logicalHeight) / 2,
        logicalHeight,
    };
};
