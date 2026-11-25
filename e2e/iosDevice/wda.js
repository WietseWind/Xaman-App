/**
 * Client for WebDriverAgent (WDA), the XCUITest server that drives a physical iPhone.
 *
 * Detox drives iOS simulators only. For a phone on USB the suite talks to WDA instead; ./detox.js
 * translates the Detox calls of the steps into the requests below. The runner starts WDA on the
 * phone and gives its address in E2E_WDA_URL.
 */
const BUNDLE_ID = 'com.xrpllabs.xumm';

const base = () => {
    const url = process.env.E2E_WDA_URL;
    if (!url) {
        throw new Error(
            'e2e on an iPhone: E2E_WDA_URL is not set (the runner sets it: run-throwaway.sh ios --device UDID)',
        );
    }
    return url.replace(/\/$/, '');
};

let sessionId = null;

const request = async (method, path, body, timeoutMs = 60000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    let text;
    try {
        response = await fetch(`${base()}${path}`, {
            method,
            headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal,
        });
        text = await response.text();
    } catch (e) {
        throw new Error(`WDA ${method} ${path}: no answer (${e.name === 'AbortError' ? `${timeoutMs} ms` : e.message})`);
    } finally {
        clearTimeout(timer);
    }
    let json;
    try {
        json = JSON.parse(text);
    } catch (e) {
        throw new Error(`WDA ${method} ${path}: answer is not JSON (${String(text).slice(0, 120)})`);
    }
    const { value } = json;
    if (value && typeof value === 'object' && value.error) {
        const error = new Error(`WDA ${method} ${path}: ${value.error}: ${String(value.message || '').split('\n')[0]}`);
        error.wda = value.error;
        throw error;
    }
    return json;
};

const inSession = (path) => {
    if (!sessionId) {
        throw new Error('e2e on an iPhone: no WDA session yet (detox.init was not called)');
    }
    return `/session/${sessionId}${path}`;
};

const SETTINGS = {
    // RN nests views deeply: the default depth (50) cuts the tree off inside some screens
    snapshotMaxDepth: 62,
    // the steps wait for what they need themselves; WDA's own idle waits only cost time (and
    // never end on a screen with a running animation)
    waitForIdleTimeout: 0,
    animationCoolOffTimeout: 0,
    shouldUseCompactResponses: true,
    // text arrives as typed
    keyboardAutocorrection: false,
    keyboardPrediction: false,
    // keys per second. At 15 and 30 a controlled text field of the app lost characters right after
    // the first one of a word ("elevator" arrived as "elvator"); at 8 it lost none.
    maxTypingFrequency: 8,
    screenshotQuality: 2,
};

const start = async () => {
    const status = await request('GET', '/status', undefined, 15000);
    if (!status.value || status.value.ready !== true) {
        throw new Error('WDA on the iPhone is not ready');
    }
    const created = await request('POST', '/session', { capabilities: { alwaysMatch: {} } }, 60000);
    sessionId = created.sessionId || (created.value && created.value.sessionId);
    await request('POST', inSession('/appium/settings'), { settings: SETTINGS });
    return status.value;
};

const stop = async () => {
    if (!sessionId) {
        return;
    }
    const id = sessionId;
    sessionId = null;
    try {
        await request('DELETE', `/session/${id}`, undefined, 15000);
    } catch (e) {
        // the session goes with WDA anyway
    }
};

const elementId = (entry) => entry && (entry.ELEMENT || entry['element-6066-11e4-a52e-4f735466cecf']);

// every element that matches, in screen-tree order
const find = async (using, value) => {
    const found = await request('POST', inSession('/elements'), { using, value });
    return (found.value || []).map(elementId).filter(Boolean);
};

const el = (id, path = '') => inSession(`/element/${id}${path}`);
const wdaEl = (id, path) => inSession(`/wda/element/${id}${path}`);

module.exports = {
    BUNDLE_ID,
    start,
    stop,
    find,
    click: (id) => request('POST', el(id, '/click'), {}),
    rect: async (id) => (await request('GET', el(id, '/rect'))).value,
    attribute: async (id, name) => (await request('GET', el(id, `/attribute/${name}`))).value,
    displayed: async (id) => (await request('GET', el(id, '/displayed'))).value === true,
    clear: (id) => request('POST', el(id, '/clear'), {}),
    type: (id, text) => request('POST', el(id, '/value'), { text: String(text) }, 180000),
    keys: (text) => request('POST', inSession('/wda/keys'), { value: Array.from(String(text)) }, 180000),
    tapAt: (x, y) => request('POST', inSession('/wda/tap'), { x, y }),
    touchAndHold: (id, seconds) => request('POST', wdaEl(id, '/touchAndHold'), { duration: seconds }),
    tapTimes: (id, times) =>
        request('POST', wdaEl(id, '/tapWithNumberOfTaps'), { numberOfTaps: times, numberOfTouches: 1 }),
    swipe: (id, direction, velocity) => request('POST', wdaEl(id, '/swipe'), { direction, velocity }),
    drag: (fromX, fromY, toX, toY, holdSeconds = 0.05) =>
        request('POST', inSession('/wda/dragfromtoforduration'), { fromX, fromY, toX, toY, duration: holdSeconds }),
    windowRect: async () => (await request('GET', inSession('/window/rect'))).value,
    launch: (args, environment) =>
        request(
            'POST',
            inSession('/wda/apps/launch'),
            {
                bundleId: BUNDLE_ID,
                arguments: args || [],
                environment: environment || {},
                shouldWaitForQuiescence: false,
            },
            120000,
        ),
    activate: (bundleId = BUNDLE_ID) => request('POST', inSession('/wda/apps/activate'), { bundleId }, 60000),
    terminate: (bundleId = BUNDLE_ID) => request('POST', inSession('/wda/apps/terminate'), { bundleId }, 60000),
    // 1 not running, 2 background (suspended), 3 background, 4 foreground
    appState: async (bundleId = BUNDLE_ID) => (await request('POST', inSession('/wda/apps/state'), { bundleId })).value,
    home: () => request('POST', '/wda/homescreen', {}),
    openUrl: (url) => request('POST', inSession('/url'), { url }, 60000),
    alertText: async () => {
        try {
            return (await request('GET', inSession('/alert/text'), undefined, 20000)).value;
        } catch (e) {
            if (e.wda === 'no such alert') {
                return null;
            }
            throw e;
        }
    },
    alertButtons: async () => (await request('GET', inSession('/wda/alert/buttons'), undefined, 20000)).value || [],
    alertAccept: (name) => request('POST', inSession('/alert/accept'), name ? { name } : {}),
    screenshot: async () => Buffer.from((await request('GET', '/screenshot', undefined, 30000)).value, 'base64'),
    source: async (format = 'description') => (await request('GET', inSession(`/source?format=${format}`), undefined, 120000)).value,
};
