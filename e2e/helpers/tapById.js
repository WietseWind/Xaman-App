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
            // Truncated dumps still start with <hierarchy and systemui nodes.
            // PIN keys and testIDs sit later; require a closed document.
            if (xml && xml.indexOf('<hierarchy') !== -1 && xml.indexOf('</hierarchy>') !== -1) {
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

const detoxDisconnected = (err) => {
    const m = String((err && err.message) || err);
    return (
        m.indexOf("can't seem to connect") !== -1 ||
        m.indexOf('pending request') !== -1 ||
        m.indexOf('could not be delivered') !== -1
    );
};

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
        const spec = DUMP_SPECS[0];
        let lastXml = '';
        // One dump per attempt. Extra dumpWindowHierarchy calls kill UiAutomation.
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                await ui.dumpWindowHierarchy(spec.abs);
            } catch (e) {
                if (detoxDisconnected(e)) {
                    throw e;
                }
                // eslint-disable-next-line no-console
                console.error('[tapById] dumpWindowHierarchy failed:', spec.abs, String((e && e.message) || e).slice(0, 180));
                await sleep(250);
                continue;
            }
            for (let r = 0; r < 12; r += 1) {
                let xml = '';
                for (let i = 0; i < DUMP_SPECS.length; i += 1) {
                    xml = readDumpFile(DUMP_SPECS[i]);
                    if (xml) {
                        break;
                    }
                }
                if (xml) {
                    lastXml = xml;
                    if (dumpHasAppContent(xml)) {
                        cachedXml = xml;
                        cachedAt = Date.now();
                        return xml;
                    }
                    break;
                }
                await sleep(80);
            }
            await sleep(200);
        }
        return lastXml;
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
    return {
        x: Math.round((x1 + x2) / 2),
        y: Math.round((y1 + y2) / 2),
        x1,
        y1,
        x2,
        y2,
    };
};

const dumpHasRnContent = (xml) => {
    if (!xml || xml.indexOf('</hierarchy>') === -1) {
        return false;
    }
    // Native Metro splash is still com.xrpllabs.xumm — require RN testIDs.
    return (
        xml.indexOf('lock-overlay') !== -1 ||
        xml.indexOf('virtual-keyboard') !== -1 ||
        xml.indexOf('1-key') !== -1 ||
        xml.indexOf('home-tab') !== -1 ||
        xml.indexOf('settings-tab') !== -1 ||
        xml.indexOf('start-button') !== -1 ||
        xml.indexOf('onboarding') !== -1 ||
        xml.indexOf('pin-code') !== -1 ||
        xml.indexOf('account-') !== -1
    );
};

const dumpHasAppContent = (xml) => {
    if (!xml || xml.indexOf('</hierarchy>') === -1) {
        return false;
    }
    if (dumpHasRnContent(xml)) {
        return true;
    }
    const pkgHits = xml.match(/package="com\.xrpllabs\.xumm"/g);
    return !!(pkgHits && pkgHits.length > 2);
};

/** launchApp(sync 0) returns on native splash; wait until JS mounted. */
const waitUntilAndroidRnReady = async (timeoutMs = 120000) => {
    if (device.getPlatform() !== 'android') {
        return;
    }
    const deadline = Date.now() + timeoutMs;
    let lastXml = '';
    while (Date.now() < deadline) {
        cachedXml = '';
        cachedAt = 0;
        lastXml = await androidDumpXml();
        if (dumpHasRnContent(lastXml)) {
            return;
        }
        await sleep(800);
    }
    throw new Error(`android RN UI not ready after launch (${dumpSummary(lastXml)})`);
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
    // Footer testIDs are often missing from the dump; the visible label is not.
    if (testId === 'next-button') {
        aliases.push('Next');
    }
    if (testId === 'finish-button') {
        aliases.push('Finish');
    }
    if (/^\d-key$/.test(testId)) {
        aliases.push(testId[0]);
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
                enabled: attrValue(attrs, 'enabled') !== 'false',
                text: attrValue(attrs, 'text'),
                contentDesc: attrValue(attrs, 'content-desc'),
                resourceId: attrValue(attrs, 'resource-id'),
                package: attrValue(attrs, 'package'),
            });
        }
        m = nodeRe.exec(xml);
    }
    return nodes;
};

