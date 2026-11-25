// Remit: the review of a sign request that sends amounts, transfers URITokens and mints one, and what the
// ledger says after the app signed and sent it (issue 530).
// The sign requests are real payloads of the Xaman platform API, see ../helpers/signRequests; the accounts
// and what they hold are made on Xahau Testnet, see ../helpers/remitLedger.
const assert = require('assert');
const { execFileSync } = require('child_process');
const { Given, Then } = require('@cucumber/cucumber');
const { element, by, waitFor, device } = require('detox');

const { androidSerial } = require('../helpers/androidSerial');
const {
    clickByTestId,
    androidHasTestId,
    androidReadTextByTestId,
    androidSwipeTestId,
    unlockAndroidPasscodeWhenItShows,
} = require('../helpers/tapById');
const {
    FEE,
    createSignRequest,
    readSignedRequest,
    signRequestMeta,
    newAccount,
} = require('../helpers/signRequests');
const {
    hex,
    prepareRemitAccounts,
    accountExists,
    nativeBalance,
    tokenBalance,
    uriTokensOf,
    uriTokenOwner,
    validatedTransaction,
    remitReservesPaid,
    networkDefinitions,
} = require('../helpers/remitLedger');

// the account steps keep the account they work with on their module object (address, seed)
const accountSteps = require('./account');

const isAndroid = () => device.getPlatform() === 'android';
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const DROPS = 1000000;

const state = {
    accounts: undefined,
    request: undefined,
    sawExtraFields: false,
    // the reserves that the caution of the review named, in drops (0: no caution)
    cautionDrops: undefined,
    // what the ledger check of the scenario needs: the destination, and what was there before
    expected: undefined,
};

const has = async (testId, timeout = 1500) => {
    if (isAndroid()) {
        return androidHasTestId(testId);
    }
    try {
        await waitFor(element(by.id(testId))).toExist().withTimeout(timeout);
        return true;
    } catch (e) {
        return false;
    }
};

const native = (xah) => ({ AmountEntry: { Amount: String(xah * DROPS) } });
const eur = (value) => ({
    AmountEntry: { Amount: { currency: state.accounts.currency, issuer: state.accounts.issuer.address, value } },
});
const mintOf = (name) => ({
    uri: hex(`ipfs://e2e-remit/${Date.now()}/${name}.json`),
    digest: hex(name).padEnd(64, '0').slice(0, 64),
});

