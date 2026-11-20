// What a failed scenario leaves behind, so the cause can be read afterwards instead of guessed:
// <artifacts>/failures/<nn>-<scenario>/ with
//   error.txt        the scenario, the attempt and the error;
//   steps/           the screenshots of the last steps before the failure;
//   tap-notes.txt    Android: the last taps and whether the screen reacted (androidTapCheck.js);
//   ui.xml           Android: the UI hierarchy at the moment of the failure;
//   device.txt       Android: keyboard and window focus state;
//   logcat.txt       Android: the last lines of the device log;
//   simulator-log.txt  iOS: the last lines of the app's log on the simulator.
// The runner copies this folder out of the throwaway clone (scripts/e2e/run-throwaway.sh).
//
// Only test data ends up here: the accounts of a run are made for that run, on a test network.
const { execFileSync } = require('child_process');
const {
    closeSync,
    copyFileSync,
    existsSync,
    mkdirSync,
    openSync,
    readdirSync,
    readSync,
    statSync,
    writeFileSync,
} = require('fs');
const path = require('path');
const { androidSerial } = require('./androidSerial');
const { artifactsDir, stepShotDir, currentStepIndex, sanitize } = require('./artifacts');
const { recentTapNotes } = require('./androidTapCheck');

const STEPS_KEPT = 4;
const LOG_LINES_KEPT = 400;
const LOG_TAIL_BYTES = 256 * 1024;
let failureIndex = 0;

const adb = (args, timeout = 8000) =>
    execFileSync('adb', ['-s', androidSerial(), ...args], { timeout, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

const attempt = (what) => {
    try {
        return what();
    } catch (e) {
        return `not available: ${String((e && e.message) || e).split('\n')[0]}`;
    }
};

const grepLines = (text, pattern) =>
    String(text)
        .split('\n')
        .filter((line) => pattern.test(line))
        .map((line) => line.trim())
        .join('\n');

const copyLastStepShots = (dir) => {
    const from = stepShotDir();
    if (!existsSync(from)) {
        return;
    }
    const firstKept = Math.max(0, currentStepIndex() - STEPS_KEPT + 1);
    const shots = readdirSync(from).filter((name) => {
        const m = /^[a-z]+-(\d+)-/.exec(name);
        return m && Number(m[1]) >= firstKept;
    });
    if (!shots.length) {
        return;
    }
    mkdirSync(path.join(dir, 'steps'), { recursive: true });
    shots.forEach((name) => copyFileSync(path.join(from, name), path.join(dir, 'steps', name)));
};

// The end of the app log that helpers/simulator.js streams into the artifacts directory.
const simulatorLogTail = () => {
    const file = path.join(artifactsDir(), 'simulator.log');
    if (!existsSync(file)) {
        return 'no simulator.log';
    }
    const { size } = statSync(file);
    const length = Math.min(size, LOG_TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    const fd = openSync(file, 'r');
    try {
        readSync(fd, buffer, 0, length, size - length);
    } finally {
        closeSync(fd);
    }
    return buffer.toString('utf8').split('\n').slice(-LOG_LINES_KEPT).join('\n');
};

/**
 * @param scenario `{ name, uri, line, message, willBeRetried }`
 * @param android `{ dump }` on Android (a fresh UI dump), undefined on iOS
 * @returns the folder, or undefined when nothing could be written
 */
const saveFailureEvidence = async (scenario, android) => {
    try {
        failureIndex += 1;
        const dir = path.join(
            artifactsDir(),
            'failures',
            `${String(failureIndex).padStart(2, '0')}-${sanitize(scenario.name)}`,
        );
        mkdirSync(dir, { recursive: true });
        writeFileSync(
            path.join(dir, 'error.txt'),
            [
                `scenario: ${scenario.name}`,
                `where: ${scenario.uri}${scenario.line ? `:${scenario.line}` : ''}`,
                `when: ${new Date().toISOString()}`,
                `this attempt: ${scenario.willBeRetried ? 'failed, the scenario is tried again' : 'failed, no further attempt'}`,
                '',
                String(scenario.message || 'no error message'),
                '',
            ].join('\n'),
        );
        attempt(() => copyLastStepShots(dir));
        if (android) {
            writeFileSync(path.join(dir, 'tap-notes.txt'), `${recentTapNotes().join('\n')}\n`);
            const xml = await Promise.race([
                android.dump().catch(() => ''),
                new Promise((resolve) => { setTimeout(() => resolve(''), 10000); }),
            ]);
            writeFileSync(path.join(dir, 'ui.xml'), xml || 'no dump');
            writeFileSync(
                path.join(dir, 'device.txt'),
                [
                    '# keyboard (dumpsys input_method)',
                    attempt(() =>
                        grepLines(
                            adb(['shell', 'dumpsys', 'input_method']),
                            /mInputShown|mShowRequested|mImeWindowVis|mCurMethodId/,
                        ),
                    ),
                    '',
                    '# focus (dumpsys window)',
                    attempt(() =>
                        grepLines(adb(['shell', 'dumpsys', 'window']), /mCurrentFocus|mFocusedApp|mInputMethodWindow/),
                    ),
                    '',
                ].join('\n'),
            );
            writeFileSync(
                path.join(dir, 'logcat.txt'),
                attempt(() => adb(['logcat', '-d', '-t', String(LOG_LINES_KEPT)], 10000)),
            );
        } else if (process.env.E2E_IOS_DEVICE) {
            // a physical iPhone: the screen as WebDriverAgent sees it (the accessibility tree)
            // eslint-disable-next-line global-require
            const wda = require('../iosDevice/wda');
            const tree = await Promise.race([
                wda.source().catch((e) => `no screen tree: ${e.message}`),
                new Promise((resolve) => { setTimeout(() => resolve('no screen tree: no answer in 40 s'), 40000); }),
            ]);
            writeFileSync(path.join(dir, 'screen-tree.txt'), `${tree || 'no screen tree'}\n`);
        } else {
            writeFileSync(path.join(dir, 'simulator-log.txt'), attempt(simulatorLogTail));
        }
        return dir;
    } catch (e) {
        // evidence is a help, never a reason for a scenario to fail
        return undefined;
    }
};

module.exports = { saveFailureEvidence };
