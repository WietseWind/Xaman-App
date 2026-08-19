const { execFileSync } = require('child_process');

const sleep = (ms) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

const dumpWindows = (serial) => {
    const out = execFileSync('adb', ['-s', serial, 'exec-out', 'uiautomator', 'dump', '/dev/tty'], {
        encoding: 'utf8',
        timeout: 8000,
    });
    const start = out.indexOf('<hierarchy');
    if (start < 0) {
        throw new Error(`uiautomator dump failed: ${out.slice(0, 200)}`);
    }
    return out.slice(start);
};

const boundsForText = (xml, label) => {
    const nodes = xml.match(/<node [^>]*>/g) || [];
    for (let i = 0; i < nodes.length; i += 1) {
        const tag = nodes[i];
        const text = (tag.match(/text="([^"]*)"/) || [])[1];
        const bounds = tag.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
        if (text === label && bounds) {
            return {
                x: Math.floor((Number(bounds[1]) + Number(bounds[3])) / 2),
                y: Math.floor((Number(bounds[2]) + Number(bounds[4])) / 2),
            };
        }
    }
    return null;
};

const waitForAndroidAlertText = async (label, serial) => {
    for (let i = 0; i < 12; i += 1) {
        try {
            if (boundsForText(dumpWindows(serial), label)) {
                return;
            }
        } catch (e) {
            // dump can fail while the dialog is opening
        }
        await sleep(400);
    }
    throw new Error(`Android alert text "${label}" not found`);
};

// RN Alert is a native AlertDialog. Espresso (Detox by.text) does not see it.
const tapAndroidAlertButton = async (label, serial) => {
    let point = null;
    for (let i = 0; i < 10; i += 1) {
        try {
            point = boundsForText(dumpWindows(serial), label);
        } catch (e) {
            point = null;
        }
        if (point) {
            break;
        }
        await sleep(400);
    }
    if (!point) {
        throw new Error(`Android alert button "${label}" not found`);
    }
    execFileSync('adb', ['-s', serial, 'shell', 'input', 'tap', String(point.x), String(point.y)]);
};

module.exports = { tapAndroidAlertButton, waitForAndroidAlertText };
