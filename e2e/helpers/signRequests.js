// Sign requests (payloads) for the scenarios that need a real one, and the ledger side of those scenarios.
//
// A sign request with options (multi sign, forced signers) only exists as a payload of the Xaman platform
// API: the transaction template link takes a TrustSet only. So these scenarios need an API key + secret of
// a developer application, in a file that is never committed:
//
//   <repo>/.e2e-xaman-api.json   {"apiKey": "...", "apiSecret": "..."}     (or E2E_XAMAN_API_FILE=<path>)
//
// Without that file the scenarios are skipped. The values are never logged.
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { XrplClient } = require('xrpl-client');
const AccountLib = require('xrpl-accountlib');

const { activateAccount, generateFamilySeed } = require('./fixtures');

const API = 'https://xumm.app/api/v1/platform';
const NODE = 'wss://xahau-test.net';
const NETWORK_KEY = 'XAHAUTESTNET';
const NETWORK_ID = 21338;
const FEE = '1000';

const sleep = (ms) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

/* Xaman platform API ==================================================================== */
const credentialsFile = () =>
    process.env.E2E_XAMAN_API_FILE || path.resolve(__dirname, '../../.e2e-xaman-api.json');

const apiCredentials = () => {
    try {
        const { apiKey, apiSecret } = JSON.parse(fs.readFileSync(credentialsFile(), 'utf8'));
        return apiKey && apiSecret ? { apiKey, apiSecret } : undefined;
    } catch (e) {
        return undefined;
    }
};

