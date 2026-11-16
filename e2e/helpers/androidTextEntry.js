// Android text entry that makes sure the text arrived.
//
// Keystrokes (`adb shell input text`) pass through the on-screen keyboard. Gboard collects them as
// a word in progress, and when it has lost its link to the field the word stays in its suggestion
// bar: the field keeps its placeholder however often the same keystrokes are sent. So when the
// field reads as before, the next try takes another route:
//   1. keystrokes;
//   2. close the keyboard, tap the field again (a new link), keystrokes;
//   3. Detox replaceText, which writes into the field without the keyboard.
// Every time route 2 or 3 was needed is written to text-entry-fallbacks.txt in the artifacts
// directory, so a run that passed with help says so.
//
// E2E_FORCE_TEXT_ENTRY_MISS=1|2 drops the first one or two keystroke tries of every entry, to prove
// routes 2 and 3 on every field of the suite. Never set it for a run whose result counts.
const { appendFileSync, mkdirSync } = require('fs');
const path = require('path');
const { element, by } = require('detox');
const {
    clickByTestId,
    androidReadTextByTestId,
    androidTypeText,
    hideAndroidKeyboard,
    waitForAndroidIme,
} = require('./tapById');

const ARTIFACTS_DIR = process.env.E2E_ARTIFACTS_DIR
    ? path.resolve(process.env.E2E_ARTIFACTS_DIR)
    : path.resolve(__dirname, '../artifacts');
const REPORT_FILE = path.join(ARTIFACTS_DIR, 'text-entry-fallbacks.txt');
const FORCED_MISSES = Math.max(0, Math.min(2, Number(process.env.E2E_FORCE_TEXT_ENTRY_MISS) || 0));
const REPLACE_TIMEOUT_MS = 20000;

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// The field's id and the route only: the typed value can be a test passphrase.
const reportTextEntryFallback = (testId, route) => {
    const line = `${new Date().toISOString()} ${testId}: ${route}${FORCED_MISSES ? ' (forced)' : ''}`;
    // eslint-disable-next-line no-console
    console.log(`[text-entry] ${line}`);
    try {
        mkdirSync(ARTIFACTS_DIR, { recursive: true });
        appendFileSync(REPORT_FILE, `${line}\n`);
    } catch (e) {
        // the console line is in run.log
    }
};

const replaceAndroidText = (testId, value) => {
    let timer;
    const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('replaceText got no answer')), REPLACE_TIMEOUT_MS);
    });
    return Promise.race([element(by.id(testId)).replaceText(String(value)), timeout]).finally(() => {
        clearTimeout(timer);
    });
};

// Taps a text field and waits for the keyboard. No keyboard means the tap gave the field no focus
// (keystrokes would go nowhere), so it is tapped once more.
const focusAndroidTextField = async (testId) => {
    await clickByTestId(testId);
    if (await waitForAndroidIme(1500)) {
        return;
    }
    await clickByTestId(testId);
    await waitForAndroidIme(3000);
};

const isMasked = (text) => /^[\u2022\u25CF*]+$/.test(text);

// Types `value` into the field that was just tapped. `before` is what the field read right before
// typing. Fails here when no route changes the field, not at a later step.
const typeAndroidTextVerified = async (testId, value, before) => {
    let misses = FORCED_MISSES;
    const keystrokes = () => {
        if (misses > 0) {
            misses -= 1;
            return;
        }
        try {
            androidTypeText(value);
        } catch (e) {
            // timeout: the field may already have the value
        }
    };
    const read = async () => String((await androidReadTextByTestId(testId)) || '');

    keystrokes();
    for (let attempt = 1; ; attempt += 1) {
        await sleep(500);
        const after = await read();
        if (after !== before) {
            if (attempt > 1) {
                // A keyboard that got its link back can also hand over the words it kept. After a
                // second route the field must read exactly the value (a masked field can't be read).
                const want = String(value).trim();
                if (after.trim() !== want && !isMasked(after.trim())) {
                    reportTextEntryFallback(testId, 'value not exact after the second route, set again (replaceText)');
                    try {
                        await replaceAndroidText(testId, value);
                    } catch (e) {
                        reportTextEntryFallback(testId, `replaceText failed: ${e.message}`);
                    }
                }
            }
            return;
        }
        if (attempt >= 3) {
            throw new Error(
                `typed '${value}' into ${testId} by keystrokes, with the keyboard reopened and with replaceText, ` +
                    `but it still reads '${after}'`,
            );
        }
        if (attempt === 1) {
            reportTextEntryFallback(testId, 'nothing arrived; keyboard closed and reopened, typed again');
            await hideAndroidKeyboard();
            await clickByTestId(testId);
            await waitForAndroidIme(3000);
            keystrokes();
        } else {
            reportTextEntryFallback(testId, 'nothing arrived; set without the keyboard (replaceText)');
            try {
                await replaceAndroidText(testId, value);
            } catch (e) {
                reportTextEntryFallback(testId, `replaceText failed: ${e.message}`);
            }
        }
    }
};

module.exports = {
    focusAndroidTextField,
    typeAndroidTextVerified,
    reportTextEntryFallback,
};
