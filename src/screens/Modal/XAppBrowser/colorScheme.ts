import type { ColorSchemeName } from 'react-native';

import type { Themes } from '@store/types';

export type XAppColorScheme = {
    // what the page sees as prefers-color-scheme
    colorScheme: 'light' | 'dark';
    // the Xaman theme behind it, as in the xAppStyle launch parameter
    style: Themes;
};

const THEMES: Themes[] = ['light', 'dark', 'moonlight', 'royal'];

/**
 * The colour scheme an xApp gets: the theme Xaman is set to, or with "auto switch" the OS
 * appearance: light, or in dark the configured dark variant (the default dark when light is
 * configured), the same way StyleService picks the app's own theme.
 */
export const resolveXAppColorScheme = (
    configuredTheme: string | undefined,
    autoSwitch: boolean,
    osColorScheme: ColorSchemeName,
): XAppColorScheme => {
    // themes were stored title-cased before v1.0.1
    const lower = String(configuredTheme || 'light').toLowerCase() as Themes;
    const theme: Themes = THEMES.includes(lower) ? lower : 'light';

    let style: Themes = theme;
    if (autoSwitch && osColorScheme) {
        if (osColorScheme === 'light') {
            style = 'light';
        } else {
            style = theme === 'light' ? 'dark' : theme;
        }
    }

    return { colorScheme: style === 'light' ? 'light' : 'dark', style };
};