/* The Remits ==================================================================== */
// name -> the fields of the Remit, and what the ledger has to show afterwards
const REMITS = {
    'XAH to an account that exists': async () => {
        const destination = state.accounts.existing.address;
        const before = BigInt(await nativeBalance(destination));
        return {
            fields: { Destination: destination, Amounts: [native(1)] },
            check: async () => {
                assert.strictEqual(BigInt(await nativeBalance(destination)) - before, BigInt(DROPS));
            },
        };
    },
    'XAH to a new account': async () => {
        const destination = newAccount().address;
        assert.strictEqual(await accountExists(destination), false);
        return {
            fields: { Destination: destination, Amounts: [native(1)] },
            check: async () => {
                // the Remit made the account (and paid its reserve); the amount is on top of that
                assert.strictEqual(await accountExists(destination), true);
                assert(BigInt(await nativeBalance(destination)) >= BigInt(DROPS));
            },
        };
    },
    'EUR to an account without trust line': async () => {
        const destination = state.accounts.existing.address;
        assert.strictEqual(await tokenBalance(destination, state.accounts.issuer.address), undefined);
        return {
            fields: { Destination: destination, Amounts: [eur('5')] },
            check: async () => {
                assert.strictEqual(Number(await tokenBalance(destination, state.accounts.issuer.address)), 5);
            },
        };
    },
    'EUR to an account with trust line': async () => {
        const destination = state.accounts.existing.address;
        const before = Number(await tokenBalance(destination, state.accounts.issuer.address));
        assert(Number.isFinite(before), 'the destination has the trust line of the scenario before this one');
        return {
            fields: { Destination: destination, Amounts: [eur('2.5')] },
            check: async () => {
                const after = Number(await tokenBalance(destination, state.accounts.issuer.address));
                assert.strictEqual(after, before + 2.5);
            },
        };
    },
    'a URIToken': async () => {
        const destination = state.accounts.existing.address;
        const [token] = state.accounts.tokens;
        return {
            fields: { Destination: destination, URITokenIDs: [token] },
            check: async () => {
                assert.strictEqual(await uriTokenOwner(token), destination);
            },
        };
    },
    'a URIToken to mint': async () => {
        const destination = state.accounts.existing.address;
        const { uri, digest } = mintOf('mint');
        return {
            fields: { Destination: destination, MintURIToken: { URI: uri, Digest: digest, Flags: 1 } },
            check: async () => {
                const minted = (await uriTokensOf(destination)).find((token) => token.uri.toUpperCase() === uri);
                assert(minted, 'the destination owns the minted URIToken');
                assert.strictEqual(minted.issuer, state.accounts.sender.address);
            },
        };
    },
    'everything to a new account': async () => {
        const destination = newAccount().address;
        const token = state.accounts.tokens[1];
        const { uri, digest } = mintOf('everything');
        return {
            fields: {
                Destination: destination,
                DestinationTag: 530,
                Amounts: [native(2), eur('3')],
                URITokenIDs: [token],
                MintURIToken: { URI: uri, Digest: digest },
                Inform: state.accounts.issuer.address,
                InvoiceID: hex('issue 530').padEnd(64, '0'),
                Blob: hex('e2e remit'),
            },
            check: async () => {
                assert.strictEqual(await accountExists(destination), true);
                assert.strictEqual(Number(await tokenBalance(destination, state.accounts.issuer.address)), 3);
                assert.strictEqual(await uriTokenOwner(token), destination);
                const owned = await uriTokensOf(destination);
                const minted = owned.find((entry) => entry.uri.toUpperCase() === uri);
                assert(minted, 'the destination owns the minted URIToken');
                assert.strictEqual(owned.length, 2);
            },
        };
    },
    // Not a Remit that the app can show: the platform takes these two shapes (it refuses the others), so
    // they get to the app. The review has to refuse them: it cannot show what would be signed.
    // A platform that refuses them too (XRPL-Labs/Xaman-API#723) leaves nothing to test here: skipped.
    'an amount entry without amount': async () => ({
        fields: { Destination: state.accounts.existing.address, Amounts: [{ AmountEntry: {} }] },
        platformMayRefuse: true,
        check: async () => {},
    }),
    'an entry that is not an amount entry': async () => ({
        fields: { Destination: state.accounts.existing.address, Amounts: [{ Memo: { MemoData: hex('e2e') } }] },
        platformMayRefuse: true,
        check: async () => {},
    }),
    // review only: the URIToken card has to say that it found nothing, not spin forever
    'a URIToken that does not exist': async () => ({
        fields: {
            Destination: newAccount().address,
            Amounts: [native(1), eur('12.5')],
            URITokenIDs: ['E2E0000000000000000000000000000000000000000000000000000000000530'],
            MintURIToken: { ...(({ uri, digest }) => ({ URI: uri, Digest: digest }))(mintOf('declined')), Flags: 1 },
            Inform: state.accounts.issuer.address,
        },
        check: async () => {},
    }),
};

/* Preparation ==================================================================== */
// three accounts from the faucet, a trust line, a payment and two mints: minutes on a slow day
Then('I prepare the Remit accounts', { timeout: 10 * 60 * 1000 }, async () => {
    state.accounts = await prepareRemitAccounts();
});

// hands the sender to the account import steps ("I enter my seed in the input", "I read my account address")
Then('I use the Remit sender account', async () => {
    const { seed, address } = state.accounts.sender;
    accountSteps.seed = seed;
    accountSteps.address = address;
    accountSteps.mnemonic = undefined;
});