const isSystemUiNode = (node) => {
    const pkg = node.package || '';
    const id = node.resourceId || '';
    return (
        pkg === 'com.android.systemui' ||
        pkg.indexOf('systemui') !== -1 ||
        id.indexOf('navigationbar') !== -1 ||
        id.indexOf('navigationBar') !== -1 ||
        id.indexOf('nav_bar') !== -1
    );
};

const pickNodeForTestId = (xml, testId) => {
    if (!xml) {
        return null;
    }
    const nodes = parseNodes(xml).filter((node) => !isSystemUiNode(node));
    const matches = nodes.filter((node) => nodeMatchesTestId(node.attrs, testId));
    // Digit aliases include bare "9". Prefer the real `${n}-key` node so a
    // missed 6th PIN tap is not a click on some other "9" in the dump.
    if (/^\d-key$/.test(testId)) {
        const exact = matches.filter((node) => {
            const tail = resourceIdTail(node.resourceId);
            const desc = node.contentDesc || '';
            return tail === testId || desc === testId;
        });
        if (exact.length) {
            return exact.find((node) => node.clickable) || exact[0];
        }
    }
    return matches.find((node) => node.clickable) || matches[0] || null;
};

const androidBoundsByTestId = async (testId) => {
    const xml = await androidDumpXml();
    const pick = pickNodeForTestId(xml, testId);
    return pick ? pick.bounds : null;
};

const androidReadTextByTestId = async (testId) => {
    const xml = await androidDumpXml();
    const pick = pickNodeForTestId(xml, testId);
    if (!pick) {
        return null;
    }
    if (pick.text || pick.contentDesc) {
        return pick.text || pick.contentDesc;
    }
    const nodes = parseNodes(xml);
    const parts = [];
    for (let i = 0; i < nodes.length; i += 1) {
        const n = nodes[i];
        if (
            n.text &&
            n.bounds.x1 >= pick.bounds.x1 &&
            n.bounds.x2 <= pick.bounds.x2 &&
            n.bounds.y1 >= pick.bounds.y1 &&
            n.bounds.y2 <= pick.bounds.y2
        ) {
            parts.push(n.text);
        }
    }
    return parts.join(' ') || null;
};

const dumpSummary = (xml) => {
    if (!xml) {
        return 'no-xml';
    }
    if (xml.indexOf('</hierarchy>') === -1) {
        return `truncated nodes=${parseNodes(xml).length}`;
    }
    const labels = [];
    const nodes = parseNodes(xml);
    for (let i = 0; i < nodes.length; i += 1) {
        const label = nodes[i].resourceId || nodes[i].contentDesc || nodes[i].text;
        if (!label) {
            continue;
        }
        if (label.indexOf('com.android.systemui') === 0 || label.indexOf('status_bar') !== -1) {
            continue;
        }
        if (labels.indexOf(label) === -1) {
            labels.push(label);
        }
        if (labels.length >= 25) {
            break;
        }
    }
    return labels.join('|') || `nodes=${nodes.length}`;
};

let keypadBounds = null;
let keypadAt = 0;

const refreshKeypadBounds = async () => {
    let pad = {};
    for (let attempt = 0; attempt < 5; attempt += 1) {
        cachedXml = '';
        cachedAt = 0;
        const xml = await androidDumpXml();
        pad = {};
        for (let d = 0; d <= 9; d += 1) {
            const pick = pickNodeForTestId(xml, `${d}-key`);
            if (pick) {
                pad[String(d)] = pick.bounds;
            }
        }
        if (Object.keys(pad).length >= 10) {
            keypadBounds = pad;
            keypadAt = Date.now();
            return pad;
        }
        await sleep(200);
    }
    keypadBounds = pad;
    keypadAt = Date.now();
    return pad;
};

const clearAndroidPasscodePad = async () => {
    cachedXml = '';
    cachedAt = 0;
    const xml = await androidDumpXml();
    const back = pickNodeForTestId(xml, 'x-key');
    if (!back) {
        return;
    }
    for (let i = 0; i < 6; i += 1) {
        await device.getUiDevice().click(back.bounds.x, back.bounds.y);
        await sleep(80);
    }
};

