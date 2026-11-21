// Two phones sign for one transaction: each phone has its own run of this suite, and the runs share a state
// file (the accounts of the run, the transactions, and what the first phone signed).
//
//   E2E_TWO_PHONES=first|second   which phone this run is
//   E2E_TWO_PHONES_STATE=<file>   the state file, outside the repo; it holds seeds of throwaway testnet
//                                 accounts, so the script that starts the runs deletes it afterwards
//
// Without these the scenarios are skipped. See scripts/e2e/two-phones.sh.
const assert = require('assert');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { Given, Then } = require('@cucumber/cucumber');
const { device } = require('detox');

const { androidSerial } = require('../helpers/androidSerial');
const { unlockAndroidPasscodeWhenItShows } = require('../helpers/tapById');
const {
    FEE,
    createSignRequest,
    readSignedRequest,
    newAccount,
    accountSequence,
    submitAndWait,
    combineSignatures,
    setUpSignersAndRegularKey,
} = require('../helpers/signRequests');
const batchLedger = require('../helpers/batchLedger');

// the account steps keep the account they work with on their module object (address, seed)
const accountSteps = require('./account');

const isAndroid = () => device.getPlatform() === 'android';
const hasField = (json, field) => Object.prototype.hasOwnProperty.call(json, field);

/* The shared state ==================================================================== */
const stateFile = () => process.env.E2E_TWO_PHONES_STATE;
const readState = () => {
    try {
        return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    } catch (e) {
        return { accounts: {}, sequenceUsed: {}, multiSign: undefined, batches: {} };
    }
};
const writeState = (state) => fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2), { mode: 0o600 });
const change = (work) => {
    const state = readState();
    const result = work(state);
    writeState(state);
    return result;
};

const account = (name) => {
    const found = readState().accounts[name];
    assert(found, `no account "${name}" in the state of the two phone run: the first phone did not prepare it`);
    return found;
};
const nameOf = (value) => {
    const { accounts } = readState();
    return (
        Object.keys(accounts).find((name) => accounts[name].address === value || accounts[name].publicKey === value) ||
        `unknown ${value}`
    );
};

// this run
const run = { request: undefined, signed: undefined };

/* Which phone ==================================================================== */
Given('this is the {string} phone of a two phone run', async (which) => {
    if (process.env.E2E_TWO_PHONES !== which || !stateFile()) {
        return 'skipped';
    }
    return undefined;
});

/* Preparation (first phone) ==================================================================== */
// Xahau Testnet: D with the signer list S1 + S2, quorum 2 (generic multi sign).
// XRPL Testnet: BA with the same signer list and quorum (a multi signed Batch), the inner account X1, and
// the Batch Account P2. S1 and X1 are for the first phone, S2 and P2 for the second.
Then('I prepare the accounts of the two phone run', { timeout: 12 * 60 * 1000 }, async () => {
    const accounts = {};
    ['D', 'BA', 'S1', 'S2', 'X1', 'P2'].forEach((name) => {
        accounts[name] = newAccount();
    });
    writeState({ accounts, sequenceUsed: {}, multiSign: undefined, batches: {} });

    await setUpSignersAndRegularKey(accounts.D, [accounts.S1, accounts.S2], undefined, 2);
    await Promise.all(['BA', 'X1', 'P2'].map((name) => batchLedger.fund(accounts[name].address)));
    await batchLedger.setSignerList(accounts.BA, [accounts.S1, accounts.S2], 2);
});

// hands the account to the account import steps ("I enter my seed in the input", "I read my account address")
Then('I use the two phone account {string}', async (name) => {
    const { seed, address } = account(name);
    accountSteps.seed = seed;
    accountSteps.address = address;
    accountSteps.mnemonic = undefined;
});

