/**
 * The part of the Detox API that the steps use, for a physical iPhone.
 *
 * Detox drives iOS simulators only. With E2E_IOS_DEVICE set, ./register.js makes `require('detox')`
 * and `require('detox/internals')` give this module, and the same steps then run on the phone
 * through WebDriverAgent (./wda.js). Simulator and Android runs never load this file.
 *
 * Differences from Detox that matter to the steps:
 * - WDA sees the accessibility tree, as a user of VoiceOver does; Detox sees every view.
 * - text is typed with the keyboard of the phone (replaceText clears the field and types).
 * - there is no synchronization with the app: every wait is an explicit one, as it already is
 *   in this suite (it runs with Detox synchronization off).
 */
const wda = require('./wda');
const aliasFor = require('./aliases');

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const quote = (value) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const UDID = () => process.env.E2E_IOS_DEVICE;

// --- matchers ---------------------------------------------------------------------------------

// Detox matches on native view classes; these are the ones the steps name
const TYPES = {
    // a button of a native alert
    _UIAlertControllerActionView: { chain: '**/XCUIElementTypeAlert/**/XCUIElementTypeButton' },
};

const matcher = (parts) => ({
    parts,
    and(other) {
        return matcher({
            predicates: [...parts.predicates, ...other.parts.predicates],
            chain: parts.chain || other.parts.chain,
            keyboardKey: parts.keyboardKey || other.parts.keyboardKey,
        });
    },
});

const by = {
    id: (id) => matcher({ predicates: [`name == ${quote(id)}`], id }),
    text: (text) => matcher({ predicates: [`(label == ${quote(text)} OR value == ${quote(text)})`], text }),
    label: (label) => matcher({ predicates: [`label ==[c] ${quote(label)}`] }),
    type: (type) => {
        if (!TYPES[type]) {
            throw new Error(`e2e on an iPhone: by.type('${type}') has no XCUITest equivalent yet (e2e/iosDevice/detox.js)`);
        }
        return matcher({ predicates: [], chain: TYPES[type].chain });
    },
    // only on a physical iPhone: an NSPredicate over what WebDriverAgent knows of an element
    // (type, name, label, value, enabled, visible)
    iosPredicate: (predicate) => matcher({ predicates: [`(${predicate})`] }),
    traits: (traits) => {
        if (traits.length === 1 && traits[0] === 'keyboardKey') {
            // the return key of the system keyboard is a button, the other keys are keys
            return matcher({
                predicates: ['(type == "XCUIElementTypeKey" OR type == "XCUIElementTypeButton")'],
                chain: '**/XCUIElementTypeKeyboard/**/XCUIElementTypeAny',
            });
        }
        throw new Error(`e2e on an iPhone: by.traits(${JSON.stringify(traits)}) has no XCUITest equivalent yet`);
    },
};

const query = (m) => {
    const predicate = m.parts.predicates.join(' AND ');
    if (m.parts.chain) {
        return { using: 'class chain', value: predicate ? `${m.parts.chain}[\`${predicate}\`]` : m.parts.chain };
    }
    return { using: 'predicate string', value: predicate };
};

const describe = (m, index) => `${query(m).value}${index ? ` [${index}]` : ''}`;

// --- elements ---------------------------------------------------------------------------------

const TEXT_INPUTS = [
    'XCUIElementTypeTextField',
    'XCUIElementTypeSecureTextField',
    'XCUIElementTypeTextView',
    'XCUIElementTypeSearchField',
];

// m.stoodIn says which group stood in for an ID that is not in the accessibility tree (./aliases.js)
const resolveAll = async (m) => {
    const { using, value } = query(m);
    const ids = await wda.find(using, value);
    const alias = m.parts.id && aliasFor(m.parts.id);
    if (!ids.length && m.parts.text !== undefined && m.parts.predicates.length === 1) {
        // A text that is not an element of its own is the start of the label of its row or
        // button ("G-Passcode-1 r9fz… Full access"): VoiceOver reads the group as one.
        m.stoodIn = null;
        return wda.find(
            'predicate string',
            `(type == "XCUIElementTypeButton" OR type == "XCUIElementTypeCell") AND label BEGINSWITH ${quote(`${m.parts.text} `)}`,
        );
    }
    if (ids.length || !alias) {
        m.stoodIn = null;
        return ids;
    }
    m.stoodIn = alias;
    return wda.find('predicate string', alias.predicate || `name == ${quote(alias.id)}`);
};

