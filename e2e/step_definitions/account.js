const assert = require('assert');
const { execFileSync } = require('child_process');
const { Given, Then } = require('@cucumber/cucumber');
const { element, by, waitFor, device } = require('detox');

const {
    activateAccount,
    generateTestnetAccount,
    generateSecretNumbers,
    generateFamilySeed,
    generateMnemonic,
} = require('../helpers/fixtures');
const { dismissKeyboard } = require('../helpers/keyboard');

Then('I write down secret numbers', async () => {
    this.numbers = [...Array(8)].map(() => Array(6));
    // rows
    for (let r = 0; r < 8; r++) {
        // get values for any column
        for (let c = 0; c < 6; c++) {
            const attributes = await element(by.id(`${r}.${c}`)).getAttributes();
            this.numbers[r][c] = attributes.text;
        }

        if (r < 7) {
            await element(by.id('next-button')).tap();
        }
    }
});

Then('I generate new secret number', async () => {
    this.numbers = generateSecretNumbers();
});

Then('I enter my secret number', { timeout: 5 * 60 * 1000 }, async () => {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 6; c++) {
            await element(by.id(`${this.numbers[r][c]}-key`)).tap();
        };
    };
});

Then('I read my account address', async () => {
    const attributes = await element(by.id('account-address-text')).getAttributes();
    this.address = attributes.text;
});

Given('I should see same account address', async () => {
    const attributes = await element(by.id('account-address-text')).getAttributes();
    assert.equal(this.address, attributes.text);
});

Then('I activate the account', async () => {
    await activateAccount(this.address);
});

Then('I generate testnet account', async () => {
    const testnetAccount = await generateTestnetAccount();

    this.address = testnetAccount.address;
    this.seed = testnetAccount.secret;
});

Then('I enter the address in the input', async () => {
    const input = element(by.id('address-input'));
    await input.replaceText(this.address);
    try {
        await input.tapReturnKey();
    } catch (e) {
        await dismissKeyboard();
    }
});

Then('I generate new family seed', async () => {
    this.seed = generateFamilySeed();
});

Then('I enter my seed in the input', async () => {
    const input = element(by.id('seed-input'));
    await input.replaceText(this.seed);
    try {
        await input.tapReturnKey();
    } catch (e) {
        await dismissKeyboard();
    }
});

Then('I generate new mnemonic', async () => {
    // 24 rows do not fit the 1080x2400 AVD. 12 words is a valid BIP39
    // strength-128 mnemonic and stays on screen.
    if (device.getPlatform() === 'android') {
        await element(by.id('12-words-button')).tap({ x: 24, y: 16 });
        this.mnemonic = generateMnemonic(128);
        return;
    }
    this.mnemonic = generateMnemonic();
});

Then('I enter my mnemonic', async () => {
    // typeText + return advances to the next word field on iOS. Android
    // later rows are under 75% visible. Do not tap (IME covers the list).
    for (let i = 0; i < this.mnemonic.length; i++) {
        const field = element(by.id(`word-${i}-input`));
        if (device.getPlatform() === 'android') {
            // Click-per-row missed later fields; adb typed into word 3
            // (concatenated blob). Focus word 0 once, then type + ENTER
            // so onSubmitEditing advances. BIP39 words are a-z.
            const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
            if (i === 0) {
                const attrs = await field.getAttributes();
                const frame = attrs.frame || {};
                await device.getUiDevice().click(
                    Math.round(Number(frame.x || 180) + 40),
                    Math.round(Number(frame.y || 900) + 20),
                );
            }
            execFileSync('adb', ['-s', serial, 'shell', 'input', 'text', this.mnemonic[i]], { timeout: 5000 });
            execFileSync('adb', ['-s', serial, 'shell', 'input', 'keyevent', '66'], { timeout: 3000 });
            await new Promise((resolve) => { setTimeout(resolve, 250); });
        } else {
            await field.typeText(`${this.mnemonic[i]}\n`);
        }
    }
    await dismissKeyboard();
});

Then('I tap my account in the list', async () => {
    const row = element(by.id(`account-${this.address}`));
    const list = element(by.id('account-list-scroll'));

    // Detox list.scroll() starts at the bottom edge. The tab bar swallows it
    // so the list does not move (I-ReadOnly stays below the fold). Swipe from
    // the middle of the list instead.
    for (let i = 0; i < 12; i += 1) {
        try {
            await waitFor(row).toBeVisible().withTimeout(400);
            break;
        } catch (e) {
            if (device.getPlatform() === 'android') {
                try {
                    await device.getUiDevice().swipe(540, 1400, 540, 1000, 40);
                } catch (swipeErr) {
                    break;
                }
            } else {
                try {
                    await list.swipe('up', 'slow', 0.55);
                } catch (scrollErr) {
                    break;
                }
            }
            await new Promise((resolve) => {
                setTimeout(resolve, 500);
            });
        }
    }

    if (device.getPlatform() === 'android') {
        try {
            const attrs = await row.getAttributes();
            const frame = attrs.frame || {};
            const x = Math.round(Number(frame.x || 0) + 40);
            const y = Math.round(Number(frame.y || 0) + 30);
            await device.getUiDevice().click(x, y);
        } catch (e) {
            await row.tap({ x: 24, y: 24 });
        }
        return;
    }

    try {
        await row.tap({ x: 24, y: 24 });
    } catch (e) {
        await row.tap();
    }
});
