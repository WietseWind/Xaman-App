const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { device, element, by, waitFor, system } = require('detox');
const { getCurrentTestPasscode } = require('./testCredentials');

const BUNDLE = 'com.xrpllabs.xumm';
const CASES = [
    'first-use-grant', 'first-use-deny', 'blocked-settings-return', 'granted-preview-and-close',
    'locked-camera-session',
];
const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const view = (id) => element(by.id(id));
let sequence = 0;

// Native screenshots are read by Apple's Vision framework. No app state or SDK is mocked.
const OCR_SOURCE = `
import Foundation
import Vision
import ImageIO
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let source = CGImageSourceCreateWithURL(url as CFURL, nil)!
let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil)! as NSDictionary
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
try VNImageRequestHandler(url: url, options: [:]).perform([request])
let rows: [[String: Any]] = (request.results ?? []).compactMap { item in
    guard let text = item.topCandidates(1).first?.string else { return nil }
    return ["text": text, "x": item.boundingBox.minX, "y": item.boundingBox.minY,
            "width": item.boundingBox.width, "height": item.boundingBox.height]
}
let result: [String: Any] = ["width": properties[kCGImagePropertyPixelWidth]!,
    "height": properties[kCGImagePropertyPixelHeight]!, "rows": rows]
let data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
`;

function command(args) {
    return execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8', timeout: 30000 });
}

function target() {
    assert.strictEqual(device.getPlatform(), 'ios');
    const { devices } = JSON.parse(command(['list', 'devices', 'available', '--json']));
    const simulator = Object.values(devices).flat().find((item) => item.udid === device.id);
    assert(simulator, 'Camera permission tests require a simulator, never a phone');
    assert.strictEqual(simulator.name, process.env.E2E_CAMERA_IOS_SIMULATOR_NAME || 'Xaman-e2e');
    return simulator.udid;
}

function artifactDirectory() {
    const directory = path.join(
        process.env.E2E_ARTIFACTS_DIR || path.join(os.tmpdir(), 'xaman-e2e-artifacts'),
        'camera-permissions-ios',
    );
    fs.mkdirSync(directory, { recursive: true });
    return directory;
}

function nativeAuthorization(udid) {
    const database = path.join(
        os.homedir(), 'Library/Developer/CoreSimulator/Devices', udid, 'data/Library/TCC/TCC.db',
    );
    const value = execFileSync('sqlite3', [
        '-readonly', '-cmd', '.timeout 1000', database,
        `SELECT auth_value FROM access WHERE service='kTCCServiceCamera' AND client='${BUNDLE}';`,
    ], { encoding: 'utf8', timeout: 8000 }).trim();
    return value === '' ? null : Number(value);
}

function snapshot(udid, name) {
    const file = path.join(artifactDirectory(), `${String(sequence++).padStart(3, '0')}-${name}.png`);
    command(['io', udid, 'screenshot', file]);
    return file;
}

function recognize(file) {
    const directory = artifactDirectory();
    const digest = crypto.createHash('sha256').update(OCR_SOURCE).digest('hex').slice(0, 12);
    const binary = path.join(directory, `native-dialog-ocr-${digest}`);
    if (!fs.existsSync(binary)) {
        const source = `${binary}.swift`;
        fs.writeFileSync(source, OCR_SOURCE);
        execFileSync('xcrun', ['swiftc', '-O', source, '-o', binary, '-framework', 'Vision', '-framework', 'ImageIO',
            '-module-cache-path', path.join(directory, 'swift-module-cache')], { timeout: 120000, stdio: 'pipe' });
    }
    return JSON.parse(execFileSync(binary, [file], { encoding: 'utf8', timeout: 30000 }));
}

const normalize = (text) => text.replace(/[’‘]/g, '\'').trim().toLowerCase();

function cameraDialog(image) {
    const { rows } = image;
    const allow = rows.find((row) => /^(allow|ok)$/.test(normalize(row.text)));
    const deny = rows.find((row) => normalize(row.text) === 'don\'t allow');
    const camera = rows.some((row) => normalize(row.text).includes('camera'));
    return camera && allow && deny ? { allow, deny } : null;
}

async function exists(id, timeout = 20000) {
    await waitFor(view(id)).toExist().withTimeout(timeout);
}

async function has(id, timeout = 1000) {
    try {
        await exists(id, timeout);
        return true;
    } catch {
        return false;
    }
}

