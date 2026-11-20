// The ledger side of the Remit scenarios (Xahau Testnet): accounts that hold what a Remit can send, and
// what the ledger says after the app signed and sent one.
//
// A Remit can send amounts (the native asset and issued tokens), transfer URITokens and mint a URIToken.
// So the sender needs an issued token (a trust line and a balance) and URITokens of its own, and the
// scenarios need destinations that exist, with and without a trust line. Everything is made for the run.
const AccountLib = require('xrpl-accountlib');
const { XrplClient } = require('xrpl-client');

const { activateAccount } = require('./fixtures');
const { FEE, newAccount, accountSequence, submitAndWait } = require('./signRequests');

const NODE = 'wss://xahau-test.net';
const NETWORK_ID = 21338;
const CURRENCY = 'EUR';

const hex = (text) => Buffer.from(text, 'utf8').toString('hex').toUpperCase();

const withLedger = async (work) => {
    const connection = new XrplClient(NODE);
    await connection.ready();
    try {
        return await work((request) => connection.send(request));
    } finally {
        connection.close();
    }
};

// URITokenMint is a Xahau transaction: signing it needs the definitions of the network
let definitions;
const networkDefinitions = async () => {
    if (!definitions) {
        const raw = await withLedger((send) => send({ command: 'server_definitions' }));
        if (!raw || !raw.TRANSACTION_TYPES) {
            throw new Error('the node gave no definitions');
        }
        definitions = new AccountLib.XrplDefinitions(raw);
    }
    return definitions;
};

/** Sign with the family seed of the account, send, and wait for the validated result. */
const signAndSubmit = async (account, transaction) => {
    const signed = AccountLib.sign(
        {
            Account: account.address,
            NetworkID: NETWORK_ID,
            Fee: FEE,
            Sequence: await accountSequence(account.address),
            ...transaction,
        },
        AccountLib.derive.familySeed(account.seed),
        await networkDefinitions(),
    );
    const result = await submitAndWait(signed.signedTransaction);
    if (result.validated !== 'tesSUCCESS') {
        throw new Error(
            `${transaction.TransactionType} failed: ${result.validated || result.preliminary || 'not validated'}`,
        );
    }
    return result;
};

/* What is on the ledger ==================================================================== */
const accountExists = (address) =>
    withLedger(async (send) => {
        const info = await send({ command: 'account_info', account: address, ledger_index: 'validated' });
        return !!info.account_data;
    });

/** The native balance in drops, or undefined when the account does not exist. */
const nativeBalance = (address) =>
    withLedger(async (send) => {
        const info = await send({ command: 'account_info', account: address, ledger_index: 'validated' });
        return info.account_data ? String(info.account_data.Balance) : undefined;
    });

/** The balance of the issued token as the account sees it, or undefined when it has no trust line. */
const tokenBalance = (address, issuer, currency = CURRENCY) =>
    withLedger(async (send) => {
        const lines = await send({
            command: 'account_lines',
            account: address,
            peer: issuer,
            ledger_index: 'validated',
        });
        const line = (lines.lines || []).find((entry) => entry.currency === currency);
        return line ? String(line.balance) : undefined;
    });

/** The URITokens an account owns: [{ id, uri, issuer }]. */
const uriTokensOf = (address) =>
    withLedger(async (send) => {
        const objects = await send({
            command: 'account_objects',
            account: address,
            type: 'uri_token',
            ledger_index: 'validated',
        });
        return (objects.account_objects || []).map((entry) => ({
            id: String(entry.index),
            uri: String(entry.URI || ''),
            issuer: String(entry.Issuer || ''),
        }));
    });

/** The owner of a URIToken, or undefined when it does not exist. */
const uriTokenOwner = (id) =>
    withLedger(async (send) => {
        const entry = await send({ command: 'ledger_entry', index: id, ledger_index: 'validated' });
        return entry.node ? String(entry.node.Owner) : undefined;
    });

/* The accounts of the scenarios ==================================================================== */
/**
 * sender:   in the app. Holds 100 EUR of the issuer and two URITokens of its own.
 * issuer:   issues EUR. Also the account that a Remit informs.
 * existing: a destination that exists, without a trust line.
 */
/** A validated transaction with its metadata, or undefined when it is in no validated ledger (yet). */
const validatedTransaction = (hash, timeoutMs = 60000) =>
    withLedger(async (send) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const tx = await send({ command: 'tx', transaction: hash });
            if (tx.validated) {
                return tx;
            }
            await new Promise((resolve) => { setTimeout(resolve, 2500); });
        }
        return undefined;
    });

/**
 * What a validated Remit took from its sender for reserves at the destination, in drops: what left the
 * sender's balance, less the fee and less the native amounts that the Remit sends.
 */
const remitReservesPaid = (tx) => {
    const sender = (tx.meta.AffectedNodes || [])
        .map((node) => node.ModifiedNode)
        .find((node) => node && node.LedgerEntryType === 'AccountRoot' && node.FinalFields.Account === tx.Account);
    if (!sender || !sender.PreviousFields || !sender.PreviousFields.Balance) {
        throw new Error(`the Remit ${tx.hash} did not change the balance of its sender`);
    }
    const sent = (tx.Amounts || [])
        .map((entry) => entry.AmountEntry.Amount)
        .filter((amount) => typeof amount === 'string')
        .reduce((sum, amount) => sum + BigInt(amount), 0n);
    return BigInt(sender.PreviousFields.Balance) - BigInt(sender.FinalFields.Balance) - BigInt(tx.Fee) - sent;
};

const prepareRemitAccounts = async () => {
    const sender = newAccount();
    const issuer = newAccount();
    const existing = newAccount();

    await activateAccount(issuer.address);
    await activateAccount(sender.address);
    await activateAccount(existing.address);

    // an issuer lets its token go from holder to holder (asfDefaultRipple). Without it the trust line of
    // the sender has "no ripple" on the side of the issuer, and a Remit of the token is tecPATH_DRY.
    await signAndSubmit(issuer, { TransactionType: 'AccountSet', SetFlag: 8 });
    await signAndSubmit(sender, {
        TransactionType: 'TrustSet',
        LimitAmount: { currency: CURRENCY, issuer: issuer.address, value: '1000000' },
    });
    await signAndSubmit(issuer, {
        TransactionType: 'Payment',
        Destination: sender.address,
        Amount: { currency: CURRENCY, issuer: issuer.address, value: '100' },
    });

    const stamp = Date.now();
    const uris = [`ipfs://e2e-remit/${stamp}/transfer-1.json`, `ipfs://e2e-remit/${stamp}/transfer-2.json`];
    for (const uri of uris) {
        await signAndSubmit(sender, { TransactionType: 'URITokenMint', URI: hex(uri) });
    }
    const owned = await uriTokensOf(sender.address);
    const tokens = uris.map((uri) => {
        const token = owned.find((entry) => entry.uri.toUpperCase() === hex(uri));
        if (!token) {
            throw new Error(`the sender does not own the URIToken ${uri}`);
        }
        return token.id;
    });

    return { sender, issuer, existing, tokens, currency: CURRENCY };
};

module.exports = {
    networkDefinitions,
    validatedTransaction,
    remitReservesPaid,
    CURRENCY,
    hex,
    prepareRemitAccounts,
    accountExists,
    nativeBalance,
    tokenBalance,
    uriTokensOf,
    uriTokenOwner,
};