const enterAndroidPasscode = async (code) => {
    const digits = String(code).split('');
    for (let attempt = 0; attempt < 3; attempt += 1) {
        // Always clear first. 5/6 dots after resume + a second entry is Invalid.
        await clearAndroidPasscodePad();
        await sleep(attempt === 0 ? 250 : 500);
        keypadBounds = null;
        keypadAt = 0;
        const pad = await refreshKeypadBounds();
        if (Object.keys(pad).length < 10) {
            await sleep(400);
            continue;
        }
        for (let i = 0; i < digits.length; i += 1) {
            const bounds = pad[digits[i]];
            if (!bounds) {
                throw new Error(`passcode key ${digits[i]} missing from keypad dump (${dumpSummary(cachedXml)})`);
            }
            await device.getUiDevice().click(bounds.x, bounds.y);
            // 150ms still dropped the last digit after 20s background (5/6 dots).
            await sleep(280);
        }
        let retryInvalid = false;
        const goneBy = Date.now() + 4000;
        while (Date.now() < goneBy) {
            cachedXml = '';
            cachedAt = 0;
            const xml = await androidDumpXml();
            if (!xml || !dumpHasAppContent(xml)) {
                await sleep(250);
                continue;
            }
            if (xml.toLowerCase().indexOf('invalid') !== -1) {
                retryInvalid = true;
                await sleep(800);
                break;
            }
            // Unlock pad still up = missed digit. Setup/confirm PIN has no lock-overlay.
            if (xmlHasLockOverlay(xml) && pickNodeForTestId(xml, '1-key')) {
                await sleep(250);
                continue;
            }
            keypadBounds = null;
            keypadAt = 0;
            return;
        }
        if (retryInvalid || (attempt < 2)) {
            continue;
        }
    }
    keypadBounds = null;
    keypadAt = 0;
    throw new Error('passcode did not dismiss lock-overlay');
};

/**
 * Tap a control by testID. Android uses UiDevice hierarchy (no Espresso idle).
 * Digit keys share one keypad dump so PIN entry is not one dump per digit.
 *
 * Never click displayHeight fractions. On 3-button Samsung that is the OS
 * Recents/Home/Back bar (LaunchActivity does not pad those bars). Resolve
 * tabs and footers from the Xaman window dump.
 */
const TAB_LABELS = {
    'tab-Home': ['Home'],
    'tab-Events': ['Events'],
    'tab-XApps': ['xApps', 'XApps', 'xapps'],
    'tab-Settings': ['Settings'],
};

const TAB_SLOT = {
    'tab-Home': 0,
    'tab-Events': 1,
    'tab-XApps': 3,
    'tab-Settings': 4,
};
const TAB_SLOT_COUNT = 5;

let lastStatusBarCollapse = 0;

const collapseAndroidStatusBar = async (xml) => {
    if (!xml) {
        return false;
    }
    const blob = xml.toLowerCase();
    if (
        blob.indexOf('google play services notification') === -1 &&
        blob.indexOf('expandablenotificationrow') === -1 &&
        blob.indexOf('status_bar_latest_event_content') === -1
    ) {
        return false;
    }
    if (Date.now() - lastStatusBarCollapse < 5000) {
        return false;
    }
    lastStatusBarCollapse = Date.now();
    try {
        execFileSync('adb', ['-s', androidSerial(), 'shell', 'cmd', 'statusbar', 'collapse'], { timeout: 3000 });
    } catch (e) {
        try {
            execFileSync('adb', ['-s', androidSerial(), 'shell', 'service', 'call', 'statusbar', '2'], { timeout: 3000 });
        } catch (e2) {
            // no status bar service
        }
    }
    cachedXml = '';
    cachedAt = 0;
    return true;
};

const nodePlainLabel = (node) => {
    const text = (node.text || '').trim();
    if (text) {
        return text;
    }
    return (node.contentDesc || '').trim();
};

const tabClickBounds = (bounds) => ({
    ...bounds,
    // Upper half of the tab item stays above the Samsung 3-button OS nav.
    y: Math.round(bounds.y1 + (bounds.y2 - bounds.y1) * 0.4),
});