Then('I open the two phone sign request', async () => {
    const { url } = run.request;
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

/* Generic multi sign: one transaction, a signature of each phone (Xahau Testnet) ================== */
// The same transaction for both phones: the first request makes it, the second one takes it from the state
Then(
    'I create the multi sign request of the two phone run for signer {string}',
    { timeout: 2 * 60 * 1000 },
    async (signer) => {
        let { multiSign } = readState();
        if (!multiSign) {
            const from = account('D');
            multiSign = {
                json: {
                    TransactionType: 'AccountSet',
                    Account: from.address,
                    Sequence: await accountSequence(from.address),
                    // a multi signed transaction pays for each signature
                    Fee: String(Number(FEE) * 3),
                },
                blobs: [],
            };
            change((state) => {
                state.multiSign = multiSign;
            });
        }
        run.signed = undefined;
        run.request = await createSignRequest(multiSign.json, {
            multisign: true,
            submit: false,
            signers: [account(signer).address],
        });
    },
);

const assertMultiSigned = (json, signer) => {
    assert.strictEqual(hasField(json, 'SigningPubKey'), true, 'a multi signed transaction has the SigningPubKey field');
    assert.strictEqual(json.SigningPubKey, '', 'the SigningPubKey of a multi signed transaction is empty');
    assert.strictEqual(hasField(json, 'TxnSignature'), false, 'a multi signed transaction has no TxnSignature');
    assert.strictEqual((json.Signers || []).length, 1, 'one Signer is expected from one phone');
    assert.strictEqual(nameOf(json.Signers[0].Signer.Account), signer, 'Signer.Account');
    assert.strictEqual(nameOf(json.Signers[0].Signer.SigningPubKey), signer, 'Signer.SigningPubKey');
};

Given('I keep the multi signed result of signer {string}', { timeout: 90 * 1000 }, async (signer) => {
    run.signed = await readSignedRequest(run.request.uuid);
    assertMultiSigned(run.signed.json, signer);
    change((state) => {
        state.multiSign.blobs.push(run.signed.blob);
    });
});

Given(
    'the ledger should refuse one multi signature alone and accept both phones combined',
    { timeout: 4 * 60 * 1000 },
    async () => {
        const { blobs } = readState().multiSign;
        assert.strictEqual(blobs.length, 2, 'a signature of each phone is expected');
        const alone = await submitAndWait(blobs[0]);
        assert.strictEqual(alone.validated, undefined, 'one signature alone is in a validated ledger');
        assert.strictEqual(alone.preliminary, 'tefBAD_QUORUM');
        const result = await submitAndWait(combineSignatures(blobs));
        assert.strictEqual(result.validated, 'tesSUCCESS', `the ledger said: ${result.validated || result.preliminary}`);
    },
);

/* Batch (XRPL Testnet) ==================================================================== */
// A Batch of this run, made once and kept in the state. An inner account that is in a Batch that is not on
// the ledger yet gets the next Sequence in the Batch after it.
const batchOf = async (outerName, innerNames) => {
    const kept = readState().batches[outerName];
    if (kept) {
        return kept;
    }
    const outer = account(outerName);
    const inners = innerNames.split(',').map((name) => account(name.trim()));
    const batch = await batchLedger.buildBatch(outer, inners);
    const { sequenceUsed } = readState();
    batch.RawTransactions.forEach(({ RawTransaction }) => {
        if (RawTransaction.Account !== outer.address) {
            const used = sequenceUsed[RawTransaction.Account] || 0;
            RawTransaction.Sequence += used;
            sequenceUsed[RawTransaction.Account] = used + 1;
        }
    });
    const made = { batch, batchSigners: [], blobs: [] };
    change((state) => {
        state.batches[outerName] = made;
        state.sequenceUsed = sequenceUsed;
    });
    return made;
};

const withKeptBatchSigners = (kept) => ({
    ...kept.batch,
    BatchSigners: batchLedger.sortedBatchSigners(kept.batchSigners),
});

// An inner account of someone else signs its BatchSigner; the app submits nothing
Then(
    'I create the sign request for the Batch of {string} with inner accounts {string} for the inner account',
    { timeout: 2 * 60 * 1000 },
    async (outer, inners) => {
        const { batch } = await batchOf(outer, inners);
        run.signed = undefined;
        run.request = await createSignRequest(batch, { force_network: batchLedger.NETWORK_KEY, submit: false });
    },
);

Given(
    'I keep the BatchSigner of {string} for the Batch of {string}',
    { timeout: 90 * 1000 },
    async (inner, outer) => {
        run.signed = await readSignedRequest(run.request.uuid);
        const { json } = run.signed;
        assert.strictEqual(hasField(json, 'SigningPubKey'), false, 'no SigningPubKey: no signature of the Batch');
        assert.strictEqual(hasField(json, 'TxnSignature'), false, 'no TxnSignature');
        assert.strictEqual(json.Signers, undefined, 'no Signers');
        assert.strictEqual((json.BatchSigners || []).length, 1, 'one BatchSigner');
        const [entry] = json.BatchSigners;
        assert.strictEqual(nameOf(entry.BatchSigner.Account), inner, 'BatchSigner.Account');
        assert.strictEqual(batchLedger.batchSignerValid(json, entry), true, 'the BatchSigner signature is valid');
        change((state) => {
            state.batches[outer].batchSigners.push(entry);
        });
    },
);

// The last stage on the other phone: the Batch Account signs with the BatchSigner of the first phone, and
// the app submits
Then(
    'I create the sign request for the Batch of {string} with the BatchSigners of the other phone',
    { timeout: 2 * 60 * 1000 },
    async (outer) => {
        const kept = readState().batches[outer];
        assert(kept && kept.batchSigners.length, `the first phone kept no BatchSigner for the Batch of ${outer}`);
        run.signed = undefined;
        run.request = await createSignRequest(withKeptBatchSigners(kept), {
            force_network: batchLedger.NETWORK_KEY,
            submit: true,
        });
    },
);

Given(
    'the ledger should have the Batch of {string} that this phone signed and submitted',
    { timeout: 4 * 60 * 1000 },
    async (outer) => {
        run.signed = await readSignedRequest(run.request.uuid);
        const { json, txid } = run.signed;
        assert.strictEqual(nameOf(json.Account), outer, 'the Batch Account');
        assert.strictEqual(nameOf(json.SigningPubKey), outer, 'SigningPubKey');
        assert.strictEqual(hasField(json, 'TxnSignature'), true, 'TxnSignature');
        assert.strictEqual((json.BatchSigners || []).length, 1, 'the BatchSigner of the other phone');
        const result = await batchLedger.waitForTransaction(txid);
        assert.strictEqual(result, 'tesSUCCESS', `the ledger said: ${result || 'not validated'}`);
    },
);

// A multi sign request for a Batch, with the BatchSigner that the first phone made: one signer on each phone
Then(
    'I create the multi sign request for the Batch of {string} for signer {string}',
    { timeout: 2 * 60 * 1000 },
    async (outer, signer) => {
        const kept = readState().batches[outer];
        assert(kept && kept.batchSigners.length, `no BatchSigner is kept for the Batch of ${outer}`);
        run.signed = undefined;
        run.request = await createSignRequest(withKeptBatchSigners(kept), {
            force_network: batchLedger.NETWORK_KEY,
            multisign: true,
            submit: false,
            signers: [account(signer).address],
        });
    },
);

Given(
    'I keep the multi signed Batch of {string} of signer {string}',
    { timeout: 90 * 1000 },
    async (outer, signer) => {
        run.signed = await readSignedRequest(run.request.uuid);
        const { json } = run.signed;
        assertMultiSigned(json, signer);
        assert.strictEqual(json.TransactionType, 'Batch');
        // the BatchSigner of the first phone is there as it was made
        const kept = readState().batches[outer];
        assert.deepStrictEqual(
            batchLedger.sortedBatchSigners(json.BatchSigners || []),
            batchLedger.sortedBatchSigners(kept.batchSigners),
            'the BatchSigners of the request',
        );
        change((state) => {
            state.batches[outer].blobs.push(run.signed.blob);
        });
    },
);

Given(
    'the ledger should refuse one Batch signature alone and accept the Batch of {string} with both phones combined',
    { timeout: 4 * 60 * 1000 },
    async (outer) => {
        const { blobs } = readState().batches[outer];
        assert.strictEqual(blobs.length, 2, 'a signature of each phone is expected');
        const alone = await batchLedger.submitAndWait(blobs[0]);
        assert.strictEqual(alone.validated, undefined, 'one signature alone is in a validated ledger');
        assert.strictEqual(alone.preliminary, 'tefBAD_QUORUM');
        const result = await batchLedger.submitAndWait(combineSignatures(blobs));
        assert.strictEqual(result.validated, 'tesSUCCESS', `the ledger said: ${result.validated || result.preliminary}`);
    },
);
