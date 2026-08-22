const { execFileSync } = require('child_process');
const { element, by, waitFor, device } = require('detox');

const APP_ID = 'com.xrpllabs.xumm';
const DUMP_NAME = 'xaman-detox-ui.xml';

const DUMP_SPECS = [
    { abs: `/data/user/0/${APP_ID}/cache/${DUMP_NAME}`, pkg: APP_ID, rel: `cache/${DUMP_NAME}` },
    { abs: `/data/data/${APP_ID}/cache/${DUMP_NAME}`, pkg: APP_ID, rel: `cache/${DUMP_NAME}` },
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
let cachedXml = '';
let cachedAt = 0;
let dumpLock = Promise.resolve();

const androidDumpXml = async () => {
    if (cachedXml && Date.now() - cachedAt < 400) {
        return cachedXml;
    }
    const run = dumpLock.then(async () => {
        if (cachedXml && Date.now() - cachedAt < 400) {
            return cachedXml;
        }
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
                cachedXml = xml;
                cachedAt = Date.now();
                return xml;
            }
        }
        // eslint-disable-next-line no-console
        console.error('[tapById] dumpWindowHierarchy produced no readable hierarchy');
        return '';
    });
    dumpLock = run.catch(() => '');
    return run;
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

const aliasesForTestId = (testId) => {
    const aliases = [testId];
    if (testId.indexOf('tab-') === 0) {
        const name = testId.slice(4);
        aliases.push(name, name.toLowerCase());
        if (name === 'XApps') {
            aliases.push('xApps', 'xapps');
        }
    }
    if (testId === 'close-change-log-button') {
        aliases.push('Close', 'close');
    }
    return aliases;
};

const nodeHaystack = (attrs) => {
    const resourceId = attrValue(attrs, 'resource-id');
    return [
        resourceIdTail(resourceId),
        resourceId,
        attrValue(attrs, 'content-desc'),
        attrValue(attrs, 'text'),
    ];
};

const nodeMatchesTestId = (attrs, testId) => {
    const aliases = aliasesForTestId(testId);
    const values = nodeHaystack(attrs);
    for (let i = 0; i < aliases.length; i += 1) {
        const alias = aliases[i];
        for (let j = 0; j < values.length; j += 1) {
            if (values[j] && values[j].toLowerCase() === alias.toLowerCase()) {
                return true;
            }
        }
    }
    return false;
};

const parseNodes = (xml) => {
    const nodes = [];
    const nodeRe = /<node\b([^>]*)\/?>/g;
    let m = nodeRe.exec(xml);
    while (m) {
        const attrs = m[1];
        const bounds = boundsFromAttrs(attrs);
        if (bounds) {
            nodes.push({
                attrs,
                bounds,
                clickable: attrValue(attrs, 'clickable') === 'true',
                text: attrValue(attrs, 'text'),
                contentDesc: attrValue(attrs, 'content-desc'),
                resourceId: attrValue(attrs, 'resource-id'),
            });
        }
        m = nodeRe.exec(xml);
    }
    return nodes;
};

const androidBoundsByTestId = async (testId) => {
    const xml = await androidDumpXml();
    if (!xml) {
        return null;
    }
    const nodes = parseNodes(xml);
    const matches = nodes.filter((node) => nodeMatchesTestId(node.attrs, testId));
    const clickable = matches.filter((node) => node.clickable);
    const pick = clickable[0] || matches[0];
    return pick ? pick.bounds : null;
};

const dumpSummary = (xml) => {
    if (!xml) {
        return 'no-xml';
    }
    const labels = [];
    const nodes = parseNodes(xml);
    for (let i = 0; i < nodes.length; i += 1) {
        const label = nodes[i].resourceId || nodes[i].contentDesc || nodes[i].text;
        if (label && labels.indexOf(label) === -1) {
            labels.push(label);
        }
        if (labels.length >= 25) {
            break;
        }
    }
    return labels.join('|') || `nodes=${nodes.length}`;
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
    let bounds = await androidBoundsByTestId(testId);
    if (!bounds) {
        await sleep(400);
        bounds = await androidBoundsByTestId(testId);
    }
    if (!bounds) {
        throw new Error(`android hierarchy has no bounds for ${testId}`);
    }
    await device.getUiDevice().click(bounds.x, bounds.y);
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
    let lastXml = '';
    while (Date.now() < deadline) {
        await tapByTestIdIfPresent('close-change-log-button', 600);
        lastXml = await androidDumpXml();
        if (lastXml) {
            const nodes = parseNodes(lastXml);
            const matches = nodes.filter((node) => nodeMatchesTestId(node.attrs, testId));
            const pick = matches.find((node) => node.clickable) || matches[0];
            if (pick) {
                return;
            }
        }
        await sleep(800);
    }
    throw new Error(`android hierarchy timed out waiting for ${testId} (${dumpSummary(lastXml)})`);
};

module.exports = {
    clickByTestId,
    tapByTestIdIfPresent,
    waitUntilAndroidTestId,
};