async function stableFrame(id) {
    const deadline = Date.now() + 10000;
    let previous;
    let stable = 0;
    do {
        const attributes = await view(id).getAttributes();
        const current = JSON.stringify(attributes.frame);
        stable = current === previous && attributes.visible !== false && attributes.enabled !== false ? stable + 1 : 0;
        if (stable >= 3) return;
        previous = current;
        await pause(100);
    } while (Date.now() < deadline);
    throw new Error(`Native frame did not settle for ${id}`);
}

async function tap(id) {
    await waitFor(view(id)).toBeVisible(id.startsWith('scan-') ? 100 : 75).withTimeout(15000);
    await stableFrame(id);
    const corner = id.startsWith('scan-') || id === 'auto-lock-button';
    await view(id).tap(corner ? { x: 8, y: 8 } : undefined);
}

async function screenReady(incoming, outgoing) {
    if (outgoing) await waitFor(view(outgoing)).not.toBeVisible(75).withTimeout(15000);
    await waitFor(view(incoming)).toBeVisible(75).withTimeout(15000);
    await stableFrame(incoming);
}

async function unlock() {
    if (await has('lock-overlay', 1500)) {
        const passcode = getCurrentTestPasscode();
        assert(passcode && /^\d{6}$/.test(passcode), 'Set E2E_PASSCODE for the retained test profile');
        for (const digit of passcode) await view(`${digit}-key`).tap();
        await waitFor(view('lock-overlay')).not.toExist().withTimeout(15000);
    }
}

async function relaunch(udid, permission) {
    await device.terminateApp();
    command(['privacy', udid, permission, 'camera', BUNDLE]);
    assert.strictEqual(nativeAuthorization(udid), permission === 'grant' ? 2 : null);
    // No launch-time camera override: these cases must exercise the real system prompt.
    await device.launchApp({ newInstance: true, launchArgs: { detoxEnableSynchronization: 0 } });
    await device.disableSynchronization();
    await unlock();
}

async function openScanner() {
    try {
        await waitFor(view('home-tab-view')).toBeVisible(75).withTimeout(1000);
    } catch {
        await tap('tab-Home');
    }
    await waitFor(view('home-tab-view')).toBeVisible(75).withTimeout(15000);
    await waitFor(element(by.id('tab-Home').and(by.traits(['selected'])))).toExist().withTimeout(15000);
    await stableFrame('tab-Home');
    await tap('tab-Actions');
    await screenReady('home-actions-overlay');
    await tap('scan-qr-button');
    await exists('scan-modal');
}

async function systemChoice(udid, caseName, choice, report) {
    const end = Date.now() + 30000;
    let dialog;
    let image;
    let file;
    do {
        file = snapshot(udid, `${caseName}-system-dialog`);
        image = recognize(file);
        dialog = cameraDialog(image);
        if (!dialog) await pause(700);
    } while (!dialog && Date.now() < end);
    assert(dialog, 'The actual iOS camera permission dialog must be visible');
    report.dialog = { screenshot: file, text: image.rows.map((row) => row.text) };
    report.dialog.choice = choice;
    const labels = choice === 'allow' ? ['Allow'] : ['Don’t Allow', 'Don\'t Allow'];
    for (const label of labels) {
        try {
            await system.element(by.system.label(label)).tap();
            report.dialog.nativeButton = label;
            break;
        } catch (error) {
            // Native labels differ only in apostrophe typography across iOS versions.
            if (label === labels[labels.length - 1] || !String(error).includes('does not exist')) throw error;
        }
    }
    const expected = choice === 'allow' ? 2 : 0;
    const deadline = Date.now() + 10000;
    while (nativeAuthorization(udid) !== expected && Date.now() < deadline) await pause(200);
    assert.strictEqual(nativeAuthorization(udid), expected, 'Native camera TCC must match the OS-dialog choice');
    report.nativeAuthorization = expected;
}

async function assertDenied(udid, name, report) {
    await exists('scan-permission-approve-button');
    await exists('scan-permission-close-button');
    await waitFor(view('scan-camera-retry-button')).not.toExist().withTimeout(3000);
    assert.strictEqual(nativeAuthorization(udid), 0);
    report.deniedScreenshot = snapshot(udid, `${name}-denied`);
}

async function assertGrantedAndClose(udid, name, report) {
    assert.strictEqual(nativeAuthorization(udid), 2);
    await waitFor(view('scan-permission-approve-button')).not.toExist().withTimeout(15000);
    if (await has('scan-camera-retry-button', 3000)) {
        report.preview = 'Authorized; simulator has no usable camera. Real unavailable fallback is visible.';
        await tap('scan-camera-retry-button');
        await exists('scan-camera-retry-button');
        await waitFor(view('scan-permission-approve-button')).not.toExist().withTimeout(3000);
        report.authorizedScreenshot = snapshot(udid, `${name}-authorized-no-device`);
        await tap('scan-camera-unavailable-close-button');
    } else {
        await exists('scan-camera-preview');
        await exists('scan-clipboard-button');
        report.preview = 'Native preview component present; no physical camera frames or QR decoding asserted.';
        report.authorizedScreenshot = snapshot(udid, `${name}-authorized-preview`);
        await tap('scan-close-button');
    }
    await waitFor(view('scan-modal')).not.toExist().withTimeout(15000);
    await exists('home-tab-view');
    assert.strictEqual(nativeAuthorization(udid), 2);
}

