const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { device } = require('detox');
const { takeNamedScreenshot } = require('./artifacts');
const { getCurrentTestPasscode } = require('./testCredentials');
const {
    androidHasTestId,
    androidDumpIncludes,
    androidReadTextByTestId,
    androidSwipeTestId,
    clickAndroidLabel,
    clickByTestId,
    enterAndroidPasscode,
    tapByTestIdIfPresent,
    waitUntilAndroidRnReady,
    waitUntilAndroidTestId,
} = require('./tapById');

const APP = 'com.xrpllabs.xumm';
const CAMERA = 'android.permission.CAMERA';
const CASES = [
    'first-use-grant',
    'first-use-deny',
    'blocked-settings-return',
    'granted-preview-and-close',
    'locked-camera-session',
];
const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms); });

const adb = (...args) => {
    const serial = process.env.ANDROID_SERIAL || device.id;
    // These tests reset runtime permissions. Never select a USB phone implicitly.
    assert(/^emulator-\d+$/.test(serial), 'Camera permission tests require an Android emulator');
    assert.strictEqual(serial, device.id, 'Camera permission emulator must be the Detox device');
    return execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', timeout: 15000 });
};

const waitUntil = async (condition, description, timeout = 15000) => {
    const end = Date.now() + timeout;
    do {
        if (await condition()) return;
        await sleep(300);
    } while (Date.now() < end);
    throw new Error(`Camera permission check timed out: ${description}`);
};

const cameraPermission = () => {
    const user = adb('shell', 'am', 'get-current-user').trim();
    const dump = adb('shell', 'dumpsys', 'package', APP);
    const blocks = dump.split(/\n\s*User /);
    const block = blocks.find(value => value.startsWith(`${user}:`) && value.includes('runtime permissions:'));
    assert(block, 'Current Android user permission state must exist');
    const row = block.match(/android\.permission\.CAMERA: granted=(true|false), flags=\[([^\]]*)\]/);
    assert(row, 'Android must report CAMERA permission and flags');
    return { granted: row[1] === 'true', flags: row[2].split('|').map(flag => flag.trim()).filter(Boolean) };
};

const nativeCameraState = () => {
    const cameraAppOps = adb('shell', 'appops', 'get', APP, 'CAMERA').trim();
    const media = adb('shell', 'dumpsys', 'media.camera');
    // Read only the current-client section: history contains earlier app sessions.
    const clients = media.match(/^Active Camera Clients:\s*\[([\s\S]*?)\]/m);
    assert(clients, 'Android camera service must report its current clients');
    return {
        cameraAppOps,
        running: cameraAppOps.includes('(running)'),
        activeCameraClient: clients[1].includes(APP),
        activeCameraClients: clients[1].trim(),
    };
};

const cameraSession = async running => {
    await waitUntil(() => {
        const state = nativeCameraState();
        return state.running === running && state.activeCameraClient === running;
    }, running ? 'native camera operation and active client' : 'native camera release', 15000);
};

const systemPrompt = async () => {
    const shown = (await androidDumpIncludes('permissioncontroller')) &&
        ((await androidHasTestId('permission_allow_foreground_only_button')) ||
            (await androidHasTestId('permission_allow_button')));
    return shown;
};

const dismissFailedSystemPrompt = () => {
    const activities = adb('shell', 'dumpsys', 'activity', 'activities');
    const permissionActivity =
        /(?:topResumedActivity|mResumedActivity)[^\n]*permissioncontroller[^\n]*GrantPermissionsActivity/;
    if (!permissionActivity.test(activities)) return false;
    // A failed input can leave the OS dialog above Launcher after the app stops.
    // Dismiss only that foreground dialog before ending this test's process.
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    return true;
};

const noSystemPrompt = async (duration = 1500) => {
    const end = Date.now() + duration;
    do {
        assert(!(await systemPrompt()), 'Camera permission must not open another system prompt automatically');
        await sleep(300);
    } while (Date.now() < end);
};

const snapshot = (caseName, stage, events) => {
    const permission = cameraPermission();
    events.push({ stage, permission, ...nativeCameraState() });
    takeNamedScreenshot(`camera-${caseName}-${events.length}-${stage}`);
    return permission;
};

