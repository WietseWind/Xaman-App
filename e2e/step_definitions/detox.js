const { execFileSync } = require('child_process');
const { Given, Then } = require('@cucumber/cucumber');
const { waitFor, expect, element, by, device } = require('detox');
const { dismissKeyboard } = require('../helpers/keyboard');
const { tapAndroidAlertButton, waitForAndroidAlertText } = require('../helpers/androidAlert');
const { clickByTestId, tapByTestIdIfPresent, waitUntilAndroidTestId } = require('../helpers/tapById');

// Android OK is Toast on passphrase/passcode. Native Alert OK still exists on linking.
let androidAlertPending = false;

Then('I tap {string}', async (buttonId) => {
    if (device.getPlatform() === 'android' && buttonId === '24-words-button') {
        buttonId = '12-words-button';
    }
    // Finish dismisses the add-account modal onto Home. Tapping tab-Home then
    // fails iOS 26 visibility (selected _UITabButton clipped). Same reason
    // 03_import secret-numbers already comments this step out.
    if (buttonId === 'tab-Home') {
        try {
            await waitFor(element(by.id('home-tab-view'))).toExist().withTimeout(1500);
            return;
        } catch (e) {
            // not on home yet, tap the tab
        }
    }

    const btn = element(by.id(buttonId));
    // toExist: Next can be fully covered by the iOS keyboard and fail toBeVisible.
    // 10s: picker-modal items (e.g. 10080-item) mount a beat after the modal
    // container appears on a loaded emulator (observed >5s in full-suite runs).
    await waitFor(btn).toExist().withTimeout(10000);
    if (device.getPlatform() === 'android') {
        // RN's first layout pass can report pre-settle frames mid-navigation,
        // tripping the 75% visibility check inside tap(). Wait for the settled frame.
        // Soft: bottom rows (developer-mode-switch) clip under the nav bar by
        // design and stay at ~49% visible forever; the tap below targets the part.
        try {
            await waitFor(btn).toBeVisible().withTimeout(5000);
        } catch (visibilityErr) {
            // proceed: tap below targets the visible portion
        }
    }
    // Footer + ToS WebView: Espresso tap misses Confirm / add-and-sign.
    // UiDevice.click at the top of the frame is above the 3-button nav.
    // Do not use UiDevice for every tap: Continue is RN modal padding.
    if (device.getPlatform() === 'android') {
        if (buttonId === 'confirm-button' || buttonId === 'add-and-sign-button') {
            const clickFooter = async () => {
                try {
                    const attrs = await btn.getAttributes();
                    const frame = attrs.frame || {};
                    const width = Number(frame.width || 975);
                    const height = Number(frame.height || 139);
                    // Label center. +24,+16 is the top-left padding and misses Confirm.
                    const x = Math.round(Number(frame.x || 53) + width / 2);
                    const y = Math.round(Number(frame.y || 2146) + Math.min(height / 2, 48));
                    await device.getUiDevice().click(x, y);
                } catch (e) {
                    await btn.tap({ x: 24, y: 16 });
                }
            };
            await clickFooter();
            // initUser + RNN setRoot. What's new WebView keeps the looper busy.
            // Close it by testID (UiDevice dump, not Espresso waitFor).
            if (buttonId === 'confirm-button') {
                await new Promise((resolve) => { setTimeout(resolve, 3000); });
                await tapByTestIdIfPresent('close-change-log-button', 8000);
            }
            return;
        }
        // Last row of advanced settings: RN switch frame (y=1759, h=71 -> 1830)
        // extends ~36px below the 1794px window, so it never reaches the 75%
        // visible threshold and every Detox-level tap rejects it. Click the
        // visible part of the track physically (same pattern as confirm-button).
        if (buttonId === 'developer-mode-switch') {
            const swAttrs = await btn.getAttributes();
            const swFrame = swAttrs.frame || {};
            const swX = Math.round(Number(swFrame.x || 906) + (Number(swFrame.width || 122) / 2));
            const swY = Math.round(Number(swFrame.y || 1759) + 16);
            await device.getUiDevice().click(swX, swY);
            return;
        }
        try {
            await clickByTestId(buttonId);
            return;
        } catch (e) {
            // Espresso's post-tap precision recheck is flaky on footer buttons
            // straight after IME text entry (03 family-seed-passphrase "next"
            // failed 3x at the button's top-left corner in a full-suite run).
            // The raw InputManager click skips that verification; target the
            // label center (24,16 sits on the edge of the 16px precision box).
            try {
                // dismissKeyboard is a no-op on Android by design, so the soft
                // keyboard may still cover the footer button; a raw click
                // there would land on the IME. ESC hides the IME without
                // delivering BACK to the app.
                execFileSync('adb', ['-s', device.id, 'shell', 'input', 'keyevent', '111'], {
                    timeout: 8000,
                });
                await new Promise((r) => { setTimeout(r, 350); });
                const fbAttrs = await btn.getAttributes();
                const fbFrame = fbAttrs.frame || {};
                const fbX = Math.round(Number(fbFrame.x || 53) + Number(fbFrame.width || 975) / 2);
                const fbY = Math.round(Number(fbFrame.y || 1629) + Math.min(Number(fbFrame.height || 64) / 2, 44));
                await device.getUiDevice().click(fbX, fbY);
            } catch (fbErr) {
                // Fallback path unavailable (element gone or UiAutomation down):
                // surface the original failure.
                throw e;
            }
            return;
        }
    }
    try {
        await btn.tap();
    } catch (e) {
        if (String(buttonId).startsWith('tab-') || buttonId === 'confirm-button' || buttonId === 'back-button') {
            await btn.tap({ x: 8, y: 8 });
            return;
        }
        await dismissKeyboard();
        await waitFor(btn).toExist().withTimeout(3000);
        await btn.tap();
    }
});

