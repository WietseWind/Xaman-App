const { execFileSync } = require('child_process');
const path = require('path');
const fetch = require('node-fetch');

const log = (msg) => {
    // eslint-disable-next-line no-console
    console.error(`[e2e preflight] ${msg}`);
};

// The suite exercises the real Xaman backend (device registration, ToS, curated assets)
// and the real Xahau testnet (faucet funding, on-ledger signing). Without these reachable
// the run WILL fail — check up front and fail with a clear message instead of cryptic
// element timeouts halfway through the suite.
const REQUIRED_ENDPOINTS = [
    ['Xaman backend', 'https://xaman.app/api/v1/app/ping'],
    ['Xahau testnet faucet/node', 'https://xahau-test.net'],
];

const checkNetwork = async () => {
    for (const [label, url] of REQUIRED_ENDPOINTS) {
        try {
            // any HTTP response (including 4xx) proves reachability
            await fetch(url, { timeout: 10000 });
        } catch (error) {
            throw new Error(
                `e2e preflight failed: cannot reach ${label} (${url}): ${error.message}\n` +
                    'The e2e suite drives the real Xaman backend and the real Xahau testnet, ' +
                    'so it needs a working internet connection to run.',
            );
        }
    }
};

// The device entry of the Detox configuration this run uses, or null.
const detoxDevice = () => {
    const name = process.env.DETOX_CONFIGURATION;
    if (!name) {
        return null;
    }
    try {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const rc = require(path.resolve(__dirname, '../../.detoxrc.js'));
        const configuration = rc.configurations[name];
        if (!configuration) {
            return null;
        }
        return typeof configuration.device === 'string' ? rc.devices[configuration.device] : configuration.device;
    } catch (e) {
        return null;
    }
};

const isAndroidRun = () => {
    const entry = detoxDevice();
    return entry
        ? /^android\./.test(entry.type)
        : String(process.env.DETOX_CONFIGURATION || '').startsWith('android.');
};

// Dedicated e2e simulators ("Xaman-e2e…") are created when missing, so a fresh checkout can run
// without manual simctl setup. A simulator that is shut down is booted here, inside BeforeAll's
// long timeout: a fresh simulator's first boot took about 8 minutes, longer than detox.init waits.
const E2E_SIMULATOR_TYPE = process.env.E2E_IOS_DEVICE_TYPE || 'iPhone 16 Pro';

const simulators = () => {
    const out = execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], {
        encoding: 'utf8',
        timeout: 60000,
    });
    return Object.values(JSON.parse(out).devices).flat();
};

const prepareIosSimulator = () => {
    const entry = detoxDevice();
    const name = entry && entry.type === 'ios.simulator' && entry.device && entry.device.name;
    if (!name) {
        return;
    }
    let simulator = simulators().find((item) => item.name === name);
    if (!simulator && name.startsWith('Xaman-e2e')) {
        log(`creating missing "${name}" (${E2E_SIMULATOR_TYPE}) simulator`);
        execFileSync('xcrun', ['simctl', 'create', name, E2E_SIMULATOR_TYPE], { timeout: 120000 });
        simulator = simulators().find((item) => item.name === name);
    }
    if (!simulator || simulator.state === 'Booted') {
        return;
    }
    log(`booting "${name}" (a first boot takes minutes)`);
    const started = Date.now();
    execFileSync('xcrun', ['simctl', 'bootstatus', simulator.udid, '-b'], {
        stdio: 'ignore',
        timeout: 14 * 60 * 1000,
    });
    log(`"${name}" booted in ${Math.round((Date.now() - started) / 1000)} s`);
};

const adb = (args, timeout = 10000) => execFileSync('adb', args, { encoding: 'utf8', timeout }).trim();

const androidState = (serial) => {
    try {
        return adb(['-s', serial, 'get-state'], 5000);
    } catch (e) {
        return 'missing';
    }
};

const sleepSync = (seconds) => execFileSync('sleep', [String(seconds)]);

// Throws unless the device answers adb within timeoutMs.
const ensureAndroidOnline = (serial, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    let state = androidState(serial);
    while (state !== 'device' && Date.now() < deadline) {
        sleepSync(2);
        state = androidState(serial);
    }
    if (state !== 'device') {
        throw new Error(`e2e: Android device ${serial} is ${state}, not online`);
    }
};

// Before detox.init: the emulator named by ANDROID_SERIAL must be one adb keeps tracking, online
// and booted. adb only scans console ports 5554–5584; an emulator started on 5590 went offline
// halfway through a run. Under 4 GB of RAM the app ran under memory pressure.
const preflightAndroid = () => {
    const serial = process.env.ANDROID_SERIAL;
    if (!isAndroidRun() || !serial) {
        return;
    }
    const emulator = /^emulator-(\d+)$/.exec(serial);
    if (emulator) {
        const port = Number(emulator[1]);
        if (port < 5554 || port > 5584 || port % 2 !== 0) {
            throw new Error(
                `e2e preflight: ${serial} is outside adb's emulator range (even console ports 5554–5584), ` +
                    'so adb can drop it mid-run. Start the emulator with -port 5556…5584.',
            );
        }
    }
    ensureAndroidOnline(serial, 60000);
    const bootedBy = Date.now() + 3 * 60 * 1000;
    while (adb(['-s', serial, 'shell', 'getprop', 'sys.boot_completed']) !== '1') {
        if (Date.now() > bootedBy) {
            throw new Error(`e2e preflight: ${serial} did not finish booting in 3 minutes`);
        }
        sleepSync(3);
    }
    const memKb = Number((/MemTotal:\s+(\d+)/.exec(adb(['-s', serial, 'shell', 'cat', '/proc/meminfo'])) || [])[1]);
    if (memKb && memKb < 3.5 * 1024 * 1024) {
        log(`warning: ${serial} has ${(memKb / 1024 / 1024).toFixed(1)} GB RAM; start it with -memory 4096 or more`);
    }
};

// After detox.init: every adb helper must talk to the device Detox drives. ANDROID_SERIAL is set
// to Detox's device when it was not given.
const adoptDetoxAndroidDevice = (deviceId) => {
    const serial = process.env.ANDROID_SERIAL;
    if (serial && serial !== deviceId) {
        throw new Error(
            `e2e: ANDROID_SERIAL=${serial} but Detox drives ${deviceId}; the adb helpers would act on another device`,
        );
    }
    process.env.ANDROID_SERIAL = deviceId;
};

module.exports = {
    checkNetwork,
    prepareIosSimulator,
    preflightAndroid,
    adoptDetoxAndroidDevice,
    ensureAndroidOnline,
};
