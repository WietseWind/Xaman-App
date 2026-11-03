// Android versionCode is abiIndex * 1048576 + canonical build + 30000.
// iOS shows the canonical build (CFBundleVersion), for example 5.4.0.403.
const ANDROID_ABI_VERSION_STRIDE = 1048576;
const ANDROID_VERSION_POSTFIX = 30000;

export const canonicalBuildNumber = (versionCode: string): string => {
    const code = Number(versionCode);

    if (!Number.isInteger(code) || code < 0) {
        return versionCode;
    }

    const withoutAbi = code % ANDROID_ABI_VERSION_STRIDE;

    if (withoutAbi < ANDROID_VERSION_POSTFIX) {
        return versionCode;
    }

    return String(withoutAbi - ANDROID_VERSION_POSTFIX);
};

export const readableAppVersion = (
    versionName: string,
    buildNumber: string,
    platform: 'ios' | 'android',
): string => {
    const build = platform === 'android' ? canonicalBuildNumber(buildNumber) : buildNumber;

    return `${versionName}.${build}`;
};
