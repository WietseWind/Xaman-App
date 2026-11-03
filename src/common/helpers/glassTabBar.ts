import { Platform } from 'react-native';

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
