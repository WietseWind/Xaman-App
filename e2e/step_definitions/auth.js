const { Then } = require('@cucumber/cucumber');
const { expect, element, by, waitFor, device } = require('detox');
const { dismissKeyboard } = require('../helpers/keyboard');

let passcode = '167349';

const passphrase = '&uHCnPv4T=#~;Ca';
const newPassphrase = '4b<8xu8HbP)%hzpgh';

Then('I enter my passcode', async () => {
    await expect(element(by.id('virtual-keyboard'))).toExist();

    const passcodeArray = passcode.split('');

    for (let i = 0; i < passcodeArray.length; i++) {
        await element(by.id(`${passcodeArray[i]}-key`)).tap();
    }
});

Then('I type my passcode', async () => {
    await waitFor(element(by.id(`${passcode[0]}-key`)))
        .toExist()
        .withTimeout(10000);
    await element(by.id(`${passcode[0]}-key`)).tap();
    await element(by.id(`${passcode[1]}-key`)).tap();
    await element(by.id(`${passcode[2]}-key`)).tap();
    await element(by.id(`${passcode[3]}-key`)).tap();
    await element(by.id(`${passcode[4]}-key`)).tap();
    await element(by.id(`${passcode[5]}-key`)).tap();
});

Then('I type my new passcode', async () => {
    passcode = '958347';
    // await element(by.id('pin-input')).typeText(`${passcode}\n`);
    await element(by.id(`${passcode[0]}-key`)).tap();
    await element(by.id(`${passcode[1]}-key`)).tap();
    await element(by.id(`${passcode[2]}-key`)).tap();
    await element(by.id(`${passcode[3]}-key`)).tap();
    await element(by.id(`${passcode[4]}-key`)).tap();
    await element(by.id(`${passcode[5]}-key`)).tap();
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
