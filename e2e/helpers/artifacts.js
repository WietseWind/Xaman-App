const { execSync, execFileSync, spawn } = require('child_process');
const { existsSync, mkdirSync, unlinkSync, writeFileSync } = require('fs');
const path = require('path');
const { androidSerial } = require('./androidSerial');

const ARTIFACTS_DIR = process.env.E2E_ARTIFACTS_DIR
    ? path.resolve(process.env.E2E_ARTIFACTS_DIR)
    : path.resolve(__dirname, '../artifacts');
const STEP_SHOT_DIR = path.join(ARTIFACTS_DIR, 'steps');

const SCREENSHOT_OPTIONS = {
    timeout: 2000,
    killSignal: 'SIGKILL',
    stdio: 'ignore',
};

let screenshotIndex = 0;
let stepIndex = 0;
let deviceUdid = 'booted';
let platform = 'ios';

const setDeviceUdid = (udid) => {
    deviceUdid = udid;
};

const setScreenshotPlatform = (value) => {
    platform = value;
};

const sanitize = (value) =>
    String(value || 'step')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .slice(0, 80);

const nextStepIndex = () => {
    stepIndex += 1;
    return stepIndex;
};

const takeScreenshot = () => {
    if (!existsSync(ARTIFACTS_DIR)) {
        mkdirSync(ARTIFACTS_DIR);
    }
    const screenShotFileName = `${ARTIFACTS_DIR}/screenshot-${screenshotIndex++}.png`;
    try {
        execSync(`xcrun simctl io ${deviceUdid} screenshot ${screenShotFileName}`, SCREENSHOT_OPTIONS);
    } catch (error) {
        console.error('error');
    }
};

const takeNamedScreenshot = (label) => {
    if (!existsSync(STEP_SHOT_DIR)) {
        mkdirSync(STEP_SHOT_DIR, { recursive: true });
    }
    const file = path.join(
        STEP_SHOT_DIR,
        `${platform}-${String(stepIndex).padStart(4, '0')}-${sanitize(label)}.png`,
    );
    try {
        if (platform === 'android') {
            const png = execFileSync('adb', ['-s', androidSerial(), 'exec-out', 'screencap', '-p'], {
                timeout: 8000,
                maxBuffer: 16 * 1024 * 1024,
            });
            writeFileSync(file, png);
        } else {
            execFileSync('xcrun', ['simctl', 'io', deviceUdid, 'screenshot', file], {
                timeout: 8000,
                stdio: 'ignore',
            });
        }
    } catch (error) {
        // keep the suite moving if a shot fails
    }
    return file;
};

let recording = null;

// iOS simulator only (the first 30 minutes of the run).
const startRecordingVideo = () => {
    if (process.platform !== 'darwin' || platform !== 'ios') {
        return;
    }
    if (!existsSync(ARTIFACTS_DIR)) {
        mkdirSync(ARTIFACTS_DIR, { recursive: true });
    }
    const recordingFileName = `${ARTIFACTS_DIR}/recording.mov`;

    if (existsSync(recordingFileName)) {
        unlinkSync(recordingFileName);
    }

    try {
        recording = spawn('xcrun', ['simctl', 'io', deviceUdid, 'recordVideo', `${recordingFileName}`], {
            timeout: 30 * 60 * 1000,
            stdio: 'ignore',
        });
    } catch (error) {
        console.error('error');
    }
};

// SIGINT lets simctl finish the file. Only this run's recorder: `killall simctl` also stopped
// other runs' recordings and log streams on the same machine.
const stopRecordingVideo = () => {
    if (recording) {
        recording.kill('SIGINT');
        recording = null;
    }
};

module.exports = {
    setDeviceUdid,
    setScreenshotPlatform,
    nextStepIndex,
    takeScreenshot,
    takeNamedScreenshot,
    startRecordingVideo,
    stopRecordingVideo,
};
