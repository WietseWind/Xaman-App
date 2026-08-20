const { Given, Then } = require('@cucumber/cucumber');
const { waitFor, expect, element, by, device } = require('detox');
const { dismissKeyboard } = require('../helpers/keyboard');
const { tapAndroidAlertButton, waitForAndroidAlertText } = require('../helpers/androidAlert');

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
    await waitFor(btn).toExist().withTimeout(5000);
    // Footer + ToS WebView: Espresso tap misses Confirm / add-and-sign.
    // UiDevice.click at the top of the frame is above the 3-button nav.
    // Do not use UiDevice for every tap: Continue is RN modal padding.
    if (device.getPlatform() === 'android') {
        if (buttonId === 'confirm-button' || buttonId === 'add-and-sign-button') {
            const clickFooter = async () => {
                try {
                    const attrs = await btn.getAttributes();
                    const frame = attrs.frame || {};
                    const x = Math.round(Number(frame.x || 53) + 24);
                    const y = Math.round(Number(frame.y || 2146) + 16);
                    await device.getUiDevice().click(x, y);
                } catch (e) {
                    await btn.tap({ x: 24, y: 16 });
                }
            };
            await clickFooter();
            // ToS WebView eats the first press. If Confirm is gone, Home is up.
            if (buttonId === 'confirm-button') {
                for (let i = 0; i < 2; i += 1) {
                    await new Promise((resolve) => setTimeout(resolve, 1200));
                    try {
                        await waitFor(element(by.id('home-tab-empty-view'))).toExist().withTimeout(400);
                        return;
                    } catch (e) {
                        try {
                            await clickFooter();
                        } catch (retryErr) {
                            return;
                        }
                    }
                }
            }
            return;
        }
        await btn.tap({ x: 24, y: 16 });
        return;
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
    const timeout =
        elementId === 'review-transaction-modal' ||
        elementId === 'account-settings-screen' ||
        elementId === 'account-import-show-address-view' ||
        elementId === 'home-tab-view'
            ? 15000
            : 5000;
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
    await waitFor(element(by.id(elementId)))
        .toBeVisible()
        .withTimeout(5000);
});

Given('I should see {string} in {string}', async (value, elementId) => {
    await waitFor(element(by.id(elementId)))
        .toHaveText(value)
        .withTimeout(5000);
});

Given('I should wait {int} sec to see {string}', async (timeout, elementId) => {
    const el = element(by.id(elementId));
    // Android 75% visibility fails on tall AVD / overlay. Existence is enough.
    if (device.getPlatform() === 'android') {
        await waitFor(el).toExist().withTimeout(timeout * 1000);
        return;
    }
    await waitFor(el).toBeVisible().withTimeout(timeout * 1000);
});

Then('I scroll up {string}', async (elementId) => {
    const scroller = element(by.id(elementId));
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
        // Success is Toast on Android now. Native Alert OK is not tappable under Detox.
        if (label === 'OK') {
            return;
        }
        await device.disableSynchronization();
        try {
            const ui = device.getUiDevice();
            await tapAndroidAlertButton(label, device.id, (x, y) => ui.click(x, y));
        } finally {
            await device.enableSynchronization();
        }
        return;
    }
    await element(by.label(label).and(by.type('_UIAlertControllerActionView'))).tap();
});

Given('I should see alert with content {string}', async (title) => {
    if (device.getPlatform() === 'android') {
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
    await device.openURL({ url });
});
