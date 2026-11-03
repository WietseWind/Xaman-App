import { canonicalBuildNumber, readableAppVersion } from '../readableAppVersion';

describe('readableAppVersion', () => {
    it('shows the same build number iOS uses, not the Android version code', () => {
        expect(readableAppVersion('5.4.0', '403', 'ios')).toBe('5.4.0.403');
        expect(readableAppVersion('5.4.0', '3176131', 'android')).toBe('5.4.0.403');
        expect(readableAppVersion('5.4.0', '3176114', 'android')).toBe('5.4.0.386');
    });

    it('strips the ABI offset and the legacy postfix from every split APK', () => {
        expect(canonicalBuildNumber('30403')).toBe('403');
        expect(canonicalBuildNumber('1078979')).toBe('403');
        expect(canonicalBuildNumber('2127555')).toBe('403');
        expect(canonicalBuildNumber('4224707')).toBe('403');
    });

    it('leaves a version code that is not in this scheme unchanged', () => {
        expect(canonicalBuildNumber('unknown')).toBe('unknown');
        expect(canonicalBuildNumber('100')).toBe('100');
    });
});
