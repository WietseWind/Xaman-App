// Multi sign: which account the review signs as ("Sign as"), and what the ledger says about the result.
// The sign requests are real payloads of the Xaman platform API, see ../helpers/signRequests.
const assert = require('assert');
const { execFileSync } = require('child_process');
const { Given, Then } = require('@cucumber/cucumber');
const { element, by, waitFor, device } = require('detox');

const { androidSerial } = require('../helpers/androidSerial');
const {
    clickByTestId,
    waitUntilAndroidTestId,
    androidHasTestId,
    androidSwipeTestId,
    unlockAndroidPasscodeWhenItShows,
} = require('../helpers/tapById');
const {
    FEE,
    apiCredentials,
    createSignRequest,
    readSignedRequest,
    newAccount,
    accountSequence,
    submitAndWait,
    combineSignatures,
    waitForTransaction,
    setUpSignersAndRegularKey,
} = require('../helpers/signRequests');

// the account steps keep the account they work with on their module object (address, seed)
const accountSteps = require('./account');

const isAndroid = () => device.getPlatform() === 'android';
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const state = {
    accounts: {}, // name -> { seed, address, publicKey }
    request: undefined, // { uuid, url, multisign }
    signed: undefined, // { blob, txid, dispatchedResult, multisignAccount, json }
    kept: [], // multi signed copies of one transaction, to combine
};

const account = (name) => {
    const found = state.accounts[name];
    if (!found) {
        throw new Error(`no multi sign account ${name} was prepared`);
    }
    return found;
};
const accountsOf = (names) => names.split(',').map((name) => account(name.trim()));
const nameOf = (value) =>
    Object.keys(state.accounts).find(
        (name) => state.accounts[name].address === value || state.accounts[name].publicKey === value,
    ) || value;

const waitForId = async (testId, timeoutMs = 15000) => {
    if (isAndroid()) {
        await waitUntilAndroidTestId(testId, timeoutMs);
        return;
    }
    await waitFor(element(by.id(testId))).toExist().withTimeout(timeoutMs);
};

const hasId = async (testId, timeoutMs = 2500) => {
    if (isAndroid()) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (await androidHasTestId(testId)) {
                return true;
            }
            await sleep(400);
        }
        return false;
    }
    try {
        await waitFor(element(by.id(testId))).toExist().withTimeout(timeoutMs);
        return true;
    } catch (e) {
        return false;
    }
};

// A row of the account list of the review: scroll the list until the row is on screen.
const bringAccountRowOnScreen = async (address) => {
    const rowId = `select-account-${address}`;
    if (isAndroid()) {
        // the hierarchy dump only has what is on screen
        for (let i = 0; i < 12; i += 1) {
            if (await androidHasTestId(rowId)) {
                return rowId;
            }
            await androidSwipeTestId('select-account-list', 'up');
            await sleep(500);
        }
        throw new Error(`account ${nameOf(address)} is not in the account list of the review`);
    }
    await waitFor(element(by.id(rowId))).toExist().withTimeout(5000);
    await waitFor(element(by.id(rowId)))
        .toBeVisible(80)
        .whileElement(by.id('select-account-list'))
        .scroll(120, 'down');
    return rowId;
};

/* Preparation ==================================================================== */
Given('sign requests can be created through the Xaman API', async () => {
    if (!apiCredentials()) {
        // no key file (see e2e/helpers/signRequests.js): these scenarios can not run
        return 'skipped';
    }
    return undefined;
});

Then('I prepare the multi sign accounts {string}', async (names) => {
    names.split(',').forEach((name) => {
        state.accounts[name.trim()] = newAccount();
    });
});

// hands the account to the account import steps ("I enter my seed in the input", "I read my account address")
Then('I use the multi sign account {string}', async (name) => {
    const { seed, address } = account(name);
    accountSteps.seed = seed;
    accountSteps.address = address;
    accountSteps.mnemonic = undefined;
});

Then(
    'I give account {string} the signers {string} and the regular key {string} on the ledger',
    { timeout: 6 * 60 * 1000 },
    async (name, signers, regularKey) => {
        await setUpSignersAndRegularKey(account(name), accountsOf(signers), account(regularKey));
    },
);

