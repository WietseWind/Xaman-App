const { element, by, waitFor } = require('detox');

const sleep = (ms) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

// Screens that host a text field + a footer Next under the iOS keyboard.
const CHROME_IDS = [
    'account-generate-label-view',
    'account-generate-passphrase-view',
    'account-import-enter-family-seed-view',
    'account-import-label-view',
    'account-import-enter-mnemonic-view',
    'account-import-enter-address-view',
    'account-import-passphrase-view',
];

// Do not swipe UIKeyboardLayoutStar: on iOS 26 that swipe hits the keys
// (we typed "To to to to" into the label) instead of dismissing.
const dismissKeyboard = async () => {
    try {
        await element(by.traits(['keyboardKey']).and(by.label('return'))).tap();
        await sleep(250);
        return;
    } catch (e) {
        // no return key
    }

    try {
        await element(by.traits(['keyboardKey']).and(by.label('done'))).tap();
        await sleep(250);
        return;
    } catch (e) {
        // no done key
    }

    for (const id of CHROME_IDS) {
        try {
            await waitFor(element(by.id(id))).toExist().withTimeout(150);
            // Title area, well above the field and the keyboard.
            await element(by.id(id)).tap({ x: 200, y: 70 });
            await sleep(300);
            return;
        } catch (e) {
            // not this screen
        }
    }
};

module.exports = { dismissKeyboard };
