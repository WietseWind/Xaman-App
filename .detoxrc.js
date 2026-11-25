// An exact adb serial pattern. Without ANDROID_SERIAL it matches no device, so a run never picks
// emulator-5554 or a USB phone by accident.
const androidSerialPattern = () => {
    const serial = process.env.ANDROID_SERIAL;
    return serial ? `^${serial.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$` : '^ANDROID_SERIAL-is-not-set$';
};

module.exports = {
    behavior: {
        init: {
            // DETOX_REINSTALL=yes installs the freshly built app (throwaway runs do).
            reinstallApp: String(process.env.DETOX_REINSTALL || '').toLowerCase() === 'yes',
        },
    },
    apps: {
        'xaman.ios': {
            type: 'ios.app',
            binaryPath: 'ios/build/Build/Products/Release-iphonesimulator/Xaman.app',
            build: 'xcodebuild -workspace ios/Xaman.xcworkspace -scheme Xaman -configuration Release -sdk iphonesimulator -derivedDataPath ios/build',
        },
        // Debug + Metro install already on the iPhone 17 Pro (Xcode Run). Attach only — do not rebuild.
        'xaman.ios.debug': {
            type: 'ios.app',
            binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/Xaman.app',
        },
        'xaman.android': {
            type: 'android.apk',
            // Exclude destructive native unit fixtures from the E2E instrumentation run.
            launchArgs: { class: 'com.xrpllabs.xumm.DetoxTest' },
            binaryPath: 'android/app/build/outputs/apk/release/app-x86_64-release.apk',
            build: 'cd android && ./gradlew app:assembleRelease app:assembleAndroidTest -DtestBuildType=release && cd ..',
        },
        // Release app on an Apple Silicon emulator; never point Detox at the USB phone.
        // -DtestBuildType=release also builds the release test APK (proguard-e2e.pro).
        'xaman.android.arm64': {
            type: 'android.apk',
            launchArgs: { class: 'com.xrpllabs.xumm.DetoxTest' },
            binaryPath: 'android/app/build/outputs/apk/release/app-arm64-v8a-release.apk',
            testBinaryPath: 'android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk',
            build:
                'cd android && ./gradlew app:assembleRelease app:assembleAndroidTest -DtestBuildType=release -PreactNativeArchitectures=arm64-v8a && cd ..',
        },
        // Debug app + Metro.
        'xaman.android.debug.arm64': {
            type: 'android.apk',
            launchArgs: { class: 'com.xrpllabs.xumm.DetoxTest' },
            binaryPath: 'android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk',
            testBinaryPath: 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
            build: 'cd android && ./gradlew app:assembleDebug app:assembleAndroidTest -DtestBuildType=debug && cd ..',
        },
    },
    devices: {
        'ios.simulator': {
            type: 'ios.simulator',
            headless: process.env.CI ? true : undefined,
            device: { type: 'iPhone 16 Pro' },
        },
        // dedicated local simulator so e2e runs never wipe the dev simulator's app state
        // create it once with: xcrun simctl create "Xaman-e2e" "iPhone 16 Pro"
        'ios.simulator.local': {
            type: 'ios.simulator',
            device: { name: 'Xaman-e2e' },
        },
        'ios.simulator.dev': {
            type: 'ios.simulator',
            device: { name: 'iPhone 17 Pro' },
        },
        'ios.simulator.se': {
            type: 'ios.simulator',
            device: { name: 'Xaman-se' },
        },
        // iOS 27 glass runtime. Xaman-e2e stays on iOS 26.5.
        'ios.simulator.ios27': {
            type: 'ios.simulator',
            device: { name: 'Xaman-e2e-27' },
        },
        'android.emulator': {
            type: 'android.emulator',
            device: { avdName: 'Nexus_5X_API_28' },
        },
        // dedicated API 36 ARM emulator — do not use android.attached (would wipe SM-M215F)
        'android.emulator.local': {
            type: 'android.emulator',
            device: { avdName: 'Xaman_API36' },
        },
        // The device named by ANDROID_SERIAL ('.*' used to pick whichever device came first,
        // which could be the USB phone).
        'android.attached': {
            type: 'android.attached',
            device: {
                adbName: androidSerialPattern(),
            },
        },
        // Throwaway runs (scripts/e2e/run-throwaway.sh): the simulator and emulator that script
        // made for this run, named by E2E_IOS_SIMULATOR and ANDROID_SERIAL.
        'ios.simulator.e2e': {
            type: 'ios.simulator',
            device: { name: process.env.E2E_IOS_SIMULATOR || 'Xaman-e2e' },
        },
        'android.attached.e2e': {
            type: 'android.attached',
            device: { adbName: androidSerialPattern() },
        },
        // SM-M215F only (the USB phone): only by its exact serial, never picked by a run on its own
        'android.attached.usb': {
            type: 'android.attached',
            device: { adbName: 'R58NA2ZV7TK' },
        },
    },
    configurations: {
        'ios.simulator+xaman.ios': {
            device: 'ios.simulator',
            app: 'xaman.ios',
        },
        'ios.simulator.local+xaman.ios': {
            device: 'ios.simulator.local',
            app: 'xaman.ios',
        },
        'ios.simulator.local+xaman.ios.debug': {
            device: 'ios.simulator.local',
            app: 'xaman.ios.debug',
        },
        'ios.simulator.dev+xaman.ios.debug': {
            device: 'ios.simulator.dev',
            app: 'xaman.ios.debug',
        },
        'ios.simulator.se+xaman.ios': {
            device: 'ios.simulator.se',
            app: 'xaman.ios',
        },
        'ios.simulator.ios27+xaman.ios': {
            device: 'ios.simulator.ios27',
            app: 'xaman.ios',
        },
        'android.emulator+xaman.android': {
            device: 'android.emulator',
            app: 'xaman.android',
        },
        'android.emulator.local+xaman.android.arm64': {
            device: 'android.emulator.local',
            app: 'xaman.android.arm64',
        },
        'android.emulator.local+xaman.android.debug.arm64': {
            device: 'android.emulator.local',
            app: 'xaman.android.debug.arm64',
        },
        'android.attached+xaman.android': {
            device: 'android.attached',
            app: 'xaman.android',
        },
        'android.attached.usb+xaman.android.debug.arm64': {
            device: 'android.attached.usb',
            app: 'xaman.android.debug.arm64',
        },
        'ios.e2e+xaman.ios': {
            device: 'ios.simulator.e2e',
            app: 'xaman.ios',
        },
        // Release app + release test APK (build with -DtestBuildType=release)
        'android.e2e+xaman.android.arm64': {
            device: 'android.attached.e2e',
            app: 'xaman.android.arm64',
        },
        // Debug app + Metro
        'android.e2e+xaman.android.debug.arm64': {
            device: 'android.attached.e2e',
            app: 'xaman.android.debug.arm64',
        },
    },
};