Then(
    'I give account {string} the signers {string} on the ledger',
    { timeout: 6 * 60 * 1000 },
    async (name, signers) => {
        await setUpSignersAndRegularKey(account(name), accountsOf(signers));
    },
);

Then(
    'I give account {string} the signers {string} with quorum {int} on the ledger',
    { timeout: 6 * 60 * 1000 },
    async (name, signers, quorum) => {
        await setUpSignersAndRegularKey(account(name), accountsOf(signers), undefined, quorum);
    },
);

/* Sign requests ==================================================================== */
// A multi sign request: Account, Sequence and Fee are fixed by the requester, nothing is submitted by the app.
const createMultiSignRequest = async (name, signers) => {
    const from = account(name);
    state.signed = undefined;
    state.request = {
        multisign: true,
        ...(await createSignRequest(
            {
                TransactionType: 'AccountSet',
                Account: from.address,
                // an account that is not on the ledger: the request is only opened, never signed
                Sequence: await accountSequence(from.address).catch(() => 1),
                Fee: FEE,
            },
            {
                multisign: true,
                submit: false,
                ...(signers ? { signers: signers.map((signer) => signer.address) } : {}),
            },
        )),
    };
};

Then(
    'I create a multi sign request for account {string} with forced signers {string}',
    { timeout: 60 * 1000 },
    async (name, signers) => createMultiSignRequest(name, accountsOf(signers)),
);

Then(
    'I create a multi sign request for account {string} without forced signers',
    { timeout: 60 * 1000 },
    async (name) => createMultiSignRequest(name, undefined),
);

// A normal request: the app sets the Sequence, signs and submits.
Then(
    'I create a sign request for account {string} with forced signers {string}',
    { timeout: 60 * 1000 },
    async (name, signers) => {
        state.signed = undefined;
        state.request = {
            multisign: false,
            ...(await createSignRequest(
                { TransactionType: 'AccountSet', Account: account(name).address, Fee: FEE },
                { submit: true, signers: accountsOf(signers).map((signer) => signer.address) },
            )),
        };
    },
);

Then('I open the sign request', async () => {
    const { url } = state.request;
    if (isAndroid()) {
        execFileSync(
            'adb',
            ['-s', androidSerial(), 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', url,
                'com.xrpllabs.xumm'],
            { timeout: 10000 },
        );
        // The intent brings the app to the front again: more than the auto lock time after the last
        // unlock that locks it a moment later, with the review behind the lock screen.
        await unlockAndroidPasscodeWhenItShows();
        return;
    }
    await device.openURL({ url });
});

/* The review: "Sign as" ==================================================================== */
Given('the review should sign as account {string}', { timeout: 60 * 1000 }, async (name) => {
    await waitForId('account-picker', 30000);
    await waitForId(`account-picker-selected-${account(name).address}`, 10000);
});

Given('the review should not sign as account {string}', { timeout: 60 * 1000 }, async (name) => {
    await waitForId('account-picker', 30000);
    assert.equal(
        await hasId(`account-picker-selected-${account(name).address}`, 1500),
        false,
        `the review starts with account ${name}`,
    );
});

// with one account to sign with there is nothing to pick: the account list does not open
Given('the review should offer no other account', async () => {
    await clickByTestId('account-picker');
    assert.equal(await hasId('select-account-list', 2500), false, 'the review offers more than one account');
});

Then('I open the account list of the review', async () => {
    await clickByTestId('account-picker');
    await waitForId('select-account-list', 10000);
});

Given('the account list should offer account {string}', { timeout: 60 * 1000 }, async (name) => {
    await bringAccountRowOnScreen(account(name).address);
});

// only for a short list (forced signers): every row is on screen
Given('the account list should not offer account {string}', async (name) => {
    assert.equal(
        await hasId(`select-account-${account(name).address}`, 1500),
        false,
        `account ${name} is offered in the account list of the review`,
    );
});

Then('I pick account {string} in the account list', { timeout: 90 * 1000 }, async (name) => {
    const { address } = account(name);
    await clickByTestId(await bringAccountRowOnScreen(address));
    await waitForId(`account-picker-selected-${address}`, 10000);
});

// nobody in the app can sign the request: the review stops and says who can
Given('the review should say that none of my accounts can sign', { timeout: 60 * 1000 }, async () => {
    await waitForId('preflight-error-view', 30000);
    await waitForId('preflight-multi-sign-signers', 10000);
});

