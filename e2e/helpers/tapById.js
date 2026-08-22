const { execFileSync } = require('child_process');
const { element, by, waitFor, device } = require('detox');

const HIERARCHY_PATH = '/data/local/tmp/xaman-detox-ui.xml';

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const androidSerial = () => process.env.ANDROID_SERIAL || device.id;

/**
 * Tap a control by testID. Android uses the element's own frame (getAttributes)
 * then UiDevice.click. Never use hardcoded pixels or `adb uiautomator dump`
 * (that dump steals Detox's UiAutomation slot).
 */
const clickByTestId = async (testId) => {
    const el = element(by.id(testId));
    if (device.getPlatform() !== 'android') {
        await el.tap();
        return;
    }
    try {
        const attrs = await el.getAttributes();
        const frame = attrs.frame || {};
        const width = Number(frame.width || 0);
        const height = Number(frame.height || 0);
        const x = Math.round(Number(frame.x || 0) + width / 2);
        const y = Math.round(Number(frame.y || 0) + Math.min(height / 2, 48));
        await device.getUiDevice().click(x, y);
    } catch (e) {
        const bounds = await androidBoundsByTestId(testId);
        if (bounds) {
            await device.getUiDevice().click(bounds.x, bounds.y);
            return;
        }
        await el.tap();
    }
};

const tapByTestIdIfPresent = async (testId, timeoutMs = 1500) => {
    if (device.getPlatform() === 'android') {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const bounds = await androidBoundsByTestId(testId);
            if (bounds) {
                await device.getUiDevice().click(bounds.x, bounds.y);
                return true;
            }
            await sleep(400);
        }
        return false;
    }
    try {
        await waitFor(element(by.id(testId))).toExist().withTimeout(timeoutMs);
        await clickByTestId(testId);
        return true;
    } catch (e) {
        return false;
    }
};

/**
 * Dump via Detox's UiDevice (same UiAutomation as the agent). Do not call
 * `adb shell uiautomator dump` — that disconnects Detox.
 */
const androidDumpXml = async () => {
    const serial = androidSerial();
    try {
        execFileSync('adb', ['-s', serial, 'shell', 'rm', '-f', HIERARCHY_PATH], { timeout: 5000 });
        await device.getUiDevice().dumpWindowHierarchy(HIERARCHY_PATH);
        try {
            return execFileSync('adb', ['-s', serial, 'shell', 'cat', HIERARCHY_PATH], {
                encoding: 'utf8',
                timeout: 8000,
                maxBuffer: 12 * 1024 * 1024,
            });
        } catch (e) {
            return execFileSync(
                'adb',
                ['-s', serial, 'shell', 'run-as', 'com.xrpllabs.xumm.test', 'cat', HIERARCHY_PATH],
                { encoding: 'utf8', timeout: 8000, maxBuffer: 12 * 1024 * 1024 },
            );
        }
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[tapById] dumpWindowHierarchy failed:', String((e && e.message) || e).slice(0, 200));
        return '';
    }
};

const androidBoundsByTestId = async (testId) => {
    const xml = await androidDumpXml();
    if (!xml) {
        return null;
    }
    const escaped = testId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`resource-id="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`);
    const re2 = new RegExp(`bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"[^>]*resource-id="${escaped}"`);
    const m = xml.match(re) || xml.match(re2);
    if (!m) {
        return null;
    }
    const x1 = Number(m[1]);
    const y1 = Number(m[2]);
    const x2 = Number(m[3]);
    const y2 = Number(m[4]);
    return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) };
};

const waitUntilAndroidTestId = async (testId, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        await tapByTestIdIfPresent('close-change-log-button', 600);
        const bounds = await androidBoundsByTestId(testId);
        if (bounds) {
            return;
        }
        await sleep(800);
    }
    throw new Error(`android hierarchy timed out waiting for ${testId}`);
};

module.exports = {
    clickByTestId,
    tapByTestIdIfPresent,
    waitUntilAndroidTestId,
};