function autoLockMinutes(label) {
    const match = String(label).match(/(\d+)\s*(seconds?|minutes?|hours?|days?|weeks?)\b/i);
    assert(match, 'The current auto-lock policy must be readable from its actual UI label');
    const unit = match[2].toLowerCase().replace(/s$/, '');
    const factors = { second: 1 / 60, minute: 1, hour: 60, day: 1440, week: 10080 };
    const value = Number(match[1]) * factors[unit];
    assert(Number.isInteger(value), 'Auto-lock policy must be an exact minute value');
    return value;
}

async function setAutoLock(minutes, beforeChange) {
    await tap('tab-Settings');
    await screenReady('settings-tab-screen', 'home-tab-view');
    await tap('security-button');
    await screenReady('security-settings-screen', 'settings-tab-screen');
    const previous = autoLockMinutes((await view('auto-lock-button').getAttributes()).label);
    if (beforeChange) beforeChange(previous);
    await tap('auto-lock-button');
    await screenReady('picker-modal', 'security-settings-screen');
    await view('picker-item-list').scrollTo(minutes >= 1440 ? 'bottom' : 'top');
    let found = false;
    for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
            await waitFor(view(`${minutes}-item`)).toBeVisible(75).withTimeout(700);
            found = true;
            break;
        } catch {
            await view('picker-item-list').swipe('up', 'slow', 0.5);
        }
    }
    assert(found, 'The requested auto-lock policy must be visible in the real picker');
    await tap(`${minutes}-item`);
    await waitFor(view('picker-modal')).not.toExist().withTimeout(15000);
    await screenReady('security-settings-screen');
    assert.strictEqual(autoLockMinutes((await view('auto-lock-button').getAttributes()).label), minutes);
    await tap('back-button');
    await waitFor(view('security-settings-screen')).not.toExist().withTimeout(15000);
    await screenReady('settings-tab-screen');
    await tap('tab-Home');
    await screenReady('home-tab-view', 'settings-tab-screen');
    await waitFor(element(by.id('tab-Home').and(by.traits(['selected'])))).toExist().withTimeout(15000);
    return previous;
}

async function lockedCameraSession(udid, report) {
    let previous;
    let failure;
    let unlockFailed = false;
    try {
        await setAutoLock(0, (value) => {
            previous = value;
            report.previousAutoLockMinutes = value;
        });
        await openScanner();
        assert.strictEqual(nativeAuthorization(udid), 2);
        await screenReady('scan-modal', 'home-actions-overlay');
        await waitFor(view('scan-camera-paused-view')).not.toExist().withTimeout(15000);
        const readyCamera = await has('scan-camera-retry-button', 3000)
            ? 'scan-camera-retry-button' : 'scan-camera-preview';
        await waitFor(view(readyCamera)).toBeVisible(100).withTimeout(15000);
        await stableFrame(readyCamera);
        report.beforeLockScreenshot = snapshot(udid, 'locked-camera-session-before');
        await device.sendToHome();
        await device.launchApp({ newInstance: false, launchArgs: { detoxEnableSynchronization: 0 } });
        await device.disableSynchronization();
        await exists('lock-overlay');
        const locked = snapshot(udid, 'locked-camera-session-paused');
        report.lockedScreenshot = locked;
        await exists('scan-camera-paused-view');
        await waitFor(view('scan-camera-preview')).not.toExist().withTimeout(5000);
        await waitFor(view('scan-permission-approve-button')).not.toExist().withTimeout(5000);
        assert.strictEqual(nativeAuthorization(udid), 2);
        assert.strictEqual(cameraDialog(recognize(locked)), null,
            'Lock must not open a new system camera permission prompt');
        report.scope = 'Native lock/pause UI gates and TCC; simulator cannot prove physical sensor release';
        try {
            await unlock();
        } catch (error) {
            unlockFailed = true;
            throw error;
        }
        await waitFor(view('scan-camera-paused-view')).not.toExist().withTimeout(15000);
        await assertGrantedAndClose(udid, 'locked-camera-session-resumed', report);
    } catch (error) {
        failure = error;
    } finally {
        try {
            // Release any session before failure cleanup, retaining the test account and OS.
            if (failure) await device.terminateApp();
            if (previous !== undefined) {
                if (unlockFailed) {
                    report.autoLockPolicyRestorePending = 'No second unlock attempt after authentication failure';
                } else {
                    let restoreAllowed = true;
                    if (failure) {
                        await device.launchApp({ newInstance: true, launchArgs: { detoxEnableSynchronization: 0 } });
                        await device.disableSynchronization();
                        try {
                            await unlock();
                        } catch (error) {
                            report.cleanupError = error.stack || String(error);
                            report.autoLockPolicyRestorePending = 'No second cleanup unlock attempt';
                            restoreAllowed = false;
                            await device.terminateApp();
                        }
                    }
                    if (restoreAllowed) {
                        await setAutoLock(previous);
                        report.autoLockPolicyRestored = true;
                    }
                }
            }
        } catch (error) {
            report.cleanupError = error.stack || String(error);
            if (previous !== undefined && !report.autoLockPolicyRestored) {
                report.autoLockPolicyRestorePending = true;
            }
            if (!failure) failure = error;
        }
    }
    if (failure) throw failure;
}

