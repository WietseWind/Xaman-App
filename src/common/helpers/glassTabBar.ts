import { Platform } from 'react-native';

import { AppSizes } from '@theme';

/** iOS 26 and later draw the floating glass tab bar over the screen. */
export const iosGlassTabBar =
    Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26;

/**
 * Extra space at the end of a tab's scrolling content. The list itself extends
 * under the glass bar; this padding lets the last row rest above it.
 */
export const glassTabScrollPadding = iosGlassTabBar ? AppSizes.tabbarHeight : 0;
