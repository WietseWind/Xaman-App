// Batch: real sign requests for a Batch on XRPL Testnet, signed in the app as a multi signer, as an inner
// account and as the Batch Account, and what the ledger says about each result (issue 533).
// The sign requests are payloads of the Xaman platform API, see ../helpers/signRequests; the accounts and
// the ledger side are in ../helpers/batchLedger.
const assert = require('assert');
const { execFileSync } = require('child_process');
const { Given, Then } = require('@cucumber/cucumber');
const { device } = require('detox');

const { androidSerial } = require('../helpers/androidSerial');
const { unlockAndroidPasscodeWhenItShows } = require('../helpers/tapById');
const { createSignRequest, readSignedRequest, newAccount } = require('../helpers/signRequests');
const {
    NETWORK_KEY,
    fund,
    setSignerList,
    buildBatch,
    batchSignerOf,
    sortedBatchSigners,
    withBatchSigners,
    signBatchAsAccount,
    batchSignerValid,
    submitAndWait,
    waitForTransaction,
} = require('../helpers/batchLedger');

// the account steps keep the account they work with on their module object (address, seed)
const accountSteps = require('./account');

const isAndroid = () => device.getPlatform() === 'android';

const state = {
    accounts: {},
    // the Batch of the scenario as it was asked, and the request
    batch: undefined,
    request: undefined,
    signed: undefined,
};

const account = (name) => {
    const found = state.accounts[name];
    assert(found, `no Batch account named "${name}"; the scenario that prepares the accounts did not run`);
    return found;
};
const accountsOf = (names) => names.split(',').map((name) => account(name.trim()));
const nameOf = (value) =>
    Object.keys(state.accounts).find(
        (name) => state.accounts[name].address === value || state.accounts[name].publicKey === value,
    ) || `unknown ${value}`;
const hasField = (json, field) => Object.prototype.hasOwnProperty.call(json, field);

/* Preparation ==================================================================== */
// A, X and Y get their reserve from the faucet; S only signs, it needs no account on the ledger
Then('I prepare the Batch accounts', { timeout: 8 * 60 * 1000 }, async () => {
    ['A', 'S', 'X', 'Y'].forEach((name) => {
        state.accounts[name] = newAccount();
    });
    await Promise.all(['A', 'X', 'Y'].map((name) => fund(account(name).address)));
    await setSignerList(account('A'), [account('S')]);
});

// hands the account to the account import steps ("I enter my seed in the input", "I read my account address")
Then('I use the Batch account {string}', async (name) => {
    const { seed, address } = account(name);
    accountSteps.seed = seed;
    accountSteps.address = address;
    accountSteps.mnemonic = undefined;
});

/* Sign requests ==================================================================== */
// A multi sign request: Account, Sequence and Fee are fixed by the requester, the app submits nothing
const createMultiSign = async (outer, inners, signer, collected) => {
    const batch = await buildBatch(account(outer), accountsOf(inners));
    if (collected) {
        batch.BatchSigners = sortedBatchSigners(accountsOf(collected).map((inner) => batchSignerOf(batch, inner)));
    }
    state.signed = undefined;
    state.batch = batch;
    state.request = await createSignRequest(batch, {
        force_network: NETWORK_KEY,
        multisign: true,
        submit: false,
        signers: [account(signer).address],
    });
};

Then(
    'I create a multi sign request for a Batch of {string} with inner accounts {string} for signer {string}',
    { timeout: 2 * 60 * 1000 },
    async (outer, inners, signer) => createMultiSign(outer, inners, signer, undefined),
);

Then(
    'I create a multi sign request for a Batch of {string} with inner accounts {string} for signer {string} ' +
        'with the BatchSigners of {string}',
    { timeout: 2 * 60 * 1000 },
    async (outer, inners, signer, collected) => createMultiSign(outer, inners, signer, collected),
);

// An inner account of someone else signs: the Batch Account and its Sequence are in the request, and the
// app submits nothing (the Batch Account signs later)
Then(
    'I create a sign request for a Batch of {string} with inner accounts {string}',
    { timeout: 2 * 60 * 1000 },
    async (outer, inners) => {
        const batch = await buildBatch(account(outer), accountsOf(inners));
        state.signed = undefined;
        state.batch = batch;
        state.request = await createSignRequest(batch, { force_network: NETWORK_KEY, submit: false });
    },
);

// The last stage: every BatchSigner is there, the Batch Account signs and the app submits
Then(
    'I create a sign request for a Batch of {string} with inner accounts {string} with the BatchSigners of {string}',
    { timeout: 2 * 60 * 1000 },
    async (outer, inners, collected) => {
        const batch = await buildBatch(account(outer), accountsOf(inners));
        batch.BatchSigners = sortedBatchSigners(accountsOf(collected).map((inner) => batchSignerOf(batch, inner)));
        state.signed = undefined;
        state.batch = batch;
        state.request = await createSignRequest(batch, { force_network: NETWORK_KEY, submit: true });
    },
);

