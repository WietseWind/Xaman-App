const { spawn } = require('child_process');
const { createWriteStream, existsSync, unlinkSync, mkdirSync } = require('fs');
const path = require('path');

const ARTIFACTS_DIR = process.env.E2E_ARTIFACTS_DIR
    ? path.resolve(process.env.E2E_ARTIFACTS_DIR)
    : path.resolve(__dirname, '../artifacts');

let logProcess = null;

// iOS simulator log of the app, for this run's simulator only.
const startDeviceLogStream = (udid) => {
    if (process.platform !== 'darwin' || !udid) {
        return;
    }
    const logFile = `${ARTIFACTS_DIR}/simulator.log`;

    if (!existsSync(ARTIFACTS_DIR)) {
        mkdirSync(ARTIFACTS_DIR, { recursive: true });
    }

    if (existsSync(logFile)) {
        unlinkSync(logFile);
    }

    const logStream = createWriteStream(logFile);

    const args = ['simctl', 'spawn', udid, 'log', 'stream', '--predicate', 'process == "Xaman"'];
    const proc = spawn('xcrun', args, { stdio: 'pipe' });

    proc.stdout.pipe(logStream);
    proc.stderr.pipe(logStream);

    proc.on('error', () => {
        proc.kill();
    });
    logProcess = proc;
};

const stopDeviceLogStream = () => {
    if (logProcess) {
        logProcess.kill('SIGTERM');
        logProcess = null;
    }
};

module.exports = { startDeviceLogStream, stopDeviceLogStream };