const pickTabBarContainer = (nodes) => {
    // RNN `bottomTabs` is the whole window. Only the short nav strip is the bar.
    const strip = (n) => {
        const h = n.bounds.y2 - n.bounds.y1;
        const w = n.bounds.x2 - n.bounds.x1;
        return h >= 40 && h <= 280 && w >= 200;
    };
    const byId = (needles) =>
        nodes.filter((n) => !isSystemUiNode(n) && strip(n) && needles.some((s) => (n.resourceId || '').indexOf(s) !== -1));
    const containers = byId(['bottom_navigation_container']);
    const bars = containers.length ? containers : byId(['bottomTabs', 'bottom_navigation']);
    if (!bars.length) {
        return null;
    }
    return bars.reduce((best, n) => (n.bounds.y1 >= best.bounds.y1 ? n : best));
};

const pickTabNode = (xml, testId) => {
    const labels = TAB_LABELS[testId];
    if (!labels) {
        return pickNodeForTestId(xml, testId);
    }
    const nodes = parseNodes(xml).filter((n) => !isSystemUiNode(n));
    const want = labels.map((label) => label.toLowerCase());
    const labelHits = nodes.filter((n) => want.indexOf(nodePlainLabel(n).toLowerCase()) !== -1);
    if (labelHits.length) {
        const lowest = labelHits.reduce((best, n) => (n.bounds.y1 > best.bounds.y1 ? n : best));
        const item = nodes.find(
            (n) =>
                n.clickable &&
                n.bounds.x1 <= lowest.bounds.x1 &&
                n.bounds.x2 >= lowest.bounds.x2 &&
                n.bounds.y1 <= lowest.bounds.y1 &&
                n.bounds.y2 >= lowest.bounds.y2 &&
                n.bounds.y2 - n.bounds.y1 <= 280 &&
                n.bounds.x2 - n.bounds.x1 <= 420,
        );
        const hit = item || lowest;
        return { ...hit, bounds: tabClickBounds(hit.bounds) };
    }
    const byId = pickNodeForTestId(xml, testId);
    if (byId && byId.bounds.y2 - byId.bounds.y1 <= 280) {
        return { ...byId, bounds: tabClickBounds(byId.bounds) };
    }
    const bar = pickTabBarContainer(nodes);
    if (!bar || TAB_SLOT[testId] === undefined) {
        return null;
    }
    const slot = TAB_SLOT[testId];
    const w = bar.bounds.x2 - bar.bounds.x1;
    const x1 = bar.bounds.x1 + Math.round((slot * w) / TAB_SLOT_COUNT);
    const x2 = bar.bounds.x1 + Math.round(((slot + 1) * w) / TAB_SLOT_COUNT);
    return {
        bounds: tabClickBounds({
            x: Math.round((x1 + x2) / 2),
            y: bar.bounds.y,
            x1,
            y1: bar.bounds.y1,
            x2,
            y2: bar.bounds.y2,
        }),
    };
};

const pickFooterNode = (xml, testId) => {
    const byId = pickNodeForTestId(xml, testId);
    if (byId) {
        return byId;
    }
    const labels = testId === 'next-button' ? ['Next'] : testId === 'finish-button' ? ['Finish'] : [];
    if (!labels.length) {
        return null;
    }
    const nodes = parseNodes(xml).filter((n) => !isSystemUiNode(n) && n.clickable);
    const hits = nodes.filter((n) => labels.some((label) => (n.text || '') === label));
    if (!hits.length) {
        return null;
    }
    return hits.reduce((best, n) => (n.bounds.y > best.bounds.y ? n : best));
};