Then('I open the Batch sign request', async () => {
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

/* The result ==================================================================== */
// The backend took the signature (the sign call of the app was accepted): the request is signed, with a blob
const readSigned = async () => {
    state.signed = await readSignedRequest(state.request.uuid);
    return state.signed.json;
};

const assertMultiSigned = (json, signer) => {
    assert.strictEqual(json.TransactionType, 'Batch');
    assert.strictEqual(json.Account, state.batch.Account, 'the Batch Account');
    assert.strictEqual(hasField(json, 'SigningPubKey'), true, 'a multi signed transaction has the SigningPubKey field');
    assert.strictEqual(json.SigningPubKey, '', 'the SigningPubKey of a multi signed transaction is empty');
    assert.strictEqual(hasField(json, 'TxnSignature'), false, 'a multi signed transaction has no TxnSignature');
    assert.strictEqual((json.Signers || []).length, 1, 'one Signer is expected');
    assert.strictEqual(nameOf(json.Signers[0].Signer.Account), signer, 'Signer.Account');
    assert.strictEqual(nameOf(json.Signers[0].Signer.SigningPubKey), signer, 'Signer.SigningPubKey');
    assert.strictEqual(nameOf(state.signed.multisignAccount), signer, 'the signer account the app reported');
};

const assertBatchSigners = (json, names) => {
    const entries = json.BatchSigners || [];
    assert.deepStrictEqual(
        entries.map((entry) => nameOf(entry.BatchSigner.Account)).sort(),
        names.split(',').map((name) => name.trim()).sort(),
        'the accounts of the BatchSigners',
    );
    entries.forEach((entry) => {
        assert.strictEqual(
            batchSignerValid(json, entry),
            true,
            `the BatchSigner signature of ${nameOf(entry.BatchSigner.Account)} is valid for the signed Batch`,
        );
    });
};

Given(
    'the Batch should be multi signed by {string} with an empty SigningPubKey and no BatchSigners',
    { timeout: 90 * 1000 },
    async (signer) => {
        const json = await readSigned();
        assertMultiSigned(json, signer);
        // the multi signer signs for the Batch Account: it is no inner signer and adds no BatchSigner
        assert.strictEqual(json.BatchSigners, undefined, 'no BatchSigners');
    },
);

Given(
    'the Batch should be multi signed by {string} with an empty SigningPubKey and the BatchSigners of {string}',
    { timeout: 90 * 1000 },
    async (signer, names) => {
        const json = await readSigned();
        assertMultiSigned(json, signer);
        assertBatchSigners(json, names);
        // the same entries as in the request: account, key and signature
        assert.deepStrictEqual(sortedBatchSigners(json.BatchSigners), sortedBatchSigners(state.batch.BatchSigners));
    },
);

Given(
    'the Batch should have only the BatchSigner of {string}, and no signature of the Batch',
    { timeout: 90 * 1000 },
    async (name) => {
        const json = await readSigned();
        assert.strictEqual(json.Account, state.batch.Account, 'the Batch Account');
        // no signature of the Batch itself
        assert.strictEqual(hasField(json, 'SigningPubKey'), false, 'no SigningPubKey');
        assert.strictEqual(hasField(json, 'TxnSignature'), false, 'no TxnSignature');
        assert.strictEqual(json.Signers, undefined, 'no Signers');
        assertBatchSigners(json, name);
        assert.strictEqual(nameOf(json.BatchSigners[0].BatchSigner.SigningPubKey), name, 'BatchSigner.SigningPubKey');
    },
);

Given(
    'the Batch should have a normal signature of {string} and the BatchSigners of {string}',
    { timeout: 90 * 1000 },
    async (name, names) => {
        const json = await readSigned();
        assert.strictEqual(nameOf(json.Account), name, 'the Batch Account');
        assert.strictEqual(nameOf(json.SigningPubKey), name, 'SigningPubKey');
        assert.strictEqual(hasField(json, 'TxnSignature'), true, 'TxnSignature');
        assert.strictEqual(json.Signers, undefined, 'no Signers');
        assertBatchSigners(json, names);
    },
);

/* The ledger ==================================================================== */
const assertAccepted = (result) =>
    assert.strictEqual(result.validated, 'tesSUCCESS', `the ledger said: ${result.validated || result.preliminary}`);

// The inner accounts sign the Batch of the signed blob (not the one that was asked: the same thing, but
// this is what goes to the ledger); BatchSigners are no part of what the multi signer signed.
Given(
    'the ledger should accept the Batch with the BatchSigners of {string} added',
    { timeout: 3 * 60 * 1000 },
    async (names) => {
        const { blob, json } = state.signed;
        const entries = accountsOf(names).map((inner) => batchSignerOf(json, inner));
        assertAccepted(await submitAndWait(withBatchSigners(blob, entries)));
    },
);

Given('the ledger should accept the Batch as it is', { timeout: 3 * 60 * 1000 }, async () => {
    assertAccepted(await submitAndWait(state.signed.blob));
});

// The inner account signed in the app; the Batch Account now signs the Batch with that BatchSigner
Given(
    'the ledger should accept the Batch after the Batch Account {string} signed it',
    { timeout: 3 * 60 * 1000 },
    async (name) => {
        const { json } = state.signed;
        assertAccepted(await submitAndWait(signBatchAsAccount(json, account(name))));
    },
);

Given('the ledger should have the Batch that the app submitted', { timeout: 3 * 60 * 1000 }, async () => {
    const result = await waitForTransaction(state.signed.txid);
    assert.strictEqual(result, 'tesSUCCESS', `the ledger said: ${result || 'not validated'}`);
});