async function runCameraPermissionCase(caseName) {
    assert(CASES.includes(caseName), `Unknown camera permission case: ${caseName}`);
    const udid = target();
    const report = {
        caseName,
        source: 'Actual native TCC, system dialog and app UI; no camera mock',
        started: new Date().toISOString(),
    };
    try {
        const preGranted = caseName === 'granted-preview-and-close' || caseName === 'locked-camera-session';
        await relaunch(udid, preGranted ? 'grant' : 'reset');
        if (caseName === 'locked-camera-session') {
            await lockedCameraSession(udid, report);
        } else if (caseName === 'granted-preview-and-close') {
            await openScanner();
            const image = recognize(snapshot(udid, `${caseName}-already-granted`));
            assert.strictEqual(cameraDialog(image), null, 'An already granted camera must not show the OS dialog');
            await assertGrantedAndClose(udid, caseName, report);
        } else {
            await openScanner();
            await systemChoice(udid, caseName, caseName === 'first-use-grant' ? 'allow' : 'deny', report);
            if (caseName === 'first-use-grant') {
                await assertGrantedAndClose(udid, caseName, report);
            } else {
                await assertDenied(udid, caseName, report);
                await tap('scan-permission-close-button');
                await waitFor(view('scan-modal')).not.toExist().withTimeout(15000);
                if (caseName === 'blocked-settings-return') {
                    await openScanner();
                    await assertDenied(udid, caseName, report);
                    assert.strictEqual(cameraDialog(recognize(snapshot(udid, `${caseName}-blocked`))), null);
                    await tap('scan-permission-approve-button');
                    const deadline = Date.now() + 30000;
                    let settings;
                    let settingsReady = false;
                    do {
                        settings = snapshot(udid, `${caseName}-actual-settings`);
                        const text = recognize(settings).rows.map((row) => normalize(row.text)).join(' ');
                        settingsReady = text.includes('xaman') && text.includes('camera');
                        if (!settingsReady) await pause(500);
                    } while (!settingsReady && Date.now() < deadline);
                    assert(settingsReady, 'The actual Xaman Settings page must be visible');
                    report.settings = {
                        screenshot: settings,
                        permissionChange: 'Native TCC grant in real Settings; no physical Settings-toggle test.',
                    };
                    command(['privacy', udid, 'grant', 'camera', BUNDLE]);
                    assert.strictEqual(nativeAuthorization(udid), 2);
                    await device.launchApp({ newInstance: false, launchArgs: { detoxEnableSynchronization: 0 } });
                    await device.disableSynchronization();
                    await unlock();
                    if (!(await has('scan-modal', 3000))) {
                        report.settings.returnMode = 'OS restarted the app; Scan reopened with retained grant';
                        await openScanner();
                    } else report.settings.returnMode = 'Existing Scan resumed from Settings';
                    await assertGrantedAndClose(udid, caseName, report);
                }
            }
        }
        report.finalNativeAuthorization = nativeAuthorization(udid);
        report.passed = true;
    } catch (error) {
        report.passed = false;
        report.error = error.stack || String(error);
        report.failureScreenshot = snapshot(udid, `${caseName}-failure`);
        throw error;
    } finally {
        report.completed = new Date().toISOString();
        fs.writeFileSync(path.join(artifactDirectory(), `${caseName}-report.json`), `${JSON.stringify(report, null, 2)}\n`);
    }
}

module.exports = { runCameraPermissionCase };
