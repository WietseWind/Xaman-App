const { execFileSync } = require('child_process');
const { device } = require('detox');
const {
    unlockAndroidPasscodeIfPresent,
    waitUntilAndroidRnReady,
    disableAndroidStylusHandwriting,
    clearAndroidBlockingDialogs,
    resetAndroidDumpState,
} = require('./tapById');

const URL_BLACKLIST = [
    '.*xumm.app.*',
    '.*xaman.app.*',
    // Fresh sim: Firebase checkin holds Detox iOS sync and misses agreement-setup-screen.
    '.*device-provisioning.googleapis.com.*',
    '.*firebaseinstallations.googleapis.com.*',
    '.*firebase.googleapis.com.*',
    '.*firebaselogging.googleapis.com.*',
    '.*app-measurement.com.*',
];

// After launchApp: synchronization off, the Android UI ready, and the URL blacklist again (it
// lives in the app process, so a new instance starts without it).
const settleAfterLaunch = async () => {
    if (device.getPlatform() === 'android') {
        resetAndroidDumpState();
        await device.disableSynchronization();
        disableAndroidStylusHandwriting();
        await waitUntilAndroidRnReady();
        await clearAndroidBlockingDialogs();
        await unlockAndroidPasscodeIfPresent();
    } else {
        // iPhone SE: Firebase/main-queue idling hides onboarding-screen for 90s.
        await device.disableSynchronization();
    }
    await device.setURLBlacklist(URL_BLACKLIST);
};

// iOS: sends the app to the background by opening Settings. device.sendToHome() waits for the app
// to confirm it went to the background and hung there ("app has not responded: waitForBackground").
const sendIosAppToBackground = async () => {
    execFileSync('xcrun', ['simctl', 'launch', device.id, 'com.apple.Preferences'], {
        stdio: 'ignore',
        timeout: 20000,
    });
    await new Promise((resolve) => { setTimeout(resolve, 1000); });
};

module.exports = { URL_BLACKLIST, settleAfterLaunch, sendIosAppToBackground };
