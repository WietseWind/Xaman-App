// Android: a tap that was lost is sent once more.
//
// A tap is an injected touch (`adb shell input tap`). Now and then one is lost: the tap step passes, the
// app still shows the same screen, and the scenario fails one step later, on the wait for the next screen
// (a lost Next tap after an account label, twice in full suite runs).
//
// So the tap step remembers what the screen looked like right before the tap, and the wait step that
// follows it uses that:
//   - what it waits for shows up, or the screen changes: the tap arrived, nothing else happens (how long
//     it took, and how long the screen stayed as it was, goes to tap-effects.tsv);
//   - for REPEAT_AFTER_MS the screen stays exactly the screen from before the tap: the tap did not
//     arrive. For a button where a second tap can do no harm (Next, Back, a tab) it is sent once more,
//     and that is written to tap-checks.txt. For any other button only the note is written: a button
//     that signs, submits, confirms or toggles is never tapped twice.
// "The screen did not change" alone is not enough to tap again: Next in the passcode set-up arrives and
// changes nothing in the UI dump. Where the step after it types instead of waiting, nothing is repeated;
// and on the screens in NO_REPEAT_ON_SCREENS nothing is ever repeated, because their dump does not show
// what the app is doing. The comparison leaves out the system bars and the on-screen keyboard.
//
// E2E_TAP_CHECK=no turns all of this off, E2E_TAP_REPEAT=no keeps the notes but never taps again.
const { appendFileSync, mkdirSync } = require('fs');
const path = require('path');
const { dropTap } = require('./faultInjection');
const { isKeyboardPackage } = require('./androidKeyboardPackage');

const ARTIFACTS_DIR = process.env.E2E_ARTIFACTS_DIR
    ? path.resolve(process.env.E2E_ARTIFACTS_DIR)
    : path.resolve(__dirname, '../artifacts');
const CHECKS_FILE = path.join(ARTIFACTS_DIR, 'tap-checks.txt');
const EFFECTS_FILE = path.join(ARTIFACTS_DIR, 'tap-effects.tsv');

const off = (name) => String(process.env[name] || '').toLowerCase() === 'no';
const CHECK = !off('E2E_TAP_CHECK');
const REPEAT = !off('E2E_TAP_REPEAT');

// A tap that arrived changes the screen within about a second, up to 3 seconds on a loaded machine
// (tap-effects.tsv of a run). This long after the tap, with the screen unchanged all the time, the tap
// counts as lost. A lost tap is rare, so the wait costs next to nothing; tapping a button twice that did
// get the first tap is what has to be ruled out.
const REPEAT_AFTER_MS = 8000;
const POLL_MS = 250;

// A second tap on these moves to the same place the first one would have.
const REPEATABLE = [/^next-button$/, /^back-button$/, /^tab-/];
// Not looked at: the passcode keys (many quick taps), and buttons whose step has its own wait and
// where an extra UI dump around the tap is known to hurt.
const NOT_CHECKED = [/^\d-key$/, /^confirm-button$/, /^add-and-sign-button$/];
// Screens whose UI dump stays the same while the app works on a tap (the passcode screens: saving a
// passcode takes seconds and shows nothing in the dump). A tap on these is never sent twice.
const NO_REPEAT_ON_SCREENS = ['setup-passcode-screen', 'change-passcode-screen', 'pin-code-entry-view'];

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const isRepeatable = (testId) => REPEATABLE.some((re) => re.test(testId));
const isChecked = (testId) => CHECK && !NOT_CHECKED.some((re) => re.test(testId));

const nodeAttr = (attrs, name) => {
    const m = attrs.match(new RegExp(`\\b${name}="([^"]*)"`));
    return m ? m[1] : '';
};

const isSystemBar = (attrs) => {
    const pkg = nodeAttr(attrs, 'package');
    const id = nodeAttr(attrs, 'resource-id');
    return pkg.indexOf('systemui') !== -1 || /navigationbar|nav_bar/i.test(id);
};

const isKeyboard = (attrs) => isKeyboardPackage(nodeAttr(attrs, 'package'));

/**
 * What the screen shows, as one string: every node outside the system bars and the keyboard, without the
 * focus flag (closing the keyboard moves the focus, that is no effect of the tap).
 * null when the dump is missing or cut off: nothing can be said then.
 */
const screenSignature = (xml) => {
    if (!xml || xml.indexOf('</hierarchy>') === -1) {
        return null;
    }
    const nodes = [];
    const nodeRe = /<node\b([^>]*)\/?>/g;
    let m = nodeRe.exec(xml);
    while (m) {
        const attrs = m[1];
        if (!isSystemBar(attrs) && !isKeyboard(attrs)) {
            nodes.push(attrs.replace(/\bfocused="[^"]*"/, '').replace(/\s+/g, ' ').trim());
        }
        m = nodeRe.exec(xml);
    }
    return nodes.length ? nodes.join('\n') : null;
};

const isKeyboardInDump = (xml) => {
    const packageRe = /<node\b[^>]*\bpackage="([^"]*)"/g;
    let m = packageRe.exec(xml || '');
    while (m) {
        if (isKeyboardPackage(m[1])) {
            return true;
        }
        m = packageRe.exec(xml || '');
    }
    return false;
};

/* Notes ==================================================================== */
const recent = [];

const write = (file, line) => {
    try {
        mkdirSync(ARTIFACTS_DIR, { recursive: true });
        appendFileSync(file, `${line}\n`);
    } catch (e) {
        // the console line is in run.log
    }
};

const remember = (entry) => {
    recent.push(entry);
    if (recent.length > 30) {
        recent.shift();
    }
};

