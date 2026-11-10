/**
 * #479: an xApp's prefers-color-scheme follows the theme Xaman is set to, or with "auto switch" the OS
 * appearance (light, or the configured dark variant), the same way StyleService picks the app's theme.
 */
import { resolveXAppColorScheme } from '../colorScheme';

describe('resolveXAppColorScheme', () => {
    it('uses the configured theme without auto switch, whatever the OS says', () => {
        expect(resolveXAppColorScheme('light', false, 'dark')).toEqual({ colorScheme: 'light', style: 'light' });
        expect(resolveXAppColorScheme('dark', false, 'light')).toEqual({ colorScheme: 'dark', style: 'dark' });
        expect(resolveXAppColorScheme('moonlight', false, 'light')).toEqual({
            colorScheme: 'dark',
            style: 'moonlight',
        });
        expect(resolveXAppColorScheme('royal', false, null)).toEqual({ colorScheme: 'dark', style: 'royal' });
    });

    it('follows the OS with auto switch: light, or the configured dark variant', () => {
        expect(resolveXAppColorScheme('royal', true, 'light')).toEqual({ colorScheme: 'light', style: 'light' });
        expect(resolveXAppColorScheme('royal', true, 'dark')).toEqual({ colorScheme: 'dark', style: 'royal' });
        expect(resolveXAppColorScheme('moonlight', true, 'dark')).toEqual({
            colorScheme: 'dark',
            style: 'moonlight',
        });
        // configured light but the OS is dark: the default dark theme
        expect(resolveXAppColorScheme('light', true, 'dark')).toEqual({ colorScheme: 'dark', style: 'dark' });
    });

    it('keeps the configured theme when the OS appearance is unknown', () => {
        expect(resolveXAppColorScheme('dark', true, null)).toEqual({ colorScheme: 'dark', style: 'dark' });
        expect(resolveXAppColorScheme('light', true, undefined)).toEqual({ colorScheme: 'light', style: 'light' });
    });

    it('reads themes stored title-cased (before v1.0.1) and falls back to light for anything else', () => {
        expect(resolveXAppColorScheme('Dark', false, null)).toEqual({ colorScheme: 'dark', style: 'dark' });
        expect(resolveXAppColorScheme(undefined, false, null)).toEqual({ colorScheme: 'light', style: 'light' });
        expect(resolveXAppColorScheme('neon', false, 'dark')).toEqual({ colorScheme: 'light', style: 'light' });
    });
});
