const assert = require('assert');
const { execFileSync } = require('child_process');
const { Given, Then } = require('@cucumber/cucumber');
const { element, by, waitFor, device } = require('detox');

const {
    activateAccount,
    generateTestnetAccount,
    generateFreshTestnetAccount,
    generateSecretNumbers,
    generateFamilySeed,
    generateMnemonic,
} = require('../helpers/fixtures');
const { dismissKeyboard } = require('../helpers/keyboard');
const {
    clickByTestId,
    waitUntilAndroidTestId,
    androidReadTextByTestId,
    androidHasTestId,
    clickAndroidAccountRow,
    androidTypeText,
    androidDumpIncludes,
    clickAndroidLabel,
} = require('../helpers/tapById');

Then('I write down secret numbers', async () => {
    this.numbers = [...Array(8)].map(() => Array(6));
    for (let r = 0; r < 8; r++) {
        if (device.getPlatform() === 'android') {
            await waitUntilAndroidTestId(`${r}.0`, 15000);
            for (let c = 0; c < 6; c++) {
                const text = await androidReadTextByTestId(`${r}.${c}`);
                if (!text) {
                    throw new Error(`secret cell ${r}.${c} missing from hierarchy`);
                }
                this.numbers[r][c] = text;
            }
            if (r < 7) {
                await clickByTestId('next-button');
            }
        } else {
            for (let c = 0; c < 6; c++) {
                const attributes = await element(by.id(`${r}.${c}`)).getAttributes();
                this.numbers[r][c] = attributes.text;
            }
            if (r < 7) {
                await element(by.id('next-button')).tap();
            }
        }
    }
});

Then('I generate new secret number', async () => {
    this.numbers = generateSecretNumbers();
});

Then('I enter my secret number', { timeout: 5 * 60 * 1000 }, async () => {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 6; c++) {
            if (device.getPlatform() === 'android') {
                await clickByTestId(`${this.numbers[r][c]}-key`);
            } else {
                await element(by.id(`${this.numbers[r][c]}-key`)).tap();
            }
        }
    }
});

Then('I read my account address', async () => {
    if (device.getPlatform() === 'android') {
        await waitUntilAndroidTestId('account-address-text', 15000);
        this.address = await androidReadTextByTestId('account-address-text');
        return;
    }
    const attributes = await element(by.id('account-address-text')).getAttributes();
    this.address = attributes.text;
});

Given('I should see same account address', async () => {
    if (device.getPlatform() === 'android') {
        await waitUntilAndroidTestId('account-address-text', 15000);
        const text = await androidReadTextByTestId('account-address-text');
        assert.equal(this.address, text);
        return;
    }
    const attributes = await element(by.id('account-address-text')).getAttributes();
    assert.equal(this.address, attributes.text);
});

Then('I activate the account', async () => {
    await activateAccount(this.address);
});

Then('I generate testnet account', async () => {
    const testnetAccount = await generateFreshTestnetAccount();

    this.address = testnetAccount.address;
    this.seed = testnetAccount.secret;
    if (!this.address || this.address[0] !== 'r') {
        throw new Error(`testnet address expected r... got ${this.address}`);
    }
});

