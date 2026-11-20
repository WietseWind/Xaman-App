/**
 * The parts of the e2e harness that decide: did a tap arrive, may it be sent again, and which faults are
 * injected in a proof run. (The harness itself runs on a simulator or emulator; this is its logic only.)
 */
const os = require('os');
const path = require('path');

const node = (attrs) => `<node ${attrs} />`;
const appNode = (id, text, extra = '') =>
    node(
        `index="0" text="${text}" resource-id="${id}" class="android.view.ViewGroup" package="com.xrpllabs.xumm" ` +
            `content-desc="" clickable="true" enabled="true" focused="false" bounds="[40,1800][1040,1920]" ${extra}`,
    );
const statusBar = (clock) =>
    node(
        `index="0" text="${clock}" resource-id="com.android.systemui:id/clock" class="android.widget.TextView" ` +
            'package="com.android.systemui" bounds="[40,20][200,80]"',
    );
const keyboard = () =>
    node(
        'index="0" text="q" resource-id="" class="android.view.View" ' +
            'package="com.google.android.inputmethod.latin" bounds="[0,1500][108,1650]"',
    );
const screen = (...nodes) => `<?xml version="1.0"?><hierarchy rotation="0">${nodes.join('')}</hierarchy>`;

const LABEL = screen(statusBar('6:47'), appNode('label-input', 'I-MN-Ed-Auto'), appNode('next-button', 'Next'));
const FINISH = screen(statusBar('6:47'), appNode('account-import-finish-view', ''), appNode('finish-button', 'Finish'));

// the helper with the given environment, and the notes it made (what it also writes to tap-checks.txt and
// tap-effects.tsv)
const load = (env = {}) => {
    let mod;
    const before = { ...process.env };
    Object.assign(process.env, { E2E_ARTIFACTS_DIR: path.join(os.tmpdir(), 'xaman-e2e-harness-test') }, env);
    jest.isolateModules(() => {
        // eslint-disable-next-line global-require
        mod = require('../../../e2e/helpers/androidTapCheck');
    });
    process.env = before;
    const notes = () => mod.recentTapNotes().map((line) => line.replace(/^\S+ /, ''));
    return { ...mod, notes };
};

// a device whose screen is what `state.xml` says; a tap may change it
const device = (start) => {
    const state = { xml: start, broken: false, dumps: 0 };
    return {
        state,
        screen: {
            dump: async () => {
                state.dumps += 1;
                return state.xml;
            },
            broken: () => state.broken,
            has: async (testId) => state.xml.indexOf(`resource-id="${testId}"`) !== -1,
        },
    };
};

// the wait of a step: until the test id is on screen, or an error after the timeout
const stepWait = (d, testId, timeoutMs = 10000) => async () => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        if (await d.screen.has(testId)) {
            return;
        }
        if (Date.now() >= deadline) {
            throw new Error(`android hierarchy timed out waiting for ${testId}`);
        }
        await new Promise((resolve) => { setTimeout(resolve, 250); });
    }
};

const run = async (promise, ms = 30000) => {
    let done = false;
    const result = promise.then(
        (v) => { done = true; return v; },
        (e) => { done = true; throw e; },
    );
    // the caller looks at the outcome; until then a rejection is not "unhandled"
    result.catch(() => {});
    for (let t = 0; t < ms && !done; t += 250) {
        await jest.advanceTimersByTimeAsync(250);
    }
    return result;
};

beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('what counts as the same screen', () => {
    const { screenSignature } = load();

    it('the clock in the status bar and the keyboard do not count', () => {
        const a = screen(statusBar('6:47'), keyboard(), appNode('next-button', 'Next'));
        const b = screen(statusBar('6:48'), appNode('next-button', 'Next'));
        expect(screenSignature(a)).toBe(screenSignature(b));
    });

    it('the focus flag does not count (closing the keyboard moves it)', () => {
        const a = screen(appNode('label-input', 'x').replace('focused="false"', 'focused="true"'));
        const b = screen(appNode('label-input', 'x'));
        expect(screenSignature(a)).toBe(screenSignature(b));
    });

    it.each([
        ['another screen', FINISH],
        ['a changed text', screen(statusBar('6:47'), appNode('label-input', 'other'), appNode('next-button', 'Next'))],
        [
            'a button that is now disabled',
            LABEL.replace(/(resource-id="next-button".*?)enabled="true"/, '$1enabled="false"'),
        ],
        ['a moved button', LABEL.replace('[40,1800][1040,1920]', '[40,1500][1040,1620]')],
    ])('%s is a change', (_, other) => {
        expect(screenSignature(other)).not.toBe(screenSignature(LABEL));
    });

    it('a missing or cut off dump says nothing', () => {
        expect(screenSignature('')).toBeNull();
        expect(screenSignature(LABEL.replace('</hierarchy>', ''))).toBeNull();
        expect(screenSignature(screen(statusBar('6:47')))).toBeNull();
    });
});

describe('which nodes are the on-screen keyboard', () => {
    // eslint-disable-next-line global-require
    const { isKeyboardPackage, setKeyboardPackage } = require('../../../e2e/helpers/androidKeyboardPackage');

    afterEach(() => setKeyboardPackage(''));

    it('a package with inputmethod in its name, or the keyboard that is set on the device', () => {
        expect(isKeyboardPackage('com.google.android.inputmethod.latin')).toBe(true);
        expect(isKeyboardPackage('com.samsung.android.honeyboard')).toBe(false);
        expect(isKeyboardPackage('com.xrpllabs.xumm')).toBe(false);
        expect(isKeyboardPackage('')).toBe(false);

        setKeyboardPackage('com.samsung.android.honeyboard\n');
        expect(isKeyboardPackage('com.samsung.android.honeyboard')).toBe(true);
        expect(isKeyboardPackage('com.xrpllabs.xumm')).toBe(false);
    });
});

describe('which buttons may be tapped a second time', () => {
    const { isRepeatable, isChecked } = load();

    it('only buttons that lead to the same place twice', () => {
        ['next-button', 'back-button', 'tab-Home', 'tab-Settings'].forEach((id) => expect(isRepeatable(id)).toBe(true));
        [
            'finish-button',
            'confirm-button',
            'add-and-sign-button',
            'sign-button',
            'request-decline-decline-button',
            'developer-mode-switch',
            'mnemonic-radio-button',
            'not-next-button',
            'next-button-2',
        ].forEach((id) => expect(isRepeatable(id)).toBe(false));
    });

    it('passcode keys and buttons with their own wait are not checked at all', () => {
        ['1-key', '9-key', 'confirm-button', 'add-and-sign-button'].forEach((id) => expect(isChecked(id)).toBe(false));
        ['next-button', 'finish-button', 'tab-Home'].forEach((id) => expect(isChecked(id)).toBe(true));
    });
});

