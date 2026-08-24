const detox = require('detox/internals');

const { device } = require('detox');
const { Before, BeforeAll, AfterAll, After, BeforeStep, AfterStep } = require('@cucumber/cucumber');
const adapter = require('./adapter');

const {
    setDeviceUdid,
    setScreenshotPlatform,
    nextStepIndex,
    takeNamedScreenshot,
    startRecordingVideo,
    stopRecordingVideo,
} = require('../helpers/artifacts');
const { startDeviceLogStream } = require('../helpers/simulator');
const { checkNetwork, ensureLocalSimulator } = require('./preflight');
const {
    tapByTestIdIfPresent,
    unlockAndroidPasscodeIfPresent,
    waitUntilAndroidRnReady,
    disableAndroidStylusHandwriting,
    clearAndroidBlockingDialogs,
} = require('../helpers/tapById');

BeforeAll(async () => {
    // fail fast with a clear message when the suite cannot possibly pass
    await checkNetwork();
    ensureLocalSimulator();

    await detox.init({
        argv: {
            // reuse: false,
            reuse: String(process.env?.DETOX_REUSE || 'no').toLowerCase() === 'yes',
        },
    });

    // target the detox-managed simulator, not whatever happens to be "booted"
    setDeviceUdid(device.id);
    setScreenshotPlatform(device.getPlatform());

    // start device log
    startDeviceLogStream(device.id);

    // start recording video
    startRecordingVideo();

    await device.launchApp({
        newInstance: true,
        permissions: { notifications: 'YES', camera: 'YES' },
        disableTouchIndicators: false,
        // Must be set at launch. Android RN Animated (Toast) trips
        // AnimatedModuleIdlingResource during "ready".
        launchArgs:
            process.env.DETOX_CONFIGURATION && String(process.env.DETOX_CONFIGURATION).startsWith('android.')
                ? { detoxEnableSynchronization: 0 }
                : undefined,
    });

    if (device.getPlatform() === 'android') {
        await device.disableSynchronization();
        disableAndroidStylusHandwriting();
        await waitUntilAndroidRnReady();
        await clearAndroidBlockingDialogs();
        await unlockAndroidPasscodeIfPresent();
    }

    await device.setURLBlacklist([
        '.*xumm.app.*',
        '.*xaman.app.*',
        // Fresh sim: Firebase checkin holds Detox iOS sync and misses agreement-setup-screen.
        '.*device-provisioning.googleapis.com.*',
        '.*firebaseinstallations.googleapis.com.*',
        '.*firebase.googleapis.com.*',
        '.*firebaselogging.googleapis.com.*',
        '.*app-measurement.com.*',
    ]);
});

// On fresh Android installs the app auto-opens the "What's new" release-notes
// modal shortly after launch; its full-screen backdrop swallows taps on the
// screen underneath. Close it before every scenario if it is up (by testID).
async function dismissChangelogOverlay() {
    // Dump + UiDevice only. Espresso waitFor on this overlay waits for MAIN_LOOPER idle.
    await tapByTestIdIfPresent('close-change-log-button', 1500);
}

Before(async (context) => {
    await unlockAndroidPasscodeIfPresent();
    await dismissChangelogOverlay();
    await adapter.beforeEach(context);
});

BeforeStep(async (context) => {
    nextStepIndex();
    takeNamedScreenshot(`before-${context.pickleStep.text}`);
});

AfterStep(async (context) => {
    const status = context.result && context.result.status ? context.result.status : 'UNKNOWN';
    takeNamedScreenshot(`after-${status}-${context.pickleStep.text}`);
});

After(async (context) => {
    if (context.result && context.result.status === 'FAILED') {
        takeNamedScreenshot(`FAIL-${context.pickle.name}`);
    }
    await adapter.afterEach(context);
});

AfterAll(async () => {
    // clean up
    await detox.cleanup();

    // stop recording
    stopRecordingVideo();
});