const restart = async passcode => {
    await device.launchApp({
        newInstance: true,
        // Camera is deliberately absent: each case tests a real OS decision.
        permissions: { notifications: 'YES' },
        // Exclude separate destructive native vault tests from this E2E launch.
        launchArgs: { detoxEnableSynchronization: 0, class: 'com.xrpllabs.xumm.DetoxTest' },
    });
    await device.disableSynchronization();
    await waitUntilAndroidRnReady();
    if (await androidHasTestId('lock-overlay')) {
        await enterAndroidPasscode(passcode);
        await waitUntil(async () => !(await androidHasTestId('lock-overlay')), 'app unlock');
    }
    await tapByTestIdIfPresent('close-change-log-button', 1000);
    await clickByTestId('tab-Home');
};

const resetPermission = async (grant, passcode) => {
    await device.terminateApp();
    adb('shell', 'pm', 'revoke', '--user', 'current', APP, CAMERA);
    adb('shell', 'pm', 'clear-permission-flags', '--user', 'current', APP, CAMERA, 'user-set', 'user-fixed');
    if (grant) adb('shell', 'pm', 'grant', '--user', 'current', APP, CAMERA);
    const permission = cameraPermission();
    assert.strictEqual(permission.granted, grant, 'Fixture must set the requested native Camera state');
    assert(!permission.flags.includes('USER_SET') && !permission.flags.includes('USER_FIXED'),
        'Fresh fixture must remove previous Camera decisions');
    await restart(passcode);
};

const openScanner = async () => {
    // The existing tab listener debounces all bottom-tab presses for 300ms.
    // Let the preceding Home selection settle before the real center press.
    await sleep(450);
    const selected = await androidDumpIncludes('content-desc="selected, , tab, 3 out of 5"');
    await clickByTestId(selected ? 'selected, , tab, 3 out of 5' : ', tab, 3 out of 5');
    await waitUntilAndroidTestId('scan-qr-button', 10000);
    await clickByTestId('scan-qr-button');
    await waitUntil(async () => {
        const shown = (await systemPrompt()) || (await androidHasTestId('scan-modal'));
        return shown;
    }, 'scanner or its actual system permission prompt');
};

const settleSystemPermissionDialog = async () => {
    // The Android permission window can move after its accessibility nodes first
    // appear. Wait for that native window to settle before reading tap bounds.
    // The ordinary app driver keeps this timeout at zero for animated RN views.
    const manager = device.deviceDriver.invocationManager;
    const setIdleTimeout = value => manager.execute({
        target: {
            type: 'Invocation',
            value: {
                target: { type: 'Class', value: 'androidx.test.uiautomator.Configurator' },
                method: 'getInstance',
                args: [],
            },
        },
        method: 'setWaitForIdleTimeout',
        args: [{ type: 'Integer', value }],
    });
    const started = Date.now();
    await setIdleTimeout(1000);
    try {
        await device.getUiDevice().waitForIdle();
    } finally {
        await setIdleTimeout(0);
    }
    return Date.now() - started;
};

const chooseSystemPermission = async (allow, caseName, events) => {
    await waitUntil(systemPrompt, 'actual Android camera permission prompt');
    snapshot(caseName, allow ? 'system-grant-prompt' : 'system-deny-prompt', events);
    const message = await androidReadTextByTestId('permission_message');
    assert(/camera|pictures|photos|video/i.test(message || ''), 'System prompt must request Camera access');
    events[events.length - 1].systemPromptMessage = message;
    events[events.length - 1].nativeDialogIdleWaitMs = await settleSystemPermissionDialog();
    const ids = allow
        ? ['permission_allow_foreground_only_button', 'permission_allow_button']
        : ['permission_deny_button', 'permission_deny_and_dont_ask_again_button'];
    let selected;
    for (const id of ids) {
        if (await androidHasTestId(id)) { selected = id; break; }
    }
    assert(selected, 'Expected real Android permission decision button');
    await clickByTestId(selected);
    await waitUntil(async () => !(await systemPrompt()), 'OS permission dialog dismissal');
    await waitUntil(() => cameraPermission().granted === allow, 'native CAMERA grant result');
};

const permissionFallback = async () => {
    await waitUntilAndroidTestId('scan-permission-approve-button', 15000);
    await waitUntilAndroidTestId('scan-permission-close-button', 15000);
    assert(!cameraPermission().granted, 'Permission fallback must correspond to a native denial');
    await noSystemPrompt();
};

