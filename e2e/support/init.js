const detox = require('detox/internals');

const { device } = require('detox');
const { Before, BeforeAll, AfterAll, After } = require('@cucumber/cucumber');
const adapter = require('./adapter');

const { setDeviceUdid, startRecordingVideo, stopRecordingVideo } = require('../helpers/artifacts');
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

    // start device log
    startDeviceLogStream(device.id);

    // start recording video
    startRecordingVideo();

    await device.launchApp({
        newInstance: true,
        permissions: { notifications: 'YES', camera: 'YES' },
        disableTouchIndicators: false,
    });

    await device.setURLBlacklist(['.*xumm.app.*', '.*xaman.app.*']);
});

Before(async (context) => {
    await adapter.beforeEach(context);
});

After(async (context) => {
    await adapter.afterEach(context);
});

AfterAll(async () => {
    // clean up
    await detox.cleanup();

    // stop recording
    stopRecordingVideo();
});
