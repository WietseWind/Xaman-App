import { NativeModules, Platform } from 'react-native';

import { readableAppVersion } from './readableAppVersion';

const { AppUtilsModule } = NativeModules;

/**
 * Get current app version
 */
const GetAppVersionCode = (): string => {
    return AppUtilsModule.appVersion;
};

/**
 * Get current app build number
 */
const GetAppBuildNumber = (): string => {
    return AppUtilsModule.buildNumber;
};

/**
 * Get a readable app version, combination of app version code and build number
 */
const GetAppReadableVersion = (): string => {
    return readableAppVersion(
        GetAppVersionCode(),
        GetAppBuildNumber(),
        Platform.OS === 'android' ? 'android' : 'ios',
    );
};

/**
 * Check if app is running in debug or release build
 */
const IsDebugBuild = (): boolean => {
    return AppUtilsModule.isDebug;
};

/**
 * iOS TestFlight builds ship a sandbox App Store receipt. Android is never TestFlight.
 */
const IsTestFlightBuild = (): boolean => {
    return AppUtilsModule?.isTestFlight === true;
};

/**
 * Android: Check if flagSecure is set on current activity
 * @returns Promise<boolean>
 */
const IsFlagSecure = (): Promise<boolean> => {
    if (Platform.OS !== 'android' || IsDebugBuild()) {
        return Promise.resolve(false);
    }
    return AppUtilsModule.isFlagSecure();
};

/**
 * Android: turn on/off flagSecure flag on current activity
 */
const SetFlagSecure = (enable: boolean): void => {
    if (Platform.OS !== 'android') {
        return;
    }
    // Debug APK never blocks screenshots. Release still uses FLAG_SECURE.
    AppUtilsModule.setFlagSecure(IsDebugBuild() ? false : enable);
};

/**
 * Restart react native bundle
 */
const RestartBundle = (): void => {
    AppUtilsModule.restartBundle();
};

/**
 * hard close the app process
 */
const ExitApp = (): void => {
    AppUtilsModule.exitApp();
};

/* Export ==================================================================== */
export {
    GetAppVersionCode,
    GetAppBuildNumber,
    GetAppReadableVersion,
    IsDebugBuild,
    IsTestFlightBuild,
    IsFlagSecure,
    SetFlagSecure,
    RestartBundle,
    ExitApp,
};