// the element, or an error after a short wait: a screen that is just coming in is not "not there"
const resolve = async (m, index = 0, waitMs = 1500) => {
    const end = Date.now() + waitMs;
    for (;;) {
        const ids = await resolveAll(m);
        if (ids.length > index) {
            return ids[index];
        }
        if (Date.now() >= end) {
            throw new Error(`e2e on an iPhone: no element ${describe(m, index)}`);
        }
        await sleep(200);
    }
};

// Text goes in through the keyboard of the phone. The first character of an entry makes the app
// draw the field again; characters that arrive during that were lost. So: the keyboard is up, the
// first character, a moment, then the rest (slowly: maxTypingFrequency in ./wda.js).
const keyboardUp = async (waitMs = 3000) => {
    const end = Date.now() + waitMs;
    while (Date.now() < end) {
        if ((await wda.find('class chain', '**/XCUIElementTypeKeyboard')).length) {
            return true;
        }
        await sleep(150);
    }
    return false;
};

// `target`: the field the text is for. Its first character is typed into the field itself, which
// also puts the cursor there; without a target the text goes to the field that has the cursor.
const typeOnKeyboard = async (text, target) => {
    const value = String(text);
    if (!value.length) {
        return;
    }
    if (target) {
        await wda.type(target, value[0]);
    } else {
        await wda.keys(value[0]);
    }
    if (value.length > 1) {
        await sleep(300);
        await wda.keys(value.slice(1));
    }
};

