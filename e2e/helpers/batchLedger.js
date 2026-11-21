// The ledger side of the Batch scenarios (issue 533): accounts on XRPL Testnet, the Batch transactions, the
// BatchSigner of an inner account that signs outside the app, and what the ledger says about the result.
//
// A Batch (XLS-56) is an XRPL transaction; the rest of the suite runs on Xahau Testnet, which has no Batch.
// So this helper has its own node and its own faucet.
const fetch = require('node-fetch');
const { XrplClient } = require('xrpl-client');
const AccountLib = require('xrpl-accountlib');

const { newAccount } = require('./signRequests');

const NODE = 'wss://s.altnet.rippletest.net:51233';
const FAUCET = 'https://faucet.altnet.rippletest.net/accounts';
// the key of this network in the app and for the platform API (force_network)
const NETWORK_KEY = 'TESTNET';

const tfAllOrNothing = 0x00010000;
const tfInnerBatchTxn = 0x40000000;

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const withLedger = async (work) => {
    const connection = new XrplClient(NODE);
    await connection.ready();
    try {
        return await work((request) => connection.send(request));
    } finally {
        connection.close();
    }
};

const keyOf = (account) => AccountLib.derive.familySeed(account.seed);

/* Accounts ==================================================================== */
const accountInfo = (address) =>
    withLedger((send) => send({ command: 'account_info', account: address, ledger_index: 'validated' }));

const accountSequence = (address) =>
    withLedger(async (send) => {
        const info = await send({ command: 'account_info', account: address, ledger_index: 'current' });
        if (!info.account_data) {
            throw new Error(`${address} is not on XRPL Testnet`);
        }
        return info.account_data.Sequence;
    });

/** Ask the faucet for the reserve and some more, and wait until a validated ledger has the account. */
const fund = async (address) => {
    let last = '';
    for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
            const response = await fetch(FAUCET, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ destination: address }),
            });
            last = `HTTP ${response.status}`;
            if (response.ok) {
                const deadline = Date.now() + 60000;
                while (Date.now() < deadline) {
                    const info = await accountInfo(address);
                    if (info.account_data) {
                        return;
                    }
                    await sleep(2500);
                }
                last = 'funded by the faucet, but in no validated ledger after 60 s';
            }
        } catch (error) {
            last = String(error && error.message);
        }
        await sleep(5000 * (attempt + 1));
    }
    throw new Error(`the XRPL Testnet faucet did not fund ${address}: ${last}`);
};

/* Transactions ==================================================================== */
/** The validated result of a blob: submit it and wait. Returns what the ledger said. */
const submitAndWait = (blob) =>
    withLedger(async (send) => {
        const hash = AccountLib.utils.computeBinaryTransactionHash(blob);
        const submitted = await send({ command: 'submit', tx_blob: blob });
        const preliminary =
            submitted.engine_result ||
            [submitted.error, submitted.error_exception || submitted.error_message].filter(Boolean).join(': ');
        const applied = !submitted.error && /^(tes|ter)/.test(String(submitted.engine_result));
        const deadline = Date.now() + (applied ? 60000 : 8000);
        while (Date.now() < deadline) {
            const tx = await send({ command: 'tx', transaction: hash });
            if (tx.validated) {
                return { hash, preliminary, validated: tx.meta.TransactionResult };
            }
            await sleep(2500);
        }
        return { hash, preliminary, validated: undefined };
    });

/** The validated result of a transaction that the app submitted. */
const waitForTransaction = (hash, timeoutMs = 60000) =>
    withLedger(async (send) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const tx = await send({ command: 'tx', transaction: hash });
            if (tx.validated) {
                return tx.meta.TransactionResult;
            }
            await sleep(2500);
        }
        return undefined;
    });

/** Give an account a signer list (weight 1 each). The account signs with its own key. */
const setSignerList = async (account, signers, quorum = 1) => {
    const signed = AccountLib.sign(
        {
            TransactionType: 'SignerListSet',
            Account: account.address,
            Fee: '100',
            Sequence: await accountSequence(account.address),
            SignerQuorum: quorum,
            SignerEntries: signers.map((signer) => ({ SignerEntry: { Account: signer.address, SignerWeight: 1 } })),
        },
        keyOf(account),
    );
    const result = await submitAndWait(signed.signedTransaction);
    if (result.validated !== 'tesSUCCESS') {
        throw new Error(`SignerListSet failed: ${result.validated || result.preliminary || 'not validated'}`);
    }
};

/* Batch ==================================================================== */
/**
 * A Batch of one AccountSet for each inner account, in the order given. The Batch Account pays, and when it
 * is an inner account too its inner transaction has the Sequence after that of the Batch.
 * `fee`: enough for the Batch, its inner transactions and the signers of a multi signature.
 */
const buildBatch = async (outer, inners, fee = '1000') => {
    const outerSequence = await accountSequence(outer.address);
    const RawTransactions = [];
    for (const inner of inners) {
        const Sequence =
            inner.address === outer.address ? outerSequence + 1 : await accountSequence(inner.address);
        RawTransactions.push({
            RawTransaction: {
                TransactionType: 'AccountSet',
                Account: inner.address,
                Fee: '0',
                Flags: tfInnerBatchTxn,
                Sequence,
                SigningPubKey: '',
            },
        });
    }
    return {
        TransactionType: 'Batch',
        Account: outer.address,
        Flags: tfAllOrNothing,
        Fee: fee,
        Sequence: outerSequence,
        RawTransactions,
    };
};

/** The BatchSigner of an inner account, made outside the app with the key of that account. */
const batchSignerOf = (batch, account) => AccountLib.signInnerBatch(batch, keyOf(account));

/** BatchSigners in the order the ledger wants: ascending by AccountID. */
const sortedBatchSigners = (entries) => {
    const id = (address) =>
        Buffer.from(AccountLib.libraries.rippleAddressCodec.decodeAccountID(address)).toString('hex');
    return [...entries].sort((a, b) => (id(a.BatchSigner.Account) < id(b.BatchSigner.Account) ? -1 : 1));
};

/** A signed blob with BatchSigners added: they are no part of what the Batch Account (or its signers) signed. */
const withBatchSigners = (blob, entries) => {
    const json = AccountLib.binary.decode(blob);
    return AccountLib.binary.encode({ ...json, BatchSigners: sortedBatchSigners(entries) });
};

/** The Batch Account signs the Batch itself, outside the app (the last stage, with the collected BatchSigners). */
const signBatchAsAccount = (batch, account) => AccountLib.sign(batch, keyOf(account)).signedTransaction;

/** Is the BatchSigner signature valid for this Batch? */
const batchSignerValid = (batch, entry) => {
    const { verify } = require('ripple-keypairs');
    const data = AccountLib.utils.batchSignerSigningData(batch, entry.BatchSigner.Account);
    return verify(data, entry.BatchSigner.TxnSignature, entry.BatchSigner.SigningPubKey);
};

module.exports = {
    NETWORK_KEY,
    newAccount,
    fund,
    accountSequence,
    submitAndWait,
    waitForTransaction,
    setSignerList,
    buildBatch,
    batchSignerOf,
    sortedBatchSigners,
    withBatchSigners,
    signBatchAsAccount,
    batchSignerValid,
};
