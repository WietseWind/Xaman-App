module.exports = {
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
            binaryPath: 'android/app/build/outputs/apk/release/app-x86_64-release.apk',
            build: 'cd android && ./gradlew app:assembleRelease app:assembleAndroidTest -DtestBuildType=release && cd ..',
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
        'android.emulator': {
            type: 'android.apk',
            device: { avdName: 'Nexus_5X_API_28' },
        },
        'android.attached': {
            type: 'android.attached',
            device: {
                adbName: '.*',
            },
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
        'ios.simulator.dev+xaman.ios.debug': {
            device: 'ios.simulator.dev',
            app: 'xaman.ios.debug',
        },
        'android.emulator+xaman.android': {
            device: 'android.emulator',
            app: 'xaman.android',
        },
        'android.attached+xaman.android': {
            device: 'android.attached',
            app: 'xaman.android',
        },
    },
};
