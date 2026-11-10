try {
    if (process.stdout._handle && typeof process.stdout._handle.setBlocking === 'function') {
        process.stdout._handle.setBlocking(true);
    }
} catch (e) {
    // keep going if stdout is not a handle
}

const detox = require('detox/internals');

const { device, element, by, waitFor } = require('detox');
const { Before, BeforeAll, AfterAll, After, BeforeStep, AfterStep } = require('@cucumber/cucumber');
const adapter = require('./adapter');
const { getCurrentTestPasscode } = require('../helpers/testCredentials');
const { androidSerial } = require('../helpers/androidSerial');

const {
    setDeviceUdid,
    setScreenshotPlatform,
    nextStepIndex,
    takeNamedScreenshot,
    startRecordingVideo,
    stopRecordingVideo,
} = require('../helpers/artifacts');
const { startDeviceLogStream, stopDeviceLogStream } = require('../helpers/simulator');
const {
    checkNetwork,
    prepareIosSimulator,
    preflightAndroid,
    adoptDetoxAndroidDevice,
    ensureAndroidOnline,
} = require('./preflight');
const {
    tapByTestIdIfPresent,
    unlockAndroidPasscodeIfPresent,
    restoreAndroidAnimationScale,
    adbTapChangelogClose,
    hideAndroidKeyboard,
} = require('../helpers/tapById');
const { settleAfterLaunch } = require('../helpers/appLaunch');

const log = (msg) => {
    // eslint-disable-next-line no-console
    console.error(`[e2e ${new Date().toISOString()}] ${msg}`);
};

const short = (error) =>
    String((error && error.message) || error)
        .split('\n')[0]
        .slice(0, 200);

const isAndroid = () => device.getPlatform() === 'android';

// Set when the app could not be restarted twice in a row or the device went away: every later
// scenario then fails at once with this reason instead of hanging on a dead device.
let deviceBroken = null;
let failedRestarts = 0;

BeforeAll({ timeout: 15 * 60 * 1000 }, async () => {
    // fail fast with a clear message when the suite cannot possibly pass
    await checkNetwork();
    prepareIosSimulator();
    preflightAndroid();

    const reuse = String(process.env?.DETOX_REUSE || 'no').toLowerCase() === 'yes';
    const newInstance =
        String(process.env?.DETOX_NEW_INSTANCE || '').toLowerCase() === 'yes' ? true : !reuse;

    await detox.init({
        argv: {
            reuse,
        },
    });

    if (isAndroid()) {
        adoptDetoxAndroidDevice(device.id);
    }

    // target the detox-managed simulator, not whatever happens to be "booted"
    setDeviceUdid(device.id);
    setScreenshotPlatform(device.getPlatform());

    if (!isAndroid()) {
        startDeviceLogStream(device.id);
        startRecordingVideo();
    }

    await device.launchApp({
        newInstance,
        permissions: { notifications: 'YES', camera: 'YES' },
        disableTouchIndicators: false,
        // Must be set at launch. Android RN Animated (Toast) trips
        // AnimatedModuleIdlingResource during "ready".
        launchArgs: isAndroid() ? { detoxEnableSynchronization: 0 } : undefined,
    });

    await settleAfterLaunch();
});

// On fresh Android installs the app auto-opens the "What's new" release-notes
// modal shortly after launch; its full-screen backdrop swallows taps on the
// screen underneath. Close it before every scenario if it is up (by testID).
async function dismissChangelogOverlay() {
    // Dump + UiDevice only. Espresso waitFor on this overlay waits for MAIN_LOOPER idle.
    await tapByTestIdIfPresent('close-change-log-button', 1500);
    if (isAndroid()) {
        await adbTapChangelogClose();
    }
}

async function dismissIosLockIfPresent() {
    if (isAndroid()) {
        return;
    }
    try {
        await waitFor(element(by.id('lock-overlay')))
            .toExist()
            .withTimeout(800);
    } catch (e) {
        return;
    }
    const pin = getCurrentTestPasscode();
    for (let i = 0; i < pin.length; i += 1) {
        await element(by.id(`${pin[i]}-key`)).tap();
    }
    await waitFor(element(by.id('lock-overlay')))
        .not.toExist()
        .withTimeout(10000);
}

// A failed scenario can leave the app anywhere: an undismissed alert, half an import flow, or a
// Detox call that never answered (iOS: "app has not responded: waitForBackground"). Restart the
// app so the next scenario starts from Home, unlocked, instead of failing in the same place.
const restartAppAfterFailure = async (scenario) => {
    log(`scenario failed: "${scenario}"; restarting the app for the next scenario`);
    const started = Date.now();
    try {
        await device.terminateApp();
    } catch (e) {
        log(`terminateApp failed (${short(e)}); launching a new instance anyway`);
    }
    try {
        await device.launchApp({
            newInstance: true,
            launchArgs: isAndroid() ? { detoxEnableSynchronization: 0 } : undefined,
        });
        await settleAfterLaunch();
        await dismissIosLockIfPresent();
        failedRestarts = 0;
        log(`app restarted in ${Math.round((Date.now() - started) / 1000)} s`);
    } catch (e) {
        failedRestarts += 1;
        log(`app restart failed (${failedRestarts} in a row): ${short(e)}`);
        if (failedRestarts >= 2) {
            deviceBroken = `the app could not be restarted twice in a row (${short(e)})`;
        }
    }
};

Before({ timeout: 3 * 60 * 1000 }, async (context) => {
    if (deviceBroken) {
        throw new Error(`e2e: skipped, the device is unusable: ${deviceBroken}`);
    }
    if (isAndroid()) {
        try {
            ensureAndroidOnline(androidSerial(), 60000);
        } catch (e) {
            deviceBroken = short(e);
            throw e;
        }
        // A keyboard left up by the previous scenario covers the tab bar.
        await hideAndroidKeyboard();
    }
    await unlockAndroidPasscodeIfPresent();
    await dismissIosLockIfPresent();
    await dismissChangelogOverlay();
    await adapter.beforeEach(context);
});

// A step that runs much longer than usual is usually stuck: keep a screenshot of where it
// stopped, before the step timeout fails it.
const STALL_AFTER_MS = 60 * 1000;
let stallTimer = null;

BeforeStep(async (context) => {
    nextStepIndex();
    takeNamedScreenshot(`before-${context.pickleStep.text}`);
    const { text } = context.pickleStep;
    stallTimer = setTimeout(() => {
        log(`step still running after ${STALL_AFTER_MS / 1000} s: ${text}`);
        takeNamedScreenshot(`STALLED-${text}`);
    }, STALL_AFTER_MS);
});

AfterStep(async (context) => {
    clearTimeout(stallTimer);
    const status = context.result && context.result.status ? context.result.status : 'UNKNOWN';
    takeNamedScreenshot(`after-${status}-${context.pickleStep.text}`);
});

After({ timeout: 6 * 60 * 1000 }, async (context) => {
    clearTimeout(stallTimer);
    const failed = context.result && context.result.status === 'FAILED';
    if (failed) {
        takeNamedScreenshot(`FAIL-${context.pickle.name}`);
    }
    await adapter.afterEach(context);
    if (failed && !deviceBroken && adapter.continueOnFail()) {
        await restartAppAfterFailure(context.pickle.name);
    }
});

AfterAll({ timeout: 2 * 60 * 1000 }, async () => {
    if (isAndroid()) {
        restoreAndroidAnimationScale();
    }

    // clean up
    try {
        await detox.cleanup();
    } finally {
        stopRecordingVideo();
        stopDeviceLogStream();
    }
});
