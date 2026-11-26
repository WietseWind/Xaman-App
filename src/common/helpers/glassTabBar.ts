import { Platform } from 'react-native';

import AppSizes from '@theme/sizes';

/** End clearance for a platform. Zero everywhere except iOS 26 and later. */
export const glassTabScrollPaddingFor = (os: string, version: string | number): number => {
    const major = parseInt(String(version), 10);
    return os === 'ios' && Number.isFinite(major) && major >= 26 ? 28 : 0;
};

/** iOS 26 and later draw the floating glass tab bar over the screen. */
export const iosGlassTabBar = glassTabScrollPaddingFor(Platform.OS, Platform.Version) > 0;

/**
 * Extra space at the end of a tab's scrolling content. The list itself extends
 * under the glass bar; this is only a short clearance so the last row can sit
 * just above the glass, not a second copy of the whole tab bar.
 */
export const glassTabScrollPadding = glassTabScrollPaddingFor(Platform.OS, Platform.Version);

/**
 * How far the floating glass bar reaches up from the end of the screen: 62pt of bar, 21pt above the
 * edge. The same on phones with and without a home indicator (measured on iPhone 17 Pro Max and
 * iPhone SE, iOS 27.2), so it is not the old tab bar height, which is 50pt without a home indicator.
 */
const GLASS_TAB_BAR_REACH = 84;

/**
 * What the tab bar covers at the end of a screen on a platform: the reach of the glass bar where it floats, else zero.
 *
 * side: the safe area on the sides of the screen and at its end. With a safe area on a side the tab bar stands on
 * that side (iPhone Duo), not at the end: the end of the screen then only has its own safe area (the home indicator).
 */
export const glassTabBarHeightFor = (
    os: string,
    version: string | number,
    tabbarHeight: number,
    side?: { sideInsets: number; bottomInset: number },
): number => {
    if (glassTabScrollPaddingFor(os, version) === 0) {
        return 0;
    }
    if (side && side.sideInsets > 0) {
        return Math.max(0, Number(side.bottomInset) || 0);
    }
    return Math.max(GLASS_TAB_BAR_REACH, Number(tabbarHeight) || 0);
};

/**
 * The strip at the end of a tab screen that the glass bar covers. A tab state that does not
 * scroll (buttons at the bottom, a centred message) takes this as bottom padding, so it is laid
 * out in the space above the bar, as it was when the bar had its own. Lists need none of it: iOS
 * insets them by itself. Zero on Android and below iOS 26.
 */
export const glassTabBarHeight = glassTabBarHeightFor(Platform.OS, Platform.Version, AppSizes.tabbarHeight, {
    sideInsets: AppSizes.sideInsets,
    bottomInset: AppSizes.safeAreaBottomInset,
});

/** Style for the container of such a state; undefined where the bar covers nothing. */
export const glassTabBarClearance = glassTabBarHeight > 0 ? { paddingBottom: glassTabBarHeight } : undefined;
