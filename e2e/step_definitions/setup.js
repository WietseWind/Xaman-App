const { Then } = require('@cucumber/cucumber');
const { element, by, waitFor, device } = require('detox');
const { tapByTestIdIfPresent, androidHasTestId } = require('../helpers/tapById');

Then('I agree all disclaimers', async () => {
    for (let i = 0; i < 7; i++) {
        await waitFor(element(by.id('agree-check-box')))
            .toBeVisible()
            .withTimeout(20000);
        await element(by.id('agree-check-box')).tap();
    }
});

const shows = async (testId) => {
    if (device.getPlatform() === 'android') {
        return androidHasTestId(testId);
    }
    try {
        await waitFor(element(by.id(testId))).toExist().withTimeout(300);
        return true;
    } catch (e) {
        return false;
    }
};

// After the passcode a real phone can ask two things that a simulator or emulator never asks:
// biometrics (the phone has a face or a finger enrolled) and notifications (not allowed yet). The
// test answers both with "later"; with neither on screen this step ends when the agreement shows.
Then('I answer the set-up questions of a real phone when they show', { timeout: 120 * 1000 }, async () => {
    const end = Date.now() + 90 * 1000;
    while (Date.now() < end) {
        if (await shows('agreement-setup-screen')) {
            return;
        }
        if (await shows('biometric-setup-view')) {
            await tapByTestIdIfPresent('skip-button', 2000);
        } else if (await shows('permission-setup-view')) {
            await tapByTestIdIfPresent('maybe-later-button', 2000);
        }
        await new Promise((resolve) => { setTimeout(resolve, 500); });
    }
    // not there: the next step says so
});
