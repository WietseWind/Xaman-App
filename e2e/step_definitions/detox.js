const { Given, Then } = require('@cucumber/cucumber');
const { waitFor, expect, element, by, device } = require('detox');
const { dismissKeyboard } = require('../helpers/keyboard');
const { tapAndroidAlertButton, waitForAndroidAlertText } = require('../helpers/androidAlert');

Then('I tap {string}', async (buttonId) => {
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
    try {
        await btn.tap();
    } catch (e) {
        if (String(buttonId).startsWith('tab-')) {
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
    await waitFor(element(by.id(elementId)))
        .toExist()
        .withTimeout(5000);
});

Given('I should not have {string}', async (screenId) => {
    await expect(element(by.id(screenId))).not.toExist();
});

Given('I should see {string}', async (elementId) => {
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
    await waitFor(element(by.id(elementId)))
        .toBeVisible()
        .withTimeout(timeout * 1000);
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
        await device.disableSynchronization();
        try {
            await tapAndroidAlertButton(label, device.id);
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