// Close asks "Close or Decline" for a request of an application: decline it, so nothing stays open.
// On Android the sheet can be gone again before it is tapped (seen in the first run): then Close once more.
Then('I close the stopped review and decline the request', { timeout: 90 * 1000 }, async () => {
    const started = Date.now();
    const deadline = started + 60000;
    // what happened when, in the run log: shows whether the sheet came up after one Close
    const note = (text) => {
        // eslint-disable-next-line no-console
        console.error(`[multisign] +${Date.now() - started} ms ${text}`);
    };
    while (Date.now() < deadline) {
        if (await hasId('request-decline-decline-button', 4000)) {
            note('the Close or Decline sheet is up: Decline');
            await clickByTestId('request-decline-decline-button');
            await sleep(1500);
        } else if (await hasId('preflight-error-view', 1000)) {
            note('the stopped review is up without the sheet: Close');
            await clickByTestId('close-button');
        } else {
            note('the review is gone');
            return;
        }
    }
    throw new Error('the stopped review did not close');
});

/* The vault overlay: "Sign with" ==================================================================== */
// the selected account has a regular key in the app: the user picks which key signs
Then('I pick the regular key {string} to sign with', async (name) => {
    const rowId = `signer-delegate-${account(name).address}`;
    await waitForId(rowId, 15000);
    await clickByTestId(rowId);
    await clickByTestId('sign-button');
});

/* The result ==================================================================== */
Given(
    'the sign request should be multi signed as account {string} with the key of account {string}',
    { timeout: 90 * 1000 },
    async (signer, key) => {
        state.signed = await readSignedRequest(state.request.uuid);
        const { json } = state.signed;

        assert.equal(json.SigningPubKey, '', 'a multi signed transaction has no SigningPubKey of its own');
        assert.equal((json.Signers || []).length, 1, 'one Signer is expected');
        const { Signer } = json.Signers[0];
        assert.equal(nameOf(Signer.Account), signer, 'Signer.Account');
        assert.equal(nameOf(Signer.SigningPubKey), key, 'Signer.SigningPubKey');
        // what the app told the backend about the signer
        assert.equal(nameOf(state.signed.multisignAccount), signer, 'the signer account the app reported');
    },
);

/* Several signers for one transaction ==================================================================== */
Then('I start collecting signatures', async () => {
    state.kept = [];
});

Then('I keep the signed transaction', async () => {
    state.kept.push(state.signed.blob);
});

Given('the ledger should refuse one kept signature alone, below the quorum', { timeout: 2 * 60 * 1000 }, async () => {
    const result = await submitAndWait(state.kept[0]);
    assert.equal(result.validated, undefined, 'one signature alone is in a validated ledger');
    assert.equal(result.preliminary, 'tefBAD_QUORUM');
});

Given('the ledger should accept the kept signatures combined', { timeout: 3 * 60 * 1000 }, async () => {
    assert.ok(state.kept.length > 1, 'more than one signature is needed');
    const result = await submitAndWait(combineSignatures(state.kept));
    assert.equal(result.validated, 'tesSUCCESS', `the ledger said: ${result.validated || result.preliminary}`);
});

Given(
    'the sign request should have a normal signature for account {string} with the key of account {string}',
    { timeout: 90 * 1000 },
    async (name, key) => {
        state.signed = await readSignedRequest(state.request.uuid);
        const { json } = state.signed;

        assert.equal(json.Signers, undefined, 'no Signers are expected');
        assert.equal(nameOf(json.Account), name, 'Account');
        assert.equal(nameOf(json.SigningPubKey), key, 'SigningPubKey');
    },
);

// A multi signed request is not submitted by the app: submit it here. A normal request was submitted by the app.
Given('the ledger should accept the signed transaction', { timeout: 3 * 60 * 1000 }, async () => {
    const { blob, txid } = state.signed;
    if (state.request.multisign) {
        const result = await submitAndWait(blob);
        assert.equal(result.validated, 'tesSUCCESS', `the ledger said: ${result.validated || result.preliminary}`);
        return;
    }
    assert.equal(await waitForTransaction(txid), 'tesSUCCESS', 'the transaction the app submitted');
});
