import { canonicalBuildNumber, fullAppVersion, readableAppVersion } from '../readableAppVersion';

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

describe('fullAppVersion', () => {
    it('adds the number of the over-the-air update; the store version stays as it is', () => {
        expect(fullAppVersion('5.4.0.456', 12)).toBe('5.4.0.456.12');
        expect(fullAppVersion('5.4.0.456', 0)).toBe('5.4.0.456');
    });

    it('never adds anything that is not an update number', () => {
        expect(fullAppVersion('5.4.0.456', NaN)).toBe('5.4.0.456');
        expect(fullAppVersion('5.4.0.456', -1)).toBe('5.4.0.456');
        expect(fullAppVersion('5.4.0.456', 1.5)).toBe('5.4.0.456');
    });
});
