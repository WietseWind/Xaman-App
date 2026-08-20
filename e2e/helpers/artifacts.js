const { execSync, spawn, exec } = require('child_process');
const { existsSync, mkdirSync, unlinkSync } = require('fs');
const path = require('path');

const ARTIFACTS_DIR = path.resolve(__dirname, '../artifacts');

const SCREENSHOT_OPTIONS = {
    timeout: 2000,
    killSignal: 'SIGKILL',
    stdio: 'ignore',
};

let screenshotIndex = 0;

let deviceUdid = 'booted';

const setDeviceUdid = (udid) => {
    deviceUdid = udid;
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

const startRecordingVideo = () => {
    if (process.platform !== 'darwin') {
        return;
    }
    if (!existsSync(ARTIFACTS_DIR)) {
        mkdirSync(ARTIFACTS_DIR);
    }
    const recordingFileName = `${ARTIFACTS_DIR}/recording.mov`;

    if (existsSync(recordingFileName)) {
        unlinkSync(recordingFileName);
    }

    try {
        spawn('xcrun', ['simctl', 'io', deviceUdid, 'recordVideo', `${recordingFileName}`], {
            timeout: 30 * 60 * 1000,
            maxBuffer: 1024 * 20 * 100,
        });
    } catch (error) {
        console.error('error');
    }
};

const stopRecordingVideo = () => {
    exec('killall -SIGINT simctl', {
        timeout: 15 * 1000,
        maxBuffer: 1024 * 20 * 100,
    });
};

module.exports = { setDeviceUdid, takeScreenshot, startRecordingVideo, stopRecordingVideo };
