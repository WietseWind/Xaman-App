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
    this.mnemonic = generateMnemonic();
});

Then('I enter my mnemonic', async () => {
    // typeText + return advances to the next word field on iOS. Android
    // later rows are under 75% visible. Do not tap (IME covers the list).
    for (let i = 0; i < 24; i++) {
        const field = element(by.id(`word-${i}-input`));
        if (device.getPlatform() === 'android') {
            // Espresso replaceText needs 75% visible. Word 12+ never reaches that
            // (footer + IME). Scroll until the frame is on screen, then type
            // with UiDevice + adb. BIP39 words are a-z only.
            const scroller = element(by.id('mnemonic-words-scroll'));
            const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
            let written = false;
            for (let s = 0; s < 24 && !written; s += 1) {
                let frame = {};
                try {
                    const attrs = await field.getAttributes();
                    frame = attrs.frame || {};
                } catch (attrErr) {
                    frame = {};
                }
                const y = Number(frame.y || 0);
                const h = Number(frame.height || 0);
                const w = Number(frame.width || 0);
                const x = Number(frame.x || 0);
                if (y > 80 && y < 2280 && w > 0) {
                    await device.getUiDevice().click(Math.round(x + w / 2), Math.round(y + Math.min(16, h / 2)));
                    execFileSync('adb', ['-s', serial, 'shell', 'input', 'text', this.mnemonic[i]], {
                        timeout: 5000,
                    });
                    // Close IME so later rows stay on screen.
                    try {
                        execFileSync('adb', ['-s', serial, 'shell', 'input', 'keyevent', '111'], { timeout: 3000 });
                    } catch (imeErr) {
                        // ignore
                    }
                    written = true;
                    break;
                }
                try {
                    await scroller.scroll(90, 'down');
                } catch (scrollErr) {
                    await element(by.id('account-import-enter-mnemonic-view')).swipe('up', 'slow', 0.2);
                }
            }
            if (!written) {
                throw new Error(`could not enter mnemonic word ${i}`);
            }
        } else {
            await field.typeText(`${this.mnemonic[i]}\n`);
        }
    }
    await dismissKeyboard();
});

Then('I tap my account in the list', async () => {
    const row = element(by.id(`account-${this.address}`));
    const list = element(by.id('account-list-scroll'));

    // Android: a 90% hit-test can fail on the list itself (bottom nav clips
    // account-list-scroll). Do not swipe the list. Scroll, then tap a point.
    for (let i = 0; i < 8; i += 1) {
        try {
            await waitFor(row).toBeVisible().withTimeout(400);
            break;
        } catch (e) {
            try {
                await list.scroll(280, 'down');
            } catch (scrollErr) {
                break;
            }
        }
    }

    try {
        await row.tap();
    } catch (e) {
        await row.tap({ x: 24, y: 24 });
    }
});