const api = async (method, endpoint, body) => {
    const credentials = apiCredentials();
    if (!credentials) {
        throw new Error(`no Xaman API key and secret in ${credentialsFile()}`);
    }
    const response = await fetch(`${API}/${endpoint}`, {
        method,
        timeout: 20000,
        headers: {
            'content-type': 'application/json',
            'x-api-key': credentials.apiKey,
            'x-api-secret': credentials.apiSecret,
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.error) {
        // the answer of the API, never the request (it has the key and the secret)
        throw new Error(`Xaman API ${method} ${endpoint}: HTTP ${response.status} ${JSON.stringify(json.error || {})}`);
    }
    return json;
};

/**
 * Create a sign request, for the network the suite is connected to (Xahau Testnet). With
 * `options.force_network` of another network the transaction gets no NetworkID of Xahau Testnet.
 * @returns {{uuid: string, url: string}} the url opens the request in the app
 */
const createSignRequest = async (txjson, options = {}) => {
    const otherNetwork = options.force_network && options.force_network !== NETWORK_KEY;
    const created = await api('POST', 'payload', {
        txjson: otherNetwork ? { ...txjson } : { NetworkID: NETWORK_ID, ...txjson },
        options: { expire: 15, force_network: NETWORK_KEY, ...options },
    });
    if (!created.uuid || !created.next || !created.next.always) {
        throw new Error('the Xaman API gave no sign request');
    }
    return { uuid: created.uuid, url: created.next.always };
};

/** The sign request once it is signed: waits for the app to hand in the signature. */
// `definitions`: for a transaction type that the bundled (XRPL) definitions do not have, such as a Remit
const readSignedRequest = async (uuid, timeoutMs = 45000, definitions = undefined) => {
    const deadline = Date.now() + timeoutMs;
    let last = {};
    while (Date.now() < deadline) {
        last = await api('GET', `payload/${uuid}`);
        if (last.meta && last.meta.signed && last.response && last.response.hex) {
            return {
                blob: last.response.hex,
                txid: last.response.txid,
                dispatchedResult: last.response.dispatched_result,
                // the signer account the app reported for a multi signature
                multisignAccount: last.response.multisign_account,
                json: AccountLib.binary.decode(last.response.hex, definitions),
            };
        }
        if (last.meta && (last.meta.cancelled || last.meta.expired)) {
            break;
        }
        await sleep(2000);
    }
    throw new Error(`the sign request was not signed (meta: ${JSON.stringify(last.meta || {})})`);
};

/** The state of a sign request at the platform: signed, cancelled, expired, resolved. */
const signRequestMeta = async (uuid) => (await api('GET', `payload/${uuid}`)).meta || {};

/* Accounts ==================================================================== */
const newAccount = () => {
    const seed = generateFamilySeed();
    const derived = AccountLib.derive.familySeed(seed);
    return { seed, address: String(derived.address), publicKey: String(derived.keypair.publicKey) };
};

/* Ledger (Xahau Testnet) ==================================================================== */
const withLedger = async (work) => {
    const connection = new XrplClient(NODE);
    await connection.ready();
    try {
        return await work((request) => connection.send(request));
    } finally {
        connection.close();
    }
};

const accountSequence = (address) =>
    withLedger(async (send) => {
        const info = await send({ command: 'account_info', account: address, ledger_index: 'current' });
        if (!info.account_data) {
            throw new Error(`${address} is not on the ledger`);
        }
        return info.account_data.Sequence;
    });

/** The result of a transaction in a validated ledger, or undefined when it is in none (yet). */
const validatedResult = async (send, hash, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const tx = await send({ command: 'tx', transaction: hash });
        if (tx.validated) {
            return tx.meta.TransactionResult;
        }
        await sleep(2500);
    }
    return undefined;
};

/** Submit a signed blob and wait for the validated result. Returns what the ledger said. */
const submitAndWait = (blob) =>
    withLedger(async (send) => {
        const hash = AccountLib.utils.computeBinaryTransactionHash(blob);
        const submitted = await send({ command: 'submit', tx_blob: blob });
        const preliminary =
            submitted.engine_result ||
            [submitted.error, submitted.error_exception || submitted.error_message].filter(Boolean).join(': ');
        const applied = !submitted.error && /^(tes|ter)/.test(String(submitted.engine_result));
        // the ledger decides: look the hash up, also after an answer that says no
        const validated = await validatedResult(send, hash, applied ? 60000 : 8000);
        return { hash, preliminary, validated };
    });

/** Several multi signed copies of one transaction (one signer each) as one transaction with all signers. */
const combineSignatures = (blobs) => AccountLib.utils.combine(blobs).signedTransaction;

/** The validated result of a transaction that was submitted already (by the app). */
const waitForTransaction = (hash) => withLedger((send) => validatedResult(send, hash, 60000));

/**
 * Activate an account and give it a signer list (weight 1 each) and, when given, a regular key.
 */
const setUpSignersAndRegularKey = async (account, signers, regularKey, quorum = 1) => {
    await activateAccount(account.address);

    const signAndSubmit = async (transaction) => {
        const signed = AccountLib.sign(
            {
                Account: account.address,
                NetworkID: NETWORK_ID,
                Fee: FEE,
                Sequence: await accountSequence(account.address),
                ...transaction,
            },
            AccountLib.derive.familySeed(account.seed),
        );
        const result = await submitAndWait(signed.signedTransaction);
        if (result.validated !== 'tesSUCCESS') {
            throw new Error(
                `${transaction.TransactionType} failed: ${result.validated || result.preliminary || 'not validated'}`,
            );
        }
    };

    await signAndSubmit({
        TransactionType: 'SignerListSet',
        SignerQuorum: quorum,
        SignerEntries: signers.map((signer) => ({ SignerEntry: { Account: signer.address, SignerWeight: 1 } })),
    });
    if (regularKey) {
        await signAndSubmit({ TransactionType: 'SetRegularKey', RegularKey: regularKey.address });
    }
};

module.exports = {
    FEE,
    apiCredentials,
    createSignRequest,
    readSignedRequest,
    signRequestMeta,
    newAccount,
    accountSequence,
    submitAndWait,
    combineSignatures,
    waitForTransaction,
    setUpSignersAndRegularKey,
};
