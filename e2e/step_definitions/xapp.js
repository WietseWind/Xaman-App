// xApps: what happens when the OS ends the process of the page (see src/screens/Modal/XAppBrowser/pageWatch.ts)
const { execFileSync } = require('child_process');
const { Then } = require('@cucumber/cucumber');
const { element, by, waitFor, device } = require('detox');

const { androidSerial } = require('../helpers/androidSerial');
const { clickByTestId, unlockAndroidPasscodeWhenItShows } = require('../helpers/tapById');
const { getCurrentTestPasscode } = require('../helpers/testCredentials');

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// iOS simulator: the web content processes of a simulator are children of its launchd_sim on this Mac
const iosPageProcesses = () => {
    const processes = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8', timeout: 10000 })
        .split('\n')
        .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
        .filter(Boolean)
        .map(([, pid, ppid, command]) => ({ pid: Number(pid), ppid: Number(ppid), command }));
    const launchd = processes.find(
        (p) => p.command.indexOf('launchd_sim') !== -1 && p.command.indexOf(device.id) !== -1,
    );
    if (!launchd) {
        throw new Error(`no launchd_sim of simulator ${device.id}`);
    }
    return processes
        .filter((p) => p.ppid === launchd.pid && p.command.indexOf('com.apple.WebKit.WebContent') !== -1)
        .map((p) => p.pid);
};

// Android emulator: the renderer of the WebView is a sandboxed process; ending it needs root (emulator images have su)
const androidShell = (command) =>
    execFileSync('adb', ['-s', androidSerial(), 'shell', command], { encoding: 'utf8', timeout: 15000 });

const androidPageProcesses = () =>
    androidShell('ps -A -o PID,NAME')
        .split('\n')
        .filter((line) => line.indexOf('sandboxed_process') !== -1)
        .map((line) => line.trim().split(/\s+/)[0])
        .filter((pid) => /^\d+$/.test(pid));

Then('the OS ends the page process of the xApp', { timeout: 60 * 1000 }, async () => {
    if (device.getPlatform() === 'android') {
        const pids = androidPageProcesses();
        if (!pids.length) {
            throw new Error('no WebView renderer process on the emulator');
        }
        try {
            androidShell(`su 0 kill -9 ${pids.join(' ')}`);
        } catch (e) {
            // no root on this device: the scenario can not run here
            return 'skipped';
        }
        await sleep(1500);
        return undefined;
    }

    const pids = iosPageProcesses();
    if (!pids.length) {
        throw new Error('no web content process of the simulator');
    }
    pids.forEach((pid) => {
        try {
            process.kill(pid, 'SIGKILL');
        } catch (e) {
            // already gone
        }
    });
    await sleep(1500);
    return undefined;
});

// Back from another app Xaman shows its lock screen when the last unlock is longer ago than the auto lock time
Then('I unlock the app if it is locked', { timeout: 60 * 1000 }, async () => {
    if (device.getPlatform() === 'android') {
        await unlockAndroidPasscodeWhenItShows();
        return;
    }

    const passcode = getCurrentTestPasscode();
    try {
        await waitFor(element(by.id('lock-overlay'))).toExist().withTimeout(4000);
    } catch (e) {
        return;
    }
    await device.disableSynchronization();
    try {
        for (const digit of passcode.split('')) {
            await clickByTestId(`${digit}-key`);
        }
    } finally {
        try {
            await device.enableSynchronization();
        } catch (e) {
            // overlay already gone
        }
    }
    await waitFor(element(by.id('lock-overlay'))).not.toExist().withTimeout(10000);
});
