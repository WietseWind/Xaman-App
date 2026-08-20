const detox = require('detox/internals');

const { device, element, by, waitFor } = require('detox');
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
    }

    await device.setURLBlacklist(['.*xumm.app.*', '.*xaman.app.*']);
});

// On fresh Android installs the app auto-opens the "What's new" release-notes
// modal shortly after launch; its full-screen backdrop swallows taps on the
// screen underneath (e.g. the developer-mode switch) and trips Detox's
// 75% visibility check. Close it before every scenario if it is up.
async function dismissChangelogOverlay() {
    try {
        const overlay = element(by.id('change-log-overlay'));
        await waitFor(overlay).toExist().withTimeout(1500);
        await waitFor(element(by.id('close-change-log-button'))).toBeVisible().withTimeout(5000);
        await element(by.id('close-change-log-button')).tap();
        await waitFor(overlay).not.toExist().withTimeout(5000);
    } catch (e) {
        // overlay was not shown; nothing to dismiss
    }
}

Before(async (context) => {
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
