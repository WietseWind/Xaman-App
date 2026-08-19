const { execFileSync } = require('child_process');

const sleep = (ms) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

const resolveSerial = (serial) => process.env.ANDROID_SERIAL || serial || 'emulator-5554';

const dumpWindows = (serial) => {
    const out = execFileSync('adb', ['-s', serial, 'exec-out', 'uiautomator', 'dump', '/dev/tty'], {
        encoding: 'utf8',
        timeout: 8000,
    });
    const start = out.indexOf('<hierarchy');
    if (start < 0) {
        throw new Error(`uiautomator dump failed: ${out.slice(0, 240)}`);
    }
    return out.slice(start);
};

const boundsFromTag = (tag) => {
    const bounds = tag.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!bounds) {
        return null;
    }
    return {
        x: Math.floor((Number(bounds[1]) + Number(bounds[3])) / 2),
        y: Math.floor((Number(bounds[2]) + Number(bounds[4])) / 2),
    };
};

const boundsForText = (xml, label) => {
    const nodes = xml.match(/<node [^>]*>/g) || [];
    for (let i = 0; i < nodes.length; i += 1) {
        const tag = nodes[i];
        const text = (tag.match(/text="([^"]*)"/) || [])[1];
        if (text === label) {
            const point = boundsFromTag(tag);
            if (point) {
                return point;
            }
        }
    }
    return null;
};

const findAlertPoint = (xml, label) => {
    const byText = boundsForText(xml, label);
    if (byText) {
        return byText;
    }
    // Positive dialog action when the label is the default confirm.
    if (label === 'OK' || label === "Yes, I'm sure") {
        const nodes = xml.match(/<node [^>]*>/g) || [];
        for (let i = 0; i < nodes.length; i += 1) {
            const tag = nodes[i];
            if (tag.includes('resource-id="android:id/button1"')) {
                return boundsFromTag(tag);
            }
        }
    }
    if (label === 'Cancel') {
        const nodes = xml.match(/<node [^>]*>/g) || [];
        for (let i = 0; i < nodes.length; i += 1) {
            const tag = nodes[i];
            if (tag.includes('resource-id="android:id/button2"')) {
                return boundsFromTag(tag);
            }
        }
    }
    return null;
};

const waitForAndroidAlertText = async () => {
    // dump is SIGKILL'd under instrumentation. The next keyevent tap is the check.
    await sleep(500);
};

// RN Alert is a native AlertDialog. Dump is SIGKILL'd under Detox.
// Coords are for AVD 1080x2400. Short Success OK is higher; downgrade Yes is lower.
const ALERT_TAPS = {
    OK: ['900', '1380'],
    Cancel: ['585', '1530'],
    "Yes, I'm sure": ['832', '1530'],
};

const tapAndroidAlertButton = async (label, serial) => {
    const adbSerial = resolveSerial(serial);
    await sleep(400);
    const [x, y] = ALERT_TAPS[label] || ALERT_TAPS.OK;
    execFileSync('adb', ['-s', adbSerial, 'shell', 'input', 'tap', x, y]);
};

module.exports = { tapAndroidAlertButton, waitForAndroidAlertText };