const clickByTestId = async (testId) => {
    const el = element(by.id(testId));
    if (device.getPlatform() !== 'android') {
        await el.tap();
        return;
    }
    if (/^\d-key$/.test(testId)) {
        if (!keypadBounds || Date.now() - keypadAt > 4000) {
            await refreshKeypadBounds();
        }
        const bounds = keypadBounds[testId[0]];
        if (!bounds) {
            throw new Error(`android hierarchy has no bounds for ${testId}`);
        }
        await device.getUiDevice().click(bounds.x, bounds.y);
        return;
    }
    let xml = await androidDumpXml();
    if (TAB_LABELS[testId]) {
        if (await collapseAndroidStatusBar(xml)) {
            xml = await androidDumpXml();
        }
        const tab = pickTabNode(xml, testId);
        if (!tab) {
            throw new Error(`android hierarchy has no app tab for ${testId} (${dumpSummary(xml)})`);
        }
        await device.getUiDevice().click(tab.bounds.x, tab.bounds.y);
        return;
    }
    if (testId === 'next-button' || testId === 'finish-button') {
        const footer = pickFooterNode(xml, testId);
        if (footer) {
            await device.getUiDevice().click(footer.bounds.x, footer.bounds.y);
            return;
        }
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

const E2E_PASSCODE = '167349';

const xmlHasLockOverlay = (xml) => {
    if (!xml) {
        return false;
    }
    return !!pickNodeForTestId(xml, 'lock-overlay');
};

const clickDumpLabel = async (xml, label) => {
    if (!xml || !label) {
        return false;
    }
    const want = String(label).toLowerCase();
    const nodes = parseNodes(xml);
    const pick =
        nodes.find((n) => n.clickable && (n.text || '').toLowerCase() === want) ||
        nodes.find((n) => (n.text || '').toLowerCase() === want);
    if (!pick) {
        return false;
    }
    await device.getUiDevice().click(pick.bounds.x, pick.bounds.y);
    cachedXml = '';
    cachedAt = 0;
    return true;
};

const clickAndroidLabel = async (label) => {
    cachedXml = '';
    cachedAt = 0;
    const xml = await androidDumpXml();
    return clickDumpLabel(xml, label);
};

const androidDumpIncludes = async (snippet) => {
    const xml = await androidDumpXml();
    if (!xml || !snippet) {
        return false;
    }
    return xml.toLowerCase().indexOf(String(snippet).toLowerCase()) !== -1;
};

const dismissAndroidWipeDialog = async (xml) => {
    if (!xml) {
        return false;
    }
    const blob = xml.toLowerCase();
    if (blob.indexOf('wipe xaman') === -1 && blob.indexOf('could not be decrypted') === -1) {
        return false;
    }
    if (await clickDumpLabel(xml, 'WIPE XAMAN')) {
        await sleep(800);
        return true;
    }
    return false;
};

/** Gboard "Try out your stylus" covers Next and steals typed label text. */
const dismissAndroidImeChrome = async (xml) => {
    if (!xml) {
        return false;
    }
    const blob = xml.toLowerCase();
    if (blob.indexOf('try out your stylus') === -1 && blob.indexOf('write here') === -1) {
        return false;
    }
    if (await clickDumpLabel(xml, 'Cancel')) {
        return true;
    }
    try {
        execFileSync('adb', ['-s', androidSerial(), 'shell', 'input', 'keyevent', '4'], { timeout: 4000 });
    } catch (e) {
        // BACK already down
    }
    cachedXml = '';
    cachedAt = 0;
    return true;
};

const disableAndroidStylusHandwriting = () => {
    try {
        execFileSync(
            'adb',
            ['-s', androidSerial(), 'shell', 'settings', 'put', 'secure', 'stylus_handwriting_enabled', '0'],
            { timeout: 4000 },
        );
    } catch (e) {
        // ignore
    }
};

const waitUntilAndroidTestId = async (testId, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    let lastXml = '';
    const dismissOverlay = testId.indexOf('home-tab') === 0 || testId.indexOf('tab-') === 0;
    const unlockIfBlocking =
        dismissOverlay ||
        testId === 'settings-tab-screen' ||
        testId === 'accounts-list-screen' ||
        testId === 'accounts-button';
    while (Date.now() < deadline) {
        lastXml = await androidDumpXml();
        if (await dismissAndroidWipeDialog(lastXml)) {
            await sleep(500);
            continue;
        }
        // Samsung keeps GMS rows in the dump after collapse; do not continue.
        await collapseAndroidStatusBar(lastXml);
        // Push opt-in and biometric setup sit between PIN and ToS.
        // Physical devices use skip-button; emu used maybe-later-button.
        if (
            pickNodeForTestId(lastXml, 'maybe-later-button') ||
            pickNodeForTestId(lastXml, 'permission-setup-view') ||
            pickNodeForTestId(lastXml, 'biometric-setup-view') ||
            pickNodeForTestId(lastXml, 'skip-button')
        ) {
            const later =
                pickNodeForTestId(lastXml, 'maybe-later-button') ||
                pickNodeForTestId(lastXml, 'skip-button');
            if (later) {
                await device.getUiDevice().click(later.bounds.x, later.bounds.y);
                cachedXml = '';
                cachedAt = 0;
                await sleep(500);
                continue;
            }
            if (await clickDumpLabel(lastXml, 'Maybe later')) {
                cachedXml = '';
                cachedAt = 0;
                await sleep(500);
                continue;
            }
        }
        if (lastXml.toLowerCase().indexOf('alerttitle') !== -1 || lastXml.toLowerCase().indexOf('do not match') !== -1) {
            if (await clickDumpLabel(lastXml, 'OK')) {
                await sleep(300);
                continue;
            }
        }
        if (await dismissAndroidImeChrome(lastXml)) {
            await sleep(300);
            continue;
        }
        if (
            (testId === 'next-button' || testId === 'finish-button') &&
            lastXml.indexOf('inputmethod.latin') !== -1 &&
            !pickNodeForTestId(lastXml, testId)
        ) {
            // BACK pops import/generate (Upgrade Account). ESC blurs IME only.
            try {
                execFileSync('adb', ['-s', androidSerial(), 'shell', 'input', 'keyevent', '111'], { timeout: 4000 });
            } catch (e) {
                // IME
            }
            cachedXml = '';
            cachedAt = 0;
            await sleep(300);
            continue;
        }
        if (dismissOverlay) {
            await tapByTestIdIfPresent('close-change-log-button', 400);
        }
        if (lastXml) {
            const pick = pickNodeForTestId(lastXml, testId);
            if (pick) {
                return;
            }
            if (TAB_LABELS[testId] && pickTabNode(lastXml, testId)) {
                return;
            }
            if ((testId === 'next-button' || testId === 'finish-button') && pickFooterNode(lastXml, testId)) {
                return;
            }
        }
        // Do not auto-unlock AuthenticateOverlay (same testID) during signing.
        if (unlockIfBlocking && xmlHasLockOverlay(lastXml) && pickNodeForTestId(lastXml, '1-key')) {
            await enterAndroidPasscode(E2E_PASSCODE);
            await sleep(400);
            cachedXml = '';
            cachedAt = 0;
            continue;
        }
        await sleep(400);
    }
    throw new Error(`android hierarchy timed out waiting for ${testId} (${dumpSummary(lastXml)})`);
};

const unlockAndroidPasscodeIfPresent = async () => {
    if (device.getPlatform() !== 'android') {
        return false;
    }
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
        cachedXml = '';
        cachedAt = 0;
        const xml = await androidDumpXml();
        if (xmlHasLockOverlay(xml)) {
            await enterAndroidPasscode(E2E_PASSCODE);
            const goneBy = Date.now() + 5000;
            while (Date.now() < goneBy) {
                cachedXml = '';
                cachedAt = 0;
                const after = await androidDumpXml();
                if (!xmlHasLockOverlay(after)) {
                    return true;
                }
                await sleep(300);
            }
            return true;
        }
        if (dumpHasAppContent(xml) && !xmlHasLockOverlay(xml)) {
            return false;
        }
        await sleep(300);
    }
    return false;
};

const androidHasTestId = async (testId) => {
    const xml = await androidDumpXml();
    return !!pickNodeForTestId(xml, testId);
};

const androidSwipeTestId = async (testId, direction) => {
    await waitUntilAndroidTestId(testId, 10000);
    const bounds = await androidBoundsByTestId(testId);
    if (!bounds) {
        throw new Error(`android hierarchy has no bounds for ${testId}`);
    }
    const ui = device.getUiDevice();
    if (direction === 'right') {
        // accept-button testID is the thumb, not the track. Swipe across the
        // review sheet, not the full display (OS nav sits to the right/bottom).
        const xml = await androidDumpXml();
        const sheet =
            pickNodeForTestId(xml, 'review-transaction-modal') ||
            pickNodeForTestId(xml, 'review-content-container');
        const startX = Math.round(bounds.x1 + Math.min(24, Math.max(8, (bounds.x2 - bounds.x1) / 2)));
        const endX = sheet
            ? Math.max(startX + 200, sheet.bounds.x2 - 24)
            : Math.max(startX + 200, bounds.x2 + (bounds.x2 - bounds.x1) * 6);
        await ui.swipe(startX, bounds.y, endX, bounds.y, 80);
        return;
    }
    if (direction === 'up') {
        await ui.swipe(bounds.x, bounds.y2 - 20, bounds.x, bounds.y1 + 20, 40);
        return;
    }
    await ui.swipe(bounds.x, bounds.y1 + 20, bounds.x, bounds.y2 - 20, 40);
};

/**
 * Type into the focused Android field. Quote for device sh so
 * `& ; < > | #` in Extra Security passphrases are not split.
 * `input text` maps `%s` to space.
 */
const androidTypeText = (value) => {
    const encoded = String(value).replace(/ /g, '%s');
    const quoted = `'${encoded.replace(/'/g, `'\\''`)}'`;
    execFileSync('adb', ['-s', androidSerial(), 'shell', `input text ${quoted}`], { timeout: 8000 });
};

const clickNearestEdit = async (nodes, target) => {
    if (!target) {
        return false;
    }
    const edits = nodes.filter(
        (n) => n.clickable && ((n.text || '') === 'Edit' || resourceIdTail(n.resourceId).indexOf('account-') === 0),
    );
    if (!edits.length) {
        return false;
    }
    let best = edits[0];
    let bestDist = Math.abs(best.bounds.y - target.bounds.y);
    for (let i = 1; i < edits.length; i += 1) {
        const dist = Math.abs(edits[i].bounds.y - target.bounds.y);
        if (dist < bestDist) {
            best = edits[i];
            bestDist = dist;
        }
    }
    await device.getUiDevice().click(best.bounds.x, best.bounds.y);
    return true;
};

// FlatList only mounts on-screen rows. After 03 the target (I-ReadOnly) is below the fold.
const swipeAccountListUp = async (xml) => {
    const ui = device.getUiDevice();
    const list = xml ? pickNodeForTestId(xml, 'account-list-scroll') : null;
    cachedXml = '';
    cachedAt = 0;
    const screen =
        list ||
        (xml && pickNodeForTestId(xml, 'accounts-list-screen')) ||
        (xml && pickNodeForTestId(xml, 'home-tab-view'));
    if (!screen) {
        await sleep(500);
        return;
    }
    const b = screen.bounds;
    const startY = Math.max(b.y1 + 80, b.y2 - 80);
    const endY = b.y1 + 80;
    await ui.swipe(b.x, startY, b.x, endY, 70);
    await sleep(500);
};

const clickAndroidAccountRow = async (address, label) => {
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
        const xml = await androidDumpXml();
        if (address && pickNodeForTestId(xml, `account-${address}`)) {
            await clickByTestId(`account-${address}`);
            return;
        }
        const nodes = parseNodes(xml);
        if (address) {
            const addrNode = nodes.find((n) => n.text && n.text.indexOf(address) !== -1);
            if (await clickNearestEdit(nodes, addrNode)) {
                return;
            }
        }
        if (label) {
            const title = nodes.find((n) => (n.text || '') === label);
            if (await clickNearestEdit(nodes, title)) {
                return;
            }
        }
        await swipeAccountListUp(xml);
    }
    throw new Error(`android account row not found (${address || label || ''})`);
};

const clearAndroidBlockingDialogs = async () => {
    for (let i = 0; i < 5; i += 1) {
        cachedXml = '';
        cachedAt = 0;
        const xml = await androidDumpXml();
        if (!(await dismissAndroidWipeDialog(xml))) {
            return;
        }
        await sleep(500);
    }
};

module.exports = {
    clickByTestId,
    tapByTestIdIfPresent,
    waitUntilAndroidTestId,
    waitUntilAndroidRnReady,
    unlockAndroidPasscodeIfPresent,
    enterAndroidPasscode,
    androidReadTextByTestId,
    androidHasTestId,
    androidSwipeTestId,
    androidTypeText,
    androidDumpIncludes,
    clickAndroidLabel,
    disableAndroidStylusHandwriting,
    clickAndroidAccountRow,
    dismissAndroidWipeDialog,
    clearAndroidBlockingDialogs,
};
