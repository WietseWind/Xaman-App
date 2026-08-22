const { Then } = require('@cucumber/cucumber');
const { expect, element, by, waitFor, device } = require('detox');
const { dismissKeyboard } = require('../helpers/keyboard');
const { clickByTestId } = require('../helpers/tapById');

let passcode = '167349';

const passphrase = '&uHCnPv4T=#~;Ca';
const newPassphrase = '4b<8xu8HbP)%hzpgh';

Then('I enter my passcode', async () => {
    await expect(element(by.id('virtual-keyboard'))).toExist();

    const passcodeArray = passcode.split('');

    for (let i = 0; i < passcodeArray.length; i++) {
        await clickByTestId(`${passcodeArray[i]}-key`);
    }
});

Then('I type my passcode', async () => {
    try {
        await waitFor(element(by.id(`${passcode[0]}-key`)))
            .toExist()
            .withTimeout(10000);
    } catch (e) {
        // Downgrade can already have applied with no pin overlay.
        try {
            await waitFor(element(by.id('account-access-level-value')))
                .toHaveText('Read only')
                .withTimeout(1500);
            return;
        } catch (skipErr) {
            throw e;
        }
    }
    await clickByTestId(`${passcode[0]}-key`);
    await clickByTestId(`${passcode[1]}-key`);
    await clickByTestId(`${passcode[2]}-key`);
    await clickByTestId(`${passcode[3]}-key`);
    await clickByTestId(`${passcode[4]}-key`);
    await clickByTestId(`${passcode[5]}-key`);
});

Then('I type my new passcode', async () => {
    passcode = '958347';
    await clickByTestId(`${passcode[0]}-key`);
    await clickByTestId(`${passcode[1]}-key`);
    await clickByTestId(`${passcode[2]}-key`);
    await clickByTestId(`${passcode[3]}-key`);
    await clickByTestId(`${passcode[4]}-key`);
    await clickByTestId(`${passcode[5]}-key`);
});

const typeIntoField = async (inputId, value) => {
    const field = element(by.id(inputId));
    // Android review sheet: passphrase-input exists but fails 75% visible.
    if (device.getPlatform() === 'android') {
        await waitFor(field).toExist().withTimeout(15000);
        await field.tap({ x: 24, y: 16 });
    } else {
        await waitFor(field).toBeVisible().withTimeout(5000);
        try {
            await field.tap();
        } catch (e) {
            // iOS 26 keyboard accessory can steal the default hit point
            await field.tap({ x: 8, y: 8 });
        }
    }
    await field.replaceText(value);
    try {
        await field.tapReturnKey();
    } catch (e) {
        await dismissKeyboard();
    }
};

Then('I enter my passphrase in {string}', async (input) => {
    await typeIntoField(input, passphrase);
});

Then('I enter my new passphrase in {string}', async (input) => {
    await typeIntoField(input, newPassphrase);
});
