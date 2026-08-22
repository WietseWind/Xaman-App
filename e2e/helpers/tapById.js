const { execFileSync } = require('child_process');
const { element, by, waitFor, device } = require('detox');

const APP_ID = 'com.xrpllabs.xumm';
const TEST_ID = 'com.xrpllabs.xumm.test';
const DUMP_NAME = 'xaman-detox-ui.xml';

const DUMP_SPECS = [
    { abs: `/data/user/0/${APP_ID}/cache/${DUMP_NAME}`, pkg: APP_ID, rel: `cache/${DUMP_NAME}` },
    { abs: `/data/data/${APP_ID}/cache/${DUMP_NAME}`, pkg: APP_ID, rel: `cache/${DUMP_NAME}` },
    { abs: `/data/user/0/${TEST_ID}/cache/${DUMP_NAME}`, pkg: TEST_ID, rel: `cache/${DUMP_NAME}` },
    { abs: `/data/data/${TEST_ID}/cache/${DUMP_NAME}`, pkg: TEST_ID, rel: `cache/${DUMP_NAME}` },
];

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const androidSerial = () => process.env.ANDROID_SERIAL || device.id;

const adbOut = (args, timeout = 8000) =>
    execFileSync('adb', ['-s', androidSerial(), ...args], {
        encoding: 'utf8',
        timeout,
        maxBuffer: 12 * 1024 * 1024,
    });

let compressedOff = false;

const ensureUncompressedDump = async () => {
    if (compressedOff) {
        return;
    }
    try {
        await device.getUiDevice().setCompressedLayoutHeirarchy(false);
        compressedOff = true;
    } catch (e) {
        compressedOff = true;
    }
};

const readDumpFile = (spec) => {
    const attempts = [
        ['exec-out', 'run-as', spec.pkg, 'cat', spec.rel],
        ['shell', 'run-as', spec.pkg, 'cat', spec.rel],
        ['exec-out', 'cat', spec.abs],
        ['shell', 'cat', spec.abs],
    ];
    for (let i = 0; i < attempts.length; i += 1) {
        try {
            const xml = adbOut(attempts[i]);
            if (xml && xml.indexOf('<hierarchy') !== -1 && xml.length > 200) {
                return xml;
            }
        } catch (e) {
            // next reader
        }
    }
    return '';
};

/**
 * Dump via Detox UiDevice (same UiAutomation as the agent). Do not call
 * `adb shell uiautomator dump` — that disconnects Detox.
 * Write under the app/test cache: /data/local/tmp is not writable by the
 * instrumentation UID on API 36, so the file never appears.
 */
const androidDumpXml = async () => {
    await ensureUncompressedDump();
    const ui = device.getUiDevice();
    for (let i = 0; i < DUMP_SPECS.length; i += 1) {
        const spec = DUMP_SPECS[i];
        try {
            await ui.dumpWindowHierarchy(spec.abs);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('[tapById] dumpWindowHierarchy failed:', spec.abs, String((e && e.message) || e).slice(0, 180));
            continue;
        }
        const xml = readDumpFile(spec);
        if (xml) {
            return xml;
        }
    }
    // eslint-disable-next-line no-console
    console.error('[tapById] dumpWindowHierarchy produced no readable hierarchy');
    return '';
};

const attrValue = (attrs, name) => {
    const m = attrs.match(new RegExp(`\\b${name}="([^"]*)"`));
    return m ? m[1] : '';
};

const resourceIdTail = (resourceId) => {
    const idx = resourceId.lastIndexOf(':id/');
    return idx >= 0 ? resourceId.slice(idx + 4) : resourceId;
};

const boundsFromAttrs = (attrs) => {
    const m = attrs.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!m) {
        return null;
    }
    const x1 = Number(m[1]);
    const y1 = Number(m[2]);
    const x2 = Number(m[3]);
    const y2 = Number(m[4]);
    if (x2 <= x1 || y2 <= y1) {
        return null;
    }
    return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) };
};

const androidBoundsByTestId = async (testId) => {
    const xml = await androidDumpXml();
    if (!xml) {
        return null;
    }
    const nodeRe = /<node\b([^>]*)\/?>/g;
    let m = nodeRe.exec(xml);
    while (m) {
        const attrs = m[1];
        const resourceId = attrValue(attrs, 'resource-id');
        const contentDesc = attrValue(attrs, 'content-desc');
        if (resourceIdTail(resourceId) === testId || contentDesc === testId || resourceId === testId) {
            const bounds = boundsFromAttrs(attrs);
            if (bounds) {
                return bounds;
            }
        }
        m = nodeRe.exec(xml);
    }
    if (testId === 'close-change-log-button') {
        nodeRe.lastIndex = 0;
        m = nodeRe.exec(xml);
        while (m) {
            const attrs = m[1];
            if (attrValue(attrs, 'text') === 'Close' || attrValue(attrs, 'content-desc') === 'Close') {
                const bounds = boundsFromAttrs(attrs);
                if (bounds) {
                    return bounds;
                }
            }
            m = nodeRe.exec(xml);
        }
    }
    return null;
};

/**
 * Tap a control by testID. Android uses UiDevice hierarchy (no Espresso idle).
 * Never use hardcoded pixels or `adb uiautomator dump`.
 */
const clickByTestId = async (testId) => {
    const el = element(by.id(testId));
    if (device.getPlatform() !== 'android') {
        await el.tap();
        return;
    }
    const bounds = await androidBoundsByTestId(testId);
    if (bounds) {
        await device.getUiDevice().click(bounds.x, bounds.y);
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