const previewControls = async () => {
    await waitUntilAndroidTestId('scan-camera-preview', 15000);
    await waitUntilAndroidTestId('scan-close-button', 15000);
    await waitUntilAndroidTestId('scan-clipboard-button', 15000);
    assert(cameraPermission().granted, 'Preview controls require native Camera access');
    assert(!(await androidHasTestId('scan-permission-approve-button')), 'Granted camera must leave permission UI');
    assert(!(await androidHasTestId('scan-camera-retry-button')), 'Working emulator camera must leave failure UI');
    await cameraSession(true);
    await noSystemPrompt();
};

const closeScanner = async permission => {
    await clickByTestId(permission ? 'scan-permission-close-button' : 'scan-close-button');
    await waitUntil(async () => !(await androidHasTestId('scan-modal')), 'native scanner dismissal');
    await cameraSession(false);
};

const autoLockMinutes = label => {
    const match = String(label).match(/(\d+)\s*(seconds?|minutes?|hours?|days?|weeks?)\b/i);
    assert(match, 'Current auto-lock policy must be readable from its actual UI label');
    const factors = { second: 1 / 60, minute: 1, hour: 60, day: 1440, week: 10080 };
    const value = Number(match[1]) * factors[match[2].toLowerCase().replace(/s$/, '')];
    assert(Number.isInteger(value), 'Auto-lock policy must be an exact minute value');
    return value;
};

const setLockTimeout = async (minutes, beforeChange) => {
    await clickByTestId('tab-Settings');
    await waitUntilAndroidTestId('security-button', 10000);
    await clickByTestId('security-button');
    await waitUntilAndroidTestId('auto-lock-button', 10000);
    const previous = autoLockMinutes(await androidReadTextByTestId('auto-lock-button'));
    if (beforeChange) beforeChange(previous);
    await clickByTestId('auto-lock-button');
    await waitUntilAndroidTestId('picker-modal', 10000);
    const item = `${minutes}-item`;
    for (let attempt = 0; !(await androidHasTestId(item)); attempt += 1) {
        assert(attempt < 6, 'Lock timeout option must be reachable');
        await androidSwipeTestId('picker-item-list', minutes === 0 ? 'down' : 'up');
    }
    await clickByTestId(item);
    await waitUntilAndroidTestId('security-settings-screen', 10000);
    assert.strictEqual(autoLockMinutes(await androidReadTextByTestId('auto-lock-button')), minutes);
    await clickByTestId('back-button');
    await waitUntilAndroidTestId('settings-tab-screen', 10000);
    await clickByTestId('tab-Home');
    return previous;
};

const verifyLockedCamera = async (caseName, events, passcode) => {
    let previous;
    let failure;
    let unlockFailed = false;
    try {
        await setLockTimeout(0, value => { previous = value; });
        events.push({ stage: 'original-auto-lock-policy', minutes: previous });
        await openScanner();
        await previewControls();
        snapshot(caseName, 'unlocked-session-running', events);
        await device.sendToHome();
        // Traverse the actual Android background lifecycle before returning to lock.
        await sleep(1000);
        await device.launchApp({
            newInstance: false,
            launchArgs: { detoxEnableSynchronization: 0, class: 'com.xrpllabs.xumm.DetoxTest' },
        });
        await waitUntilAndroidTestId('lock-overlay', 15000);
        await waitUntilAndroidTestId('scan-camera-paused-view', 15000);
        assert(cameraPermission().granted, 'Lock must pause the camera without revoking native access');
        assert(!(await androidHasTestId('scan-camera-preview')), 'Locked scanner must unmount its native camera');
        await cameraSession(false);
        await noSystemPrompt();
        snapshot(caseName, 'locked-camera-session-off', events);
        unlockFailed = true;
        await enterAndroidPasscode(passcode);
        await waitUntil(async () => !(await androidHasTestId('lock-overlay')), 'camera lock dismissal');
        unlockFailed = false;
        await previewControls();
        snapshot(caseName, 'unlocked-session-resumed', events);
        await closeScanner(false);
    } catch (error) {
        failure = error;
    } finally {
        try {
            if (failure) {
                await device.terminateApp();
                await cameraSession(false);
                // Do not repeat a failed PIN attempt just to restore a test preference.
                assert(!unlockFailed, 'Auto-lock restore skipped after failed unlock; camera is stopped');
                await restart(passcode);
            }
            if (previous !== undefined) {
                await setLockTimeout(previous);
                snapshot(caseName, 'closed-and-original-lock-timeout-restored', events);
            }
        } catch (error) {
            events.push({ stage: 'lock-policy-cleanup-failed', error: String(error) });
            if (!failure) failure = error;
        }
    }
    if (failure) throw failure;
};