const center = (rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

// the finger moves this way to scroll the content the other way
const MOVES = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const drag = async (rect, direction, distance, from) => {
    const [dx, dy] = MOVES[direction];
    const start = from || center(rect);
    const screen = await wda.windowRect();
    const clamp = (value, max) => Math.max(4, Math.min(max - 4, value));
    await wda.drag(
        clamp(start.x, screen.width),
        clamp(start.y, screen.height),
        clamp(start.x + dx * distance, screen.width),
        clamp(start.y + dy * distance, screen.height),
    );
};

const element = (m, index = 0) => {
    const id = (waitMs) => resolve(m, index, waitMs);
    const api = {
        matcher: m,
        index,
        atIndex: (i) => element(m, i),
        exists: async () => (await resolveAll(m)).length > index,
        visible: async () => {
            const ids = await resolveAll(m);
            return ids.length > index && wda.displayed(ids[index]);
        },
        async tap(point) {
            const target = await id();
            if (point) {
                const rect = await wda.rect(target);
                await wda.tapAt(rect.x + point.x, rect.y + point.y);
                return;
            }
            await wda.click(target);
        },
        async longPress(ms = 1000) {
            await wda.touchAndHold(await id(), ms / 1000);
        },
        async multiTap(times) {
            await wda.tapTimes(await id(), times);
        },
        async typeText(text) {
            const target = await id();
            await typeOnKeyboard(text, target);
        },
        async clearText() {
            await wda.clear(await id());
        },
        // Detox writes the text into the field; on a phone it is typed, and read back where the
        // field shows it (a password field does not)
        async replaceText(text) {
            const want = String(text);
            const target = await id();
            const readable = (await wda.attribute(target, 'type')) !== 'XCUIElementTypeSecureTextField';
            // an empty field gives its placeholder as its value
            const placeholder = await wda.attribute(target, 'placeholderValue');
            let got = '';
            for (let attempt = 0; attempt < 3; attempt += 1) {
                await wda.click(target);
                await keyboardUp();
                await wda.clear(target);
                await sleep(250);
                await typeOnKeyboard(want, target);
                if (!readable) {
                    return;
                }
                await sleep(200);
                const value = await wda.attribute(target, 'value');
                got = value === null || value === undefined || value === placeholder ? '' : String(value);
                // spaces around the text are not in the value that the phone gives (the search
                // field for a recipient gets an address with spaces on purpose)
                if (got === want || got === want.trim()) {
                    return;
                }
            }
            throw new Error(`e2e on an iPhone: typed ${JSON.stringify(want)} into ${describe(m, index)} three times, the field has ${JSON.stringify(got)}`);
        },
        async tapReturnKey() {
            await wda.keys('\n');
        },
        // swipe('up', 'slow', 0.6): as in Detox, the finger starts in the middle of the element and
        // goes up over 60% of the screen (the slide-to-accept thumb is 50 points wide: the way is
        // measured on the screen, not on the element)
        async swipe(direction, speed = 'fast', fraction = 0.75) {
            const target = await id();
            if (speed === 'fast' && arguments.length < 3) {
                await wda.swipe(target, direction, 1500);
                return;
            }
            const rect = await wda.rect(target);
            const screen = await wda.windowRect();
            const size = direction === 'up' || direction === 'down' ? screen.height : screen.width;
            await drag(rect, direction, size * fraction);
        },
        // scroll(120, 'down'): the content moves 120 points so that what is below comes into view
        async scroll(points, direction) {
            const rect = await wda.rect(await id());
            const opposite = { down: 'up', up: 'down', left: 'right', right: 'left' }[direction];
            const [dx, dy] = MOVES[opposite];
            const middle = center(rect);
            await drag(rect, opposite, points, { x: middle.x - (dx * points) / 2, y: middle.y - (dy * points) / 2 });
        },
        async scrollTo(edge) {
            const direction = { top: 'down', bottom: 'up', left: 'right', right: 'left' }[edge];
            const target = await id();
            for (let i = 0; i < 6; i += 1) {
                await wda.swipe(target, direction, 2500);
            }
            await sleep(400);
        },
        async getAttributes() {
            const target = await id();
            const [type, label, value, name, enabled, visible, frame] = await Promise.all([
                wda.attribute(target, 'type'),
                wda.attribute(target, 'label'),
                wda.attribute(target, 'value'),
                wda.attribute(target, 'name'),
                wda.attribute(target, 'enabled'),
                wda.attribute(target, 'visible'),
                wda.rect(target),
            ]);
            let text = TEXT_INPUTS.indexOf(type) !== -1 ? value : label || value;
            if (m.stoodIn && m.stoodIn.text) {
                text = m.stoodIn.text(String(label || ''));
            }
            return {
                text: text === null || text === undefined ? '' : String(text),
                label: label || '',
                value: value === null || value === undefined ? '' : String(value),
                identifier: name || '',
                enabled: String(enabled) === 'true',
                visible: String(visible) === 'true',
                frame,
            };
        },
    };
    return api;
};

// --- expectations -----------------------------------------------------------------------------

const CHECKS = {
    toExist: (el) => el.exists(),
    toBeVisible: (el) => el.visible(),
    toHaveText: async (el, text) => (await el.exists()) && (await el.getAttributes()).text === String(text),
    toHaveLabel: async (el, label) => (await el.exists()) && (await el.getAttributes()).label === String(label),
    toHaveValue: async (el, value) => (await el.exists()) && (await el.getAttributes()).value === String(value),
};

const safely = async (check) => {
    try {
        return await check();
    } catch (e) {
        // the element went away between two requests: not what was asked for, look again
        return null;
    }
};

// waitFor(el).toBeVisible().withTimeout(ms), also with .not and with
// .whileElement(by.id(list)).scroll(points, direction)
const expectation = (el, waits) => {
    const build = (negate) => {
        const checks = {};
        Object.keys(CHECKS).forEach((name) => {
            checks[name] = (...args) => {
                const holds = async () => {
                    const result = await safely(() => CHECKS[name](el, ...args));
                    return result === null ? false : result !== negate;
                };
                const fail = () =>
                    new Error(`e2e on an iPhone: ${negate ? 'not.' : ''}${name}(${args.map(String).join(', ')}) failed for ${describe(el.matcher, el.index)}`);
                const until = async (timeout, between) => {
                    const end = Date.now() + timeout;
                    for (;;) {
                        if (await holds()) {
                            return;
                        }
                        if (Date.now() >= end) {
                            throw fail();
                        }
                        if (between) {
                            await between();
                        } else {
                            await sleep(250);
                        }
                    }
                };
                if (!waits) {
                    // expect(): now, with a moment for a screen that is just changing
                    return until(1500);
                }
                const pending = {
                    withTimeout: (timeout) => until(timeout),
                    // Detox stops with an error at the edge of the list; here after as many
                    // scrolls as a long list needs
                    whileElement: (listMatcher) => ({
                        scroll: async (points, direction) => {
                            for (let i = 0; i < 12; i += 1) {
                                if (await holds()) {
                                    return;
                                }
                                await element(listMatcher).scroll(points, direction);
                                await sleep(250);
                            }
                            if (!(await holds())) {
                                throw fail();
                            }
                        },
                    }),
                    // awaited without withTimeout
                    then: (done, failed) => until(10000).then(done, failed),
                };
                return pending;
            };
        });
        return checks;
    };
    const positive = build(false);
    positive.not = build(true);
    return positive;
};

const waitFor = (el) => expectation(el, true);
const expect = (el) => expectation(el, false);

// --- device -----------------------------------------------------------------------------------

// The first start after an install asks for notifications; later ones can ask for other things the
// steps expect to be allowed (Detox sets these on a simulator before the app starts).
const SYSTEM_QUESTION = /would like to|wants to|allow .* to|notifications/i;
const ALLOW = ['Allow', 'Allow While Using App', 'OK', 'Continue'];

const answerSystemQuestions = async (forMs = 4000) => {
    const end = Date.now() + forMs;
    let answered = 0;
    while (Date.now() < end) {
        const text = await safely(() => wda.alertText());
        if (text && SYSTEM_QUESTION.test(text)) {
            const buttons = (await safely(() => wda.alertButtons())) || [];
            const button = ALLOW.find((name) => buttons.indexOf(name) !== -1);
            if (button) {
                await wda.alertAccept(button);
                answered += 1;
                await sleep(500);
            } else {
                return answered;
            }
        } else {
            await sleep(400);
        }
    }
    return answered;
};

const launchArguments = (launchArgs) => {
    const list = [];
    Object.keys(launchArgs || {}).forEach((key) => {
        list.push(`-${key}`, String(launchArgs[key]));
    });
    return list;
};

const device = {
    get id() {
        return UDID();
    },
    get name() {
        return `iPhone ${UDID()}`;
    },
    getPlatform: () => 'ios',
    async launchApp(options = {}) {
        const link = options.url || (options.userActivity && options.userActivity.webpageURL);
        if (options.newInstance) {
            await safely(() => wda.terminate());
            await sleep(500);
        }
        if (link) {
            // a cold start from a link, the way iOS hands a universal link to the app
            await wda.openUrl(link);
        } else if (options.newInstance === false && (await safely(() => wda.appState())) > 1) {
            await wda.activate();
        } else {
            await wda.launch(launchArguments(options.launchArgs));
        }
        await answerSystemQuestions(options.newInstance ? 4000 : 1500);
    },
    async terminateApp() {
        await wda.terminate();
    },
    async sendToHome() {
        await wda.home();
    },
    async openURL({ url }) {
        await wda.openUrl(url);
    },
    takeScreenshot: () => wda.screenshot(),
    // no synchronization with the app on a phone, and nothing in the app to block URLs with
    disableSynchronization: async () => {},
    enableSynchronization: async () => {},
    setURLBlacklist: async () => {},
};

// --- detox/internals --------------------------------------------------------------------------

const internals = {
    async init() {
        if (!UDID()) {
            throw new Error('e2e on an iPhone: E2E_IOS_DEVICE is not set');
        }
        const status = await wda.start();
        // eslint-disable-next-line no-console
        console.error(`[e2e] iPhone ${UDID()}: iOS ${status.os && status.os.version}, WebDriverAgent ${status.build && status.build.version}`);
    },
    async cleanup() {
        await wda.stop();
    },
    onTestStart: async () => {},
    onTestDone: async () => {},
};

module.exports = { device, element, by, waitFor, expect, internals, answerSystemQuestions, typeOnKeyboard };