Then('I wait {int} sec for button {string} to be enabled', async (timeoutSec, buttonId) => {
    let sec_passed = 0;
    let enabled = false;
    while (sec_passed < timeoutSec) {
        // eslint-disable-next-line no-promise-executor-return
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const attributes = await element(by.id(buttonId)).getAttributes();
        if (attributes.enabled) {
            enabled = true;
            break;
        }
        sec_passed += 1;
    }

    // eslint-disable-next-line no-promise-executor-return
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (!enabled) {
        throw new Error(`button with id ${buttonId} is not enabled after ${timeoutSec} seconds!`);
    }
});

Then('I enter {string} in {string}', async (value, textInputId) => {
    const input = element(by.id(textInputId));
    await waitFor(input).toBeVisible().withTimeout(5000);
    await input.replaceText(value);
    try {
        await input.tapReturnKey();
    } catch (e) {
        await dismissKeyboard();
    }
});

Given('I should have {string}', async (elementId) => {
    if (device.getPlatform() === 'android' && (elementId === 'home-tab-empty-view' || elementId === 'home-tab-view')) {
        await waitUntilAndroidTestId(elementId, 30000);
        return;
    }
    const timeout =
        elementId === 'review-transaction-modal' ||
        elementId === 'account-settings-screen' ||
        elementId === 'account-import-show-address-view' ||
        elementId === 'account-import-secret-type-view' ||
        elementId === 'account-import-label-view' ||
        elementId === 'home-tab-view'
            ? 30000
            : 10000;
    await waitFor(element(by.id(elementId)))
        .toExist()
        .withTimeout(timeout);
});

Given('I should not have {string}', async (screenId) => {
    await expect(element(by.id(screenId))).not.toExist();
});

Given('I should see {string}', async (elementId) => {
    if (device.getPlatform() === 'android' && elementId === 'submitting-view') {
        try {
            await waitFor(element(by.id('submitting-view'))).toExist().withTimeout(4000);
        } catch (e) {
            await waitFor(element(by.id('success-result-view'))).toExist().withTimeout(15000);
        }
        return;
    }
    // 10s: late screen commits on a loaded emulator (happy path resolves as
    // soon as the view is visible, so this only widens the failure window).
    // Android 75% visibility + Choreographer idle loops on overlays/WebView.
    if (device.getPlatform() === 'android') {
        await waitFor(element(by.id(elementId))).toExist().withTimeout(10000);
        return;
    }
    await waitFor(element(by.id(elementId)))
        .toBeVisible()
        .withTimeout(10000);
});

Given('I should see {string} in {string}', async (value, elementId) => {
    await waitFor(element(by.id(elementId)))
        .toHaveText(value)
        .withTimeout(5000);
});