describe('a tap, and the wait of the step after it', () => {
    // step 7 taps, step 8 waits for the next screen
    const tapThenWait = async (h, d, testId, tap, awaited, { waitStep = 8, timeoutMs } = {}) => {
        await run(h.tapNoted(testId, tap, d.screen, 7));
        return run(h.waitAfterTap(awaited, stepWait(d, awaited, timeoutMs), d.screen, waitStep));
    };

    it('the next screen shows: one tap, and how long it took is written down', async () => {
        const h = load();
        const d = device(LABEL);
        const tap = jest.fn(async () => { d.state.xml = FINISH; });

        await tapThenWait(h, d, 'next-button', tap, 'account-import-finish-view');

        expect(tap).toHaveBeenCalledTimes(1);
        expect(h.notes()).toEqual([
            expect.stringMatching(/^next-button -> account-import-finish-view \d+ \(unchanged 0\)$/),
        ]);
    });

    it('a lost Next tap: the next screen stays away and nothing changed, so it is tapped once more', async () => {
        const h = load();
        const d = device(LABEL);
        // the first tap is lost, the second arrives
        const tap = jest.fn(async () => {
            if (tap.mock.calls.length === 2) {
                d.state.xml = FINISH;
            }
        });

        const started = Date.now();
        await tapThenWait(h, d, 'next-button', tap, 'account-import-finish-view');

        expect(tap).toHaveBeenCalledTimes(2);
        expect(Date.now() - started).toBeGreaterThanOrEqual(h.REPEAT_AFTER_MS);
        expect(h.notes()).toEqual([
            expect.stringMatching(
                /^next-button: account-import-finish-view did not show in \d+ ms and the screen is .*: tapped again$/,
            ),
            expect.stringMatching(/^next-button: account-import-finish-view showed \d+ ms after the second tap$/),
        ]);
    });

    it('a keyboard over the button is closed first, so a lost tap after it is still seen as lost', async () => {
        const h = load();
        // with the keyboard up the focused field has a cursor handle of its own in the dump
        const handle = node(
            'index="9" text="" resource-id="android:id/insertion_handle" package="com.xrpllabs.xumm" ' +
                'bounds="[500,700][560,780]"',
        );
        const d = device(
            screen(statusBar('6:47'), keyboard(), appNode('label-input', 'x'), handle, appNode('next-button', 'Next')),
        );
        const closed = screen(statusBar('6:47'), appNode('label-input', 'x'), appNode('next-button', 'Next'));
        d.screen.closeKeyboardOver = jest.fn(async () => { d.state.xml = closed; return true; });
        // the first tap is lost, the second arrives
        const tap = jest.fn(async () => {
            if (tap.mock.calls.length === 2) {
                d.state.xml = FINISH;
            }
        });

        await tapThenWait(h, d, 'next-button', tap, 'account-import-finish-view');

        expect(d.screen.closeKeyboardOver).toHaveBeenCalledWith('next-button');
        expect(tap).toHaveBeenCalledTimes(2);
    });

    it('no keyboard in the dump: nothing is closed', async () => {
        const h = load();
        const d = device(LABEL);
        d.screen.closeKeyboardOver = jest.fn(async () => true);
        const tap = jest.fn(async () => { d.state.xml = FINISH; });

        await tapThenWait(h, d, 'next-button', tap, 'account-import-finish-view');

        expect(d.screen.closeKeyboardOver).not.toHaveBeenCalled();
    });

    it('a slow next screen is not tapped twice: showing up just before the limit counts', async () => {
        const h = load();
        const d = device(LABEL);
        const tap = jest.fn(async () => {
            setTimeout(() => { d.state.xml = FINISH; }, h.REPEAT_AFTER_MS - 600);
        });

        await tapThenWait(h, d, 'next-button', tap, 'account-import-finish-view');

        expect(tap).toHaveBeenCalledTimes(1);
    });

    it('the screen changed but the next screen is not there yet (loading): not tapped again', async () => {
        const h = load();
        const d = device(LABEL);
        const LOADING = LABEL.replace('text="Next"', 'text=""');
        const tap = jest.fn(async () => {
            d.state.xml = LOADING;
            setTimeout(() => { d.state.xml = FINISH; }, 9000);
        });

        await tapThenWait(h, d, 'next-button', tap, 'account-import-finish-view', { timeoutMs: 90000 });

        expect(tap).toHaveBeenCalledTimes(1);
        expect(h.notes()).toEqual([
            expect.stringMatching(/^next-button -> account-import-finish-view 9\d\d\d \(unchanged 0\)$/),
        ]);
    });

    it('how long the screen stayed as it was is written down, also when the tap arrived', async () => {
        const h = load();
        const d = device(LABEL);
        const tap = jest.fn(async () => {
            setTimeout(() => { d.state.xml = FINISH; }, 2100);
        });

        await tapThenWait(h, d, 'next-button', tap, 'account-import-finish-view');

        const unchanged = Number(/unchanged (\d+)/.exec(h.notes()[0])[1]);
        expect(unchanged).toBeGreaterThanOrEqual(1500);
        expect(unchanged).toBeLessThan(2500);
    });

    it('on a passcode screen a Next tap is never sent twice: its dump does not show what the app does', async () => {
        const h = load();
        const PASSCODE = screen(appNode('setup-passcode-screen', ''), appNode('next-button', 'Save'));
        const d = device(PASSCODE);
        const tap = jest.fn(async () => {});

        await expect(tapThenWait(h, d, 'next-button', tap, 'agreement-setup-screen')).rejects.toThrow('timed out');

        expect(tap).toHaveBeenCalledTimes(1);
        expect(h.notes().pop()).toMatch(/\(not tapped again: never on setup-passcode-screen\)$/);
    });

    it('a tap that arrives without changing the screen is not repeated when the next step does not wait', async () => {
        // Next in the passcode set-up: the step after it types
        const h = load();
        const d = device(LABEL);
        const tap = jest.fn(async () => {});

        await run(h.tapNoted('next-button', tap, d.screen, 7));
        // step 8 types; step 9 waits for something else
        await expect(
            run(h.waitAfterTap('account-import-finish-view', stepWait(d, 'account-import-finish-view'), d.screen, 9)),
        ).rejects.toThrow('timed out');

        expect(tap).toHaveBeenCalledTimes(1);
        expect(h.notes()).toEqual([]);
    });

    it('a button that is not repeatable is never tapped twice; the note says the tap changed nothing', async () => {
        const h = load();
        const d = device(FINISH);
        const tap = jest.fn(async () => {});

        await expect(tapThenWait(h, d, 'finish-button', tap, 'home-tab-view')).rejects.toThrow('timed out');

        expect(tap).toHaveBeenCalledTimes(1);
        expect(h.notes()).toEqual([
            expect.stringMatching(
                /^finish-button: home-tab-view did not show and the screen is .* \(not tapped again: not a repeatable/,
            ),
        ]);
    });

    it('a button that is not repeatable, next screen shows: no note besides the time', async () => {
        const h = load();
        const d = device(FINISH);
        const HOME = screen(appNode('home-tab-view', ''));
        const tap = jest.fn(async () => { d.state.xml = HOME; });

        await tapThenWait(h, d, 'finish-button', tap, 'home-tab-view');

        expect(h.notes()).toEqual([expect.stringMatching(/^finish-button -> home-tab-view \d+ \(unchanged 0\)$/)]);
    });

    it('no usable dump when it has to be decided: not known, so not tapped again', async () => {
        const h = load();
        const d = device(LABEL);
        const tap = jest.fn(async () => { d.state.xml = LABEL.replace('</hierarchy>', ''); });

        await expect(tapThenWait(h, d, 'next-button', tap, 'account-import-finish-view')).rejects.toThrow('timed out');

        expect(tap).toHaveBeenCalledTimes(1);
    });

    it('no usable dump before the tap: the tap is sent and nothing is concluded later', async () => {
        const h = load();
        const d = device('');
        const tap = jest.fn(async () => { d.state.xml = LABEL; });

        await expect(tapThenWait(h, d, 'next-button', tap, 'account-import-finish-view')).rejects.toThrow('timed out');

        expect(tap).toHaveBeenCalledTimes(1);
    });

    it('dumps stopped working in this run: the tap is sent without any look at the screen', async () => {
        const h = load();
        const d = device(LABEL);
        d.state.broken = true;
        const tap = jest.fn(async () => {});

        await run(h.tapNoted('next-button', tap, d.screen, 7));

        expect(tap).toHaveBeenCalledTimes(1);
        expect(d.state.dumps).toBe(0);
    });

    it('the button is gone at the second tap: the screen moved on, the wait decides', async () => {
        const h = load();
        const d = device(LABEL);
        const tap = jest.fn(async () => {
            if (tap.mock.calls.length === 2) {
                d.state.xml = FINISH;
                throw new Error('android hierarchy has no bounds for next-button');
            }
        });

        await tapThenWait(h, d, 'next-button', tap, 'account-import-finish-view');

        expect(h.notes().pop()).toBe('next-button: second tap not sent, the button is gone');
    });

    it('the second tap does not help either: the wait fails as before, and the notes say so', async () => {
        const h = load();
        const d = device(LABEL);
        const tap = jest.fn(async () => {});

        await expect(tapThenWait(h, d, 'next-button', tap, 'account-import-finish-view')).rejects.toThrow('timed out');

        expect(tap).toHaveBeenCalledTimes(2);
        expect(h.notes().pop()).toBe(
            'next-button: account-import-finish-view did not show after the second tap either',
        );
    });

    it('an error of the tap itself is passed on', async () => {
        const h = load();
        const d = device(LABEL);
        const tap = jest.fn(async () => { throw new Error('android hierarchy has no bounds for next-button'); });

        await expect(run(h.tapNoted('next-button', tap, d.screen, 7))).rejects.toThrow('no bounds');
    });

    it('passcode keys are tapped without a look at the screen', async () => {
        const h = load();
        const d = device(LABEL);
        const tap = jest.fn(async () => {});

        await run(h.tapNoted('5-key', tap, d.screen, 7));

        expect(tap).toHaveBeenCalledTimes(1);
        expect(d.state.dumps).toBe(0);
    });

    it('a wait that does not follow a tap is the plain wait', async () => {
        const h = load();
        const d = device(FINISH);
        const wait = jest.fn(async () => 'waited');

        await expect(run(h.waitAfterTap('account-import-finish-view', wait, d.screen, 3))).resolves.toBe('waited');

        expect(wait).toHaveBeenCalledTimes(1);
        expect(d.state.dumps).toBe(0);
    });

    it('E2E_TAP_REPEAT=no: the note is written, nothing is tapped again', async () => {
        const h = load({ E2E_TAP_REPEAT: 'no' });
        const d = device(LABEL);
        const tap = jest.fn(async () => {});

        await expect(tapThenWait(h, d, 'next-button', tap, 'account-import-finish-view')).rejects.toThrow('timed out');

        expect(tap).toHaveBeenCalledTimes(1);
        expect(h.notes().pop()).toMatch(/\(not tapped again: E2E_TAP_REPEAT=no\)$/);
    });

    it('E2E_TAP_CHECK=no: as before, no look at the screen', async () => {
        const h = load({ E2E_TAP_CHECK: 'no' });
        const d = device(LABEL);
        const tap = jest.fn(async () => {});

        await expect(tapThenWait(h, d, 'next-button', tap, 'account-import-finish-view')).rejects.toThrow('timed out');

        expect(tap).toHaveBeenCalledTimes(1);
        expect(d.state.dumps).toBe(0);
    });

    it('a tap dropped on purpose (E2E_DROP_TAP) is caught and sent again', async () => {
        const h = load({ E2E_DROP_TAP: 'next-button:1' });
        const d = device(LABEL);
        const tap = jest.fn(async () => { d.state.xml = FINISH; });

        await tapThenWait(h, d, 'next-button', tap, 'account-import-finish-view');

        // the first one was never sent, the repeat is the only real tap
        expect(tap).toHaveBeenCalledTimes(1);
        expect(h.notes()).toEqual([
            'next-button: tap not sent (injected by E2E_DROP_TAP)',
            expect.stringMatching(/^next-button: account-import-finish-view did not show in \d+ ms .*: tapped again$/),
            expect.stringMatching(/^next-button: account-import-finish-view showed \d+ ms after the second tap$/),
        ]);
    });
});

describe('faults on purpose', () => {
    // eslint-disable-next-line global-require
    const { parseDropTap, shouldDrop, shouldFail } = require('../../../e2e/helpers/faultInjection');

    it('E2E_DROP_TAP: the n-th tap, or every n-th', () => {
        expect(parseDropTap('next-button:3')).toEqual({ testId: 'next-button', every: false, n: 3 });
        expect(parseDropTap('next-button:*3')).toEqual({ testId: 'next-button', every: true, n: 3 });
        ['', undefined, 'next-button', 'next-button:0', 'next-button:x'].forEach((v) => {
            expect(parseDropTap(v)).toBeNull();
        });

        const once = parseDropTap('a:2');
        expect([1, 2, 3, 4].map((count) => shouldDrop(once, count))).toEqual([false, true, false, false]);
        const every = parseDropTap('a:*2');
        expect([1, 2, 3, 4].map((count) => shouldDrop(every, count))).toEqual([false, true, false, true]);
        expect(shouldDrop(null, 1)).toBe(false);
    });

    it('E2E_FAIL_SCENARIO_MODE: once, run, always', () => {
        // (mode, attempt, in the rerun the runner started)
        expect(shouldFail('once', 1, false)).toBe(true);
        expect(shouldFail('once', 2, false)).toBe(false);
        expect(shouldFail('once', 1, true)).toBe(false);
        expect(shouldFail('run', 1, false)).toBe(true);
        expect(shouldFail('run', 2, false)).toBe(true);
        expect(shouldFail('run', 1, true)).toBe(false);
        expect(shouldFail('always', 2, true)).toBe(true);
    });
});

describe('scenarios a step skipped on purpose are not failures', () => {
    // eslint-disable-next-line global-require
    const { skippedScenarios, withoutSkipped } = require('../skippedScenarios');
    const step = (status) => ({ result: { status } });
    const report = [
        {
            uri: 'e2e/14_xapp_page_gone.feature',
            elements: [
                { line: 9, name: 'Open the support xApp', steps: [step('passed'), step('passed')] },
                { line: 22, name: 'The OS ends the page', steps: [step('passed'), step('skipped'), step('skipped')] },
                { line: 27, name: 'The OS ends the page in the background', steps: [step('skipped'), step('skipped')] },
                { line: 34, name: 'Close the xApp', steps: [step('passed'), step('failed'), step('skipped')] },
            ],
        },
        {
            uri: 'e2e/12_camera_permissions.feature',
            elements: [{ line: 11, name: 'Camera', steps: [step('passed'), step('failed')] }],
        },
    ];

    it('skipped = a skipped step and no failed step; steps skipped after a failure do not count', () => {
        expect(skippedScenarios(report)).toEqual({
            'e2e/14_xapp_page_gone.feature:22': 'The OS ends the page',
            'e2e/14_xapp_page_gone.feature:27': 'The OS ends the page in the background',
        });
    });

    it('an attempt that failed makes it a failure, also when another attempt was skipped', () => {
        const twice = [
            {
                uri: 'a.feature',
                elements: [
                    { line: 3, name: 'x', steps: [step('failed')] },
                    { line: 3, name: 'x', steps: [step('skipped')] },
                ],
            },
        ];
        expect(skippedScenarios(twice)).toEqual({});
    });

    it('the skipped scenarios go out of the rerun list, a file without any left goes out whole', () => {
        const skipped = skippedScenarios(report);
        const rerun = 'e2e/12_camera_permissions.feature:11\ne2e/14_xapp_page_gone.feature:22:27:34\n';
        expect(withoutSkipped(rerun, skipped)).toBe(
            'e2e/12_camera_permissions.feature:11\ne2e/14_xapp_page_gone.feature:34',
        );
        expect(withoutSkipped('e2e/14_xapp_page_gone.feature:22:27\n', skipped)).toBe('');
    });

    it('no report, or nothing skipped: the rerun list stays as it is', () => {
        expect(skippedScenarios(undefined)).toEqual({});
        expect(withoutSkipped('a.feature:3:9\n', {})).toBe('a.feature:3:9');
    });
});