const grantInSettings = async () => {
    await clickByTestId('scan-permission-approve-button');
    await waitUntil(() => androidDumpIncludes('package="com.android.settings"'), 'actual Android app Settings');
    await waitUntil(() => clickAndroidLabel('Permissions'), 'Settings Permissions row');
    await waitUntil(() => clickAndroidLabel('Camera'), 'Settings Camera row');
    await waitUntil(() => clickAndroidLabel('Allow only while using the app'), 'Settings Camera grant choice');
    await waitUntil(() => cameraPermission().granted, 'Camera granted through Settings');
    // Camera settings → permission list → app info → the still-open scanner.
    for (let i = 0; i < 3; i += 1) {
        adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
        await sleep(350);
    }
    await previewControls();
};

const runCameraPermissionCase = async (caseName, options = {}) => {
    assert.strictEqual(device.getPlatform(), 'android');
    assert(CASES.includes(caseName), `Unknown camera permission case: ${caseName}`);
    const passcode = options.passcode || getCurrentTestPasscode();
    assert(/^\d{6}$/.test(passcode || ''), 'Current test passcode tracking must be initialized');
    const events = [];
    let passed = false;
    try {
        await resetPermission(caseName === 'locked-camera-session', passcode);
        snapshot(caseName, 'fresh-permission-flags', events);
        if (caseName === 'locked-camera-session') {
            await verifyLockedCamera(caseName, events, passcode);
        } else {
            await openScanner();
        }
        if (caseName === 'first-use-deny' || caseName === 'blocked-settings-return') {
            await chooseSystemPermission(false, caseName, events);
            await permissionFallback();
            snapshot(caseName, 'denied-without-prompt-loop', events);
            await closeScanner(true);
            if (caseName === 'blocked-settings-return') {
                await openScanner();
                await chooseSystemPermission(false, caseName, events);
                await permissionFallback();
                assert(cameraPermission().flags.includes('USER_FIXED'),
                    'Two real OS denials must make Camera blocked on this Android runtime');
                await closeScanner(true);
                await openScanner();
                await permissionFallback();
                snapshot(caseName, 'blocked-no-system-prompt', events);
                await grantInSettings();
                snapshot(caseName, 'settings-return-preview', events);
                await closeScanner(false);
            }
        } else if (caseName !== 'locked-camera-session') {
            await chooseSystemPermission(true, caseName, events);
            await previewControls();
            snapshot(caseName, 'granted-preview', events);
            await closeScanner(false);
            if (caseName === 'granted-preview-and-close') {
                await openScanner();
                await previewControls();
                snapshot(caseName, 'granted-reopen-without-prompt', events);
                await closeScanner(false);
            }
        }
        passed = true;
    } catch (error) {
        try {
            if (dismissFailedSystemPrompt()) {
                events.push({ stage: 'failed-case-system-permission-dialog-dismissed' });
            }
            await device.terminateApp();
            await cameraSession(false);
            events.push({ stage: 'failed-case-native-camera-released' });
        } catch (cleanupError) {
            events.push({ stage: 'camera-cleanup-failed', error: String(cleanupError) });
            // Preserve the original assertion even if the instrumentation transport failed.
            try {
                adb('shell', 'am', 'force-stop', '--user', 'current', APP);
                await cameraSession(false);
            } catch (forceStopError) {
                events.push({ stage: 'camera-force-stop-failed', error: String(forceStopError) });
            }
        }
        throw error;
    } finally {
        const output = path.resolve(process.env.E2E_ARTIFACTS_DIR || path.join(__dirname, '../artifacts'));
        fs.mkdirSync(output, { recursive: true });
        fs.writeFileSync(path.join(output, `camera-${caseName}.json`), JSON.stringify({
            caseName,
            passed,
            events,
            scope: 'Actual emulator OS permission/UI; no SDK mocks, physical camera or optical QR decode claim',
        }, null, 2));
    }
};

module.exports = { runCameraPermissionCase };