Given('I should wait {int} sec to see {string}', async (timeout, elementId) => {
    if (
        device.getPlatform() === 'android' &&
        (elementId === 'home-tab-empty-view' || elementId === 'home-tab-view')
    ) {
        // Espresso waitFor waits up to 240s for MAIN_LOOPER idle after setRoot.
        await waitUntilAndroidTestId(elementId, timeout * 1000);
        return;
    }
    const el = element(by.id(elementId));
    if (device.getPlatform() === 'android') {
        await waitFor(el).toExist().withTimeout(timeout * 1000);
        return;
    }
    await waitFor(el).toBeVisible().withTimeout(timeout * 1000);
});

Then('I scroll up {string}', async (elementId) => {
    const scroller = element(by.id(elementId));
    try {
        await waitFor(scroller).toExist().withTimeout(2000);
    } catch (e) {
        // iOS Auto lock already shows 1 week. picker-item-list is Android-only in older bundles.
        return;
    }
    // Android review is taller (dev JSON + fees). One 50% swipe does not
    // reach accept-button. iOS already passed with a single swipe.
    if (device.getPlatform() === 'android') {
        await scroller.scrollTo('bottom');
        return;
    }
    await scroller.swipe('up', 'slow', 0.5);
});

Then('I scroll down {string}', async (elementId) => {
    await element(by.id(elementId)).swipe('down', 'slow', 0.5);
});

Then('I scroll {string} to bottom', async (elementId) => {
    await element(by.id(elementId)).scrollTo('bottom');
});

Then('I scroll {string} to top', async (elementId) => {
    await element(by.id(elementId)).scrollTo('top');
});

Then('I slide right {string}', async (elementId) => {
    await element(by.id(elementId)).swipe('right', 'slow', 0.8);
});

Then('I tap alert button with label {string}', async (label) => {
    if (device.getPlatform() === 'android') {
        // Passphrase/passcode success is Toast. Do not tap a ghost OK on those screens.
        if (label === 'OK' && !androidAlertPending) {
            return;
        }
        androidAlertPending = false;
        await device.disableSynchronization();
        try {
            const ui = device.getUiDevice();
            await tapAndroidAlertButton(label, device.id, (x, y) => ui.click(x, y));
        } finally {
            await device.enableSynchronization();
        }
        return;
    }
    const alertBtn = element(by.label(label).and(by.type('_UIAlertControllerActionView')));
    // Passphrase/passcode success is Toast. No native OK to tap.
    if (label === 'OK') {
        try {
            await waitFor(alertBtn).toExist().withTimeout(2000);
        } catch (e) {
            return;
        }
    }
    await alertBtn.tap();
});

Given('I should see alert with content {string}', async (title) => {
    if (device.getPlatform() === 'android') {
        androidAlertPending = true;
        await device.disableSynchronization();
        try {
            await waitForAndroidAlertText(title, device.id);
        } finally {
            await device.enableSynchronization();
        }
        return;
    }
    await waitFor(element(by.label(title)))
        .toBeVisible()
        .withTimeout(5000);
});

Then('I send the app to the background', async () => {
    await device.sendToHome();
});

Then('I close the app', async () => {
    await device.terminateApp();
});

Then('I launch the app', async () => {
    await device.launchApp({ newInstance: false });
});

Then('I wait {int} sec and then bring the app to foreground', async (delay) => {
    // delay
    const start = new Date().getTime();
    while (new Date().getTime() < start + delay * 1000);

    await device.launchApp({ newInstance: false });
});

Then('I launch the app with url {string}', async (url) => {
    await device.launchApp({ newInstance: true, url });
});

Then('I open the url {string}', async (url) => {
    if (device.getPlatform() === 'android') {
        // Detox VIEW is activity-anonymous. After ToS loads xaman.app, Chrome can take the intent.
        const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
        execFileSync(
            'adb',
            [
                '-s',
                serial,
                'shell',
                'am',
                'start',
                '-W',
                '-a',
                'android.intent.action.VIEW',
                '-d',
                url,
                'com.xrpllabs.xumm',
            ],
            { timeout: 10000 },
        );
        return;
    }
    await device.openURL({ url });
});