const reportTapCheck = (testId, what) => {
    const line = `${new Date().toISOString()} ${testId}: ${what}`;
    // eslint-disable-next-line no-console
    console.log(`[tap-check] ${line}`);
    write(CHECKS_FILE, line);
    remember(line);
};

// tap → what the next step waited for → how long that took → how long the screen stayed as it was
const recordEffect = (testId, awaited, ms, unchangedMs = 0) => {
    write(EFFECTS_FILE, `${new Date().toISOString()}\t${testId}\t${awaited}\t${ms}\t${unchangedMs}`);
    remember(`${new Date().toISOString()} ${testId} -> ${awaited} ${ms} (unchanged ${unchangedMs})`);
};

/* The tap ==================================================================== */
// the last tap, until the step after it has looked at it
let lastTap = null;

/**
 * Sends a tap and remembers the screen from right before it, for the wait step that follows.
 * @param testId the test id that is tapped
 * @param tap sends the tap (it looks the target up again each time it is called)
 * @param screen `{ dump, broken, closeKeyboardOver }`: a fresh UI dump, whether dumps stopped working for
 * this run, and `closeKeyboardOver(testId)`: close the keyboard when it covers that target
 * @param stepIndex the number of this step in the run
 */
const tapNoted = async (testId, tap, screen, stepIndex) => {
    lastTap = null;
    if (!isChecked(testId) || screen.broken()) {
        await tap();
        return;
    }
    let beforeXml = await screen.dump();
    // A keyboard over the target is closed by the tap helper first. Close it here, so that "before" is
    // the screen the tap really meets: with the keyboard up the focused field looks different, and a
    // lost tap then looked like a tap that changed the screen.
    if (isKeyboardInDump(beforeXml) && screen.closeKeyboardOver && (await screen.closeKeyboardOver(testId))) {
        beforeXml = await screen.dump();
    }
    const before = screenSignature(beforeXml);
    if (dropTap(testId)) {
        reportTapCheck(testId, 'tap not sent (injected by E2E_DROP_TAP)');
    } else {
        await tap();
    }
    if (before !== null) {
        const quietScreen = NO_REPEAT_ON_SCREENS.find((id) => beforeXml.indexOf(id) !== -1);
        lastTap = { testId, tap, before, at: Date.now(), stepIndex, quietScreen };
    }
};

/**
 * The wait of the step right after a tap. Sends the tap once more when what is waited for stays away and
 * the screen is still the one from before the tap.
 * @param awaited the test id the step waits for
 * @param wait the step's own wait; throws when the time is up
 * @param screen `{ dump, broken, has }`: as above, and `has(testId)`: is it on screen now
 * @param stepIndex the number of this step in the run
 */
const waitAfterTap = async (awaited, wait, screen, stepIndex) => {
    const tapped = lastTap;
    lastTap = null;
    if (!tapped || tapped.stepIndex + 1 !== stepIndex || screen.broken()) {
        return wait();
    }

    const sameScreen = async () => {
        const now = screenSignature(await screen.dump());
        return now !== null && now === tapped.before;
    };

    const whyNot = () => {
        if (!isRepeatable(tapped.testId)) {
            return 'not a repeatable button';
        }
        return tapped.quietScreen ? `never on ${tapped.quietScreen}` : 'E2E_TAP_REPEAT=no';
    };

    if (!(REPEAT && isRepeatable(tapped.testId)) || tapped.quietScreen) {
        // never tapped again; when the wait fails, the note says whether the tap changed anything
        try {
            const result = await wait();
            recordEffect(tapped.testId, awaited, Date.now() - tapped.at);
            return result;
        } catch (e) {
            if (!screen.broken() && (await sameScreen().catch(() => false))) {
                reportTapCheck(
                    tapped.testId,
                    `${awaited} did not show and the screen is the one from before the tap ` +
                        `(not tapped again: ${whyNot()})`,
                );
            }
            throw e;
        }
    }

    // look at the screen until something happens, or until the tap counts as lost
    let unchangedMs = 0;
    for (;;) {
        if (await screen.has(awaited)) {
            recordEffect(tapped.testId, awaited, Date.now() - tapped.at, unchangedMs);
            return wait();
        }
        if (screen.broken() || !(await sameScreen())) {
            // something happened on screen (or it can not be read): the tap arrived as far as can be
            // told, the rest is the step's own wait
            const result = await wait();
            recordEffect(tapped.testId, awaited, Date.now() - tapped.at, unchangedMs);
            return result;
        }
        unchangedMs = Date.now() - tapped.at;
        if (unchangedMs >= REPEAT_AFTER_MS) {
            break;
        }
        await sleep(POLL_MS);
    }

    reportTapCheck(
        tapped.testId,
        `${awaited} did not show in ${Date.now() - tapped.at} ms and the screen is the one from before the tap: ` +
            'tapped again',
    );
    const again = Date.now();
    try {
        await tapped.tap();
    } catch (e) {
        // the target is gone: the screen moved on after all
        reportTapCheck(tapped.testId, 'second tap not sent, the button is gone');
        return wait();
    }
    try {
        const result = await wait();
        reportTapCheck(tapped.testId, `${awaited} showed ${Date.now() - again} ms after the second tap`);
        return result;
    } catch (e) {
        reportTapCheck(tapped.testId, `${awaited} did not show after the second tap either`);
        throw e;
    }
};

module.exports = {
    tapNoted,
    waitAfterTap,
    screenSignature,
    isRepeatable,
    isChecked,
    recentTapNotes: () => recent.slice(),
    REPEAT_AFTER_MS,
};