Then('I create a Remit sign request with {string}', { timeout: 2 * 60 * 1000 }, async (what) => {
    assert(REMITS[what], `no Remit named "${what}"`);
    assert(state.accounts, 'the Remit accounts are not prepared');
    const { fields, check, platformMayRefuse } = await REMITS[what]();
    state.sawExtraFields = false;
    state.cautionDrops = undefined;
    state.expected = { what, check };
    try {
        state.request = await createSignRequest(
            { TransactionType: 'Remit', Account: state.accounts.sender.address, Fee: FEE, ...fields },
            { submit: true },
        );
    } catch (error) {
        // The platform refuses a Remit with such an entry itself (code 712) from the backend version that
        // has that check: the request cannot get to the app, so there is nothing for the app to refuse.
        if (platformMayRefuse && /"code":\s*712\b/.test(String(error && error.message))) {
            return 'skipped';
        }
        throw error;
    }
    return undefined;
});

Then('I open the Remit sign request', async () => {
    const { url } = state.request;
    if (isAndroid()) {
        execFileSync(
            'adb',
            ['-s', androidSerial(), 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', url,
                'com.xrpllabs.xumm'],
            { timeout: 10000 },
        );
        // the intent brings the app to the front again, which can lock it a moment later
        await unlockAndroidPasscodeWhenItShows();
        return;
    }
    await device.openURL({ url });
});

/* The review ==================================================================== */
const scrollReviewDown = async () => {
    if (isAndroid()) {
        await androidSwipeTestId('review-content-container', 'up');
    } else {
        await element(by.id('review-content-container')).swipe('up', 'slow', 0.4);
    }
    await sleep(600);
};

// The review is a long list: scroll down until the block is on screen. "Extra fields" is looked for at
// every position on the way, for the step after these.
const scrollTo = async (testId) => {
    for (let i = 0; i < 16; i += 1) {
        if (await has('payload-extra-fields', 300)) {
            state.sawExtraFields = true;
        }
        if (await has(testId)) {
            if (!isAndroid()) {
                // on iOS an element off screen exists too: bring it into view for the screenshot
                try {
                    await waitFor(element(by.id(testId)))
                        .toBeVisible()
                        .whileElement(by.id('review-content-container'))
                        .scroll(260, 'down');
                } catch (e) {
                    // it exists; a screenshot without it is no reason to fail
                }
            }
            return;
        }
        await scrollReviewDown();
    }
    throw new Error(`the Remit review does not show ${testId}`);
};

Given('the Remit review should show {string}', { timeout: 2 * 60 * 1000 }, async (testId) => {
    await scrollTo(testId);
});

// A long review (a Batch with several inner transactions, a Remit with many parts): one swipe does not get
// to its end, and a slide button that is only partly on screen does not take the slide.
Then('I scroll the review to the slide button', { timeout: 2 * 60 * 1000 }, async () => {
    await scrollTo('accept-button');
    // to the very end: the slide button has to be on screen as a whole
    await scrollReviewDown();
});

Given('the Remit review showed no extra fields on the way', async () => {
    if (state.sawExtraFields || (await has('payload-extra-fields', 300))) {
        throw new Error(
            'the Remit review has an "Extra fields" section: a part of the Remit is not shown by its own block',
        );
    }
});

const CAUTION_LINES = {
    activation: 'remit-pays-activation',
    'trust lines': 'remit-pays-trust-lines',
    URITokens: 'remit-pays-uritokens',
};

// "Caution: 1.2 XAH extra will be sent to cover the reserves at the destination:" -> 1200000n
const cautionTotalDrops = async () => {
    const text = isAndroid()
        ? await androidReadTextByTestId('remit-pays-total')
        : await element(by.id('remit-pays-total')).getAttributes().then((a) => a.text || a.label);
    const match = /(\d+)(?:\.(\d{1,6}))? XAH/.exec(String(text));
    assert(match, `the Remit caution names no amount: "${text}"`);
    return BigInt(match[1]) * BigInt(DROPS) + BigInt((match[2] || '').padEnd(6, '0'));
};