Then('I enter the address in the input', async () => {
    if (device.getPlatform() === 'android') {
        const serial = process.env.ANDROID_SERIAL || device.id;
        const want = String(this.address || '');
        await waitUntilAndroidTestId('address-input', 10000);
        await clickByTestId('address-input');
        await new Promise((resolve) => { setTimeout(resolve, 400); });
        androidTypeText(want);
        await new Promise((resolve) => { setTimeout(resolve, 500); });
        const readField = async () => {
            const raw = String((await androidReadTextByTestId('address-input')) || '');
            if (raw.indexOf('Please enter') !== -1) {
                return '';
            }
            return raw.replace(/\s/g, '');
        };
        let got = await readField();
        // IME often swallows the leading `r` (`rZZx…` → `ZZx…`), which leaves Next disabled.
        if (got !== want && got.indexOf(want) === -1) {
            if (want.endsWith(got) && got.length > 0) {
                execFileSync('adb', ['-s', serial, 'shell', 'input', 'keyevent', '122'], { timeout: 3000 });
                androidTypeText(want.slice(0, want.length - got.length));
            } else {
                execFileSync('adb', ['-s', serial, 'shell', 'input', 'keyevent', '123'], { timeout: 3000 });
                const n = Math.max(40, got.length + 8);
                for (let i = 0; i < n; i += 1) {
                    execFileSync('adb', ['-s', serial, 'shell', 'input', 'keyevent', '67'], { timeout: 2000 });
                }
                androidTypeText(want);
            }
            await new Promise((resolve) => { setTimeout(resolve, 400); });
            got = await readField();
        }
        if (got !== want && got.indexOf(want) === -1) {
            throw new Error(`address-input got ${JSON.stringify(got)} want ${want}`);
        }
        // BACK while focused can immediately reopen IME; ESC blurs.
        try {
            execFileSync('adb', ['-s', serial, 'shell', 'input', 'keyevent', '111'], { timeout: 4000 });
        } catch (e) {
            // IME
        }
        return;
    }
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
    if (!this.seed) {
        const acc = await generateTestnetAccount();
        this.address = acc.address;
        this.seed = acc.secret;
    }
    if (device.getPlatform() === 'android') {
        const serial = process.env.ANDROID_SERIAL || device.id;
        const want = String(this.seed || '');
        const sleepMs = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
        const clearField = () => {
            execFileSync('adb', ['-s', serial, 'shell', 'input', 'keyevent', '123'], { timeout: 3000 });
            const n = Math.max(40, want.length + 8);
            for (let i = 0; i < n; i += 1) {
                execFileSync('adb', ['-s', serial, 'shell', 'input', 'keyevent', '67'], { timeout: 2000 });
            }
        };
        const seedLooksValid = async () =>
            (await androidDumpIncludes('secp256k1')) || (await androidDumpIncludes('Keypair type'));
        const readVisibleSeed = async () => {
            const raw = String((await androidReadTextByTestId('seed-input')) || '');
            if (!raw || /please|provide|family seed|secret/i.test(raw) || /^[•·.●]+$/.test(raw)) {
                return '';
            }
            return raw.replace(/\s/g, '');
        };

        await waitUntilAndroidTestId('seed-input', 10000);
        await clickByTestId('seed-input');
        await sleepMs(400);
        androidTypeText(want);
        await sleepMs(500);

        // IME often capitalizes/swallows the leading `s`, so Next alerts Invalid Family Seed.
        if (!(await seedLooksValid())) {
            await clickAndroidLabel('Show secret');
            await sleepMs(300);
            await clickByTestId('seed-input');
            await sleepMs(200);
            const got = await readVisibleSeed();
            if (want.endsWith(got) && got.length > 0 && got !== want) {
                execFileSync('adb', ['-s', serial, 'shell', 'input', 'keyevent', '122'], { timeout: 3000 });
                androidTypeText(want.slice(0, want.length - got.length));
            } else {
                clearField();
                androidTypeText(want);
            }
            await sleepMs(500);
        }

        if (!(await seedLooksValid()) && !/^sed/i.test(want)) {
            await clickByTestId('seed-input');
            await sleepMs(200);
            clearField();
            for (let i = 0; i < want.length; i += 1) {
                androidTypeText(want[i]);
            }
            await sleepMs(400);
        }

        if (!(await seedLooksValid()) && !/^sed/i.test(want)) {
            throw new Error('seed-input did not produce a valid family seed (keypair picker hidden)');
        }
        try {
            execFileSync('adb', ['-s', serial, 'shell', 'input', 'keyevent', '111'], { timeout: 4000 });
        } catch (e) {
            // IME
        }
        return;
    }
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
        await waitUntilAndroidTestId('12-words-button', 10000);
        await clickByTestId('12-words-button');
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
                await waitUntilAndroidTestId('word-0-input', 10000);
                await clickByTestId('word-0-input');
            }
            androidTypeText(this.mnemonic[i]);
            execFileSync('adb', ['-s', serial, 'shell', 'input', 'keyevent', '66'], { timeout: 3000 });
            await new Promise((resolve) => { setTimeout(resolve, 250); });
        } else {
            await field.typeText(`${this.mnemonic[i]}\n`);
        }
    }
    await dismissKeyboard();
});

Then('I tap my account in the list', async () => {
    const rowId = `account-${this.address}`;
    const row = element(by.id(rowId)).atIndex(0);
    const list = element(by.id('account-list-scroll'));

    if (device.getPlatform() === 'android') {
        if (!this.address) {
            const acc = await generateTestnetAccount();
            this.address = acc.address;
            this.seed = acc.secret;
        }
        await clickAndroidAccountRow(this.address, 'I-ReadOnly');
        return;
    }

    // Detox list.scroll() starts at the bottom edge. The tab bar swallows it
    // so the list does not move (I-ReadOnly stays below the fold). Swipe from
    // the middle of the list instead.
    // Edit Button + inner native control share account-{address} (multiple match).
    for (let i = 0; i < 12; i += 1) {
        try {
            await waitFor(row).toBeVisible().withTimeout(400);
            break;
        } catch (e) {
            try {
                await list.swipe('up', 'slow', 0.55);
            } catch (scrollErr) {
                break;
            }
            await new Promise((resolve) => {
                setTimeout(resolve, 500);
            });
        }
    }

    try {
        await row.tap();
    } catch (e) {
        await row.tap({ x: 24, y: 24 });
    }
});
