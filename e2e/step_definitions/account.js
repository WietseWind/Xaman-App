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
            // Espresso replaceText needs 75% visible. Word 12+ never reaches that
            // (footer + IME). Scroll until the frame is on screen, then type
            // with UiDevice + adb. BIP39 words are a-z only.
            const scroller = element(by.id('mnemonic-words-scroll'));
            const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
            if (i >= 5) {
                try {
                    await scroller.scroll(80, 'down');
                } catch (e) {
                    // already at end
                }
            }
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
                // Last 12-word row sits in the footer. Click the top of the
                // field. Do not cap y at 2280.
                if (y > 80 && w > 0) {
                    await device.getUiDevice().click(Math.round(x + w / 2), Math.round(y + Math.min(12, h / 2)));
                    execFileSync('adb', ['-s', serial, 'shell', 'input', 'text', this.mnemonic[i]], {
                        timeout: 5000,
                    });
                    written = true;
                    break;
                }
                try {
                    await scroller.scroll(90, 'down');
                } catch (scrollErr) {
                    // list end
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
        await row.tap();
    } catch (e) {
        await row.tap({ x: 24, y: 24 });
    }
});