// The caution is above the slide button, at the end of the review. It lists everything that can apply
// until the ledger answered, so the list is read until it is the expected one.
Given('the Remit caution should list {string}', { timeout: 3 * 60 * 1000 }, async (list) => {
    const expected = list === 'nothing' ? [] : list.split(',').map((name) => name.trim());
    expected.forEach((name) => assert(CAUTION_LINES[name], `no caution line named "${name}"`));
    await scrollTo('accept-button');

    const read = async () => {
        const shown = [];
        for (const name of Object.keys(CAUTION_LINES)) {
            if (await has(CAUTION_LINES[name], 300)) {
                shown.push(name);
            }
        }
        return shown;
    };
    const deadline = Date.now() + 30000;
    let shown = [];
    while (Date.now() < deadline) {
        shown = await read();
        // "remit-pays-total" is the header after the ledger answered; before that the total is "up to"
        const exact = !expected.length || (await has('remit-pays-total', 300));
        if (exact && shown.join(',') === expected.join(',')) {
            if (!expected.length) {
                assert.strictEqual(await has('remit-pays-reserves-warning', 300), false, 'no caution at all');
                state.cautionDrops = 0n;
            } else {
                state.cautionDrops = await cautionTotalDrops();
            }
            // to the very end: the slide button has to be on screen as a whole for the slide after this
            await scrollReviewDown();
            return;
        }
        await sleep(1000);
    }
    throw new Error(`the Remit caution lists "${shown.join(', ') || 'nothing'}", expected "${list}"`);
});

// Close asks "Close or Decline" for a request of an application: decline it, so nothing stays open
Then('I close the Remit review and decline the request', { timeout: 90 * 1000 }, async () => {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
        if (await has('request-decline-decline-button', 3000)) {
            await clickByTestId('request-decline-decline-button');
            await sleep(1500);
        } else if (await has('review-transaction-modal', 1000)) {
            await clickByTestId('close-button');
            await sleep(1000);
        } else {
            return;
        }
    }
    throw new Error('the Remit review did not close');
});

// the error screen of the review says why it cannot show the request
Given('the review error should say {string}', { timeout: 60 * 1000 }, async (message) => {
    if (isAndroid()) {
        const text = await androidReadTextByTestId('review-error-view');
        assert(String(text).includes(message), `the error screen says "${text}", expected "${message}"`);
        return;
    }
    await waitFor(element(by.text(message))).toExist().withTimeout(10000);
});

// the app told the platform that it did not sign: the request is resolved, and not signed
Given('the Remit sign request is refused, not signed', { timeout: 60 * 1000 }, async () => {
    const deadline = Date.now() + 30000;
    let meta = {};
    while (Date.now() < deadline) {
        meta = await signRequestMeta(state.request.uuid);
        if (meta.resolved) {
            break;
        }
        await sleep(2000);
    }
    assert.strictEqual(meta.signed, false, `the sign request is signed (meta: ${JSON.stringify(meta)})`);
    assert.strictEqual(meta.resolved, true, `the sign request is still open (meta: ${JSON.stringify(meta)})`);
});

/* The ledger ==================================================================== */
Given('the ledger should have the Remit with {string}', { timeout: 4 * 60 * 1000 }, async (what) => {
    assert.strictEqual(state.expected.what, what);
    const signed = await readSignedRequest(state.request.uuid, 45000, await networkDefinitions());
    assert.strictEqual(signed.json.TransactionType, 'Remit');
    const tx = await validatedTransaction(signed.txid);
    assert(tx, `the Remit ${signed.txid} is in no validated ledger`);
    const result = tx.meta.TransactionResult;
    assert.strictEqual(result, 'tesSUCCESS', `the ledger says ${result} for the Remit ${signed.txid}`);
    await state.expected.check();
    // the review named what the ledger took for the reserves, to the drop
    const paid = remitReservesPaid(tx);
    assert.strictEqual(
        paid,
        state.cautionDrops,
        `the ledger took ${paid} drops for reserves, the caution of the review named ${state.cautionDrops}`,
    );
});
