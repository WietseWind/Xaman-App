import { Platform } from 'react-native';

/** iOS 26 and later draw the floating glass tab bar over the screen. */
export const iosGlassTabBar =
    Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26;

/**
 * Extra space at the end of a tab's scrolling content. The list itself extends
 * under the glass bar; this is only a short clearance so the last row can sit
 * just above the glass, not a second copy of the whole tab bar.
 */
export const glassTabScrollPadding = iosGlassTabBar ? 28 : 0;
