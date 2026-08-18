const { spawn, kill } = require('child_process');
const { createWriteStream, existsSync, unlinkSync, mkdirSync } = require('fs');
const path = require('path');

const ARTIFACTS_DIR = path.resolve(__dirname, '../artifacts');

const startDeviceLogStream = (udid = 'booted') => {
    const logFile = `${ARTIFACTS_DIR}/simulator.log`;

    if (!existsSync(ARTIFACTS_DIR)) {
        mkdirSync(ARTIFACTS_DIR);
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
        kill(proc.pid);
    });
};

module.exports = { startDeviceLogStream };
