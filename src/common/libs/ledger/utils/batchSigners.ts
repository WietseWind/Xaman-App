import { libraries } from 'xrpl-accountlib';

/* Types ==================================================================== */
type BatchSignerEntry = {
    BatchSigner: {
        Account: string;
        SigningPubKey?: string;
        TxnSignature?: string;
        [key: string]: unknown;
    };
};

/* Utils ==================================================================== */
/**
 * Batch: the BatchSigners for the outer (Batch Account) signature: without an entry of the Batch Account
 * itself and without duplicates, sorted by AccountID (BatchV1_1 requires strictly ascending BatchSigners)
 * @param batchSigners BatchSigners from the transaction
 * @param batchAccount the Batch (outer) Account
 * @returns {BatchSignerEntry[]} the BatchSigners to sign the Batch with
 */
const outerBatchSigners = (batchSigners: BatchSignerEntry[], batchAccount?: string): BatchSignerEntry[] => {
    const accountId = (address: string) =>
        Buffer.from(libraries.rippleAddressCodec.decodeAccountID(address)).toString('hex').toUpperCase();

    return batchSigners
        .filter(
            (entry, index) =>
                typeof entry?.BatchSigner?.Account === 'string' &&
                entry.BatchSigner.Account !== batchAccount &&
                // the first entry of an account
                batchSigners.findIndex((e) => e?.BatchSigner?.Account === entry.BatchSigner.Account) === index,
        )
        .sort((a, b) => (accountId(a.BatchSigner.Account) < accountId(b.BatchSigner.Account) ? -1 : 1));
};

/**
 * Batch: the transaction JSON to sign
 * - inner account (co-signer): the transaction with only its own BatchSigner, the Batch Account signs later
 * - Batch Account: the transaction with the BatchSigners for the outer signature (see outerBatchSigners)
 * @param txJson the transaction JSON
 * @param batchAccount the Batch (outer) Account
 * @param coSignerBatchSigner the BatchSigner of the inner account that signs (undefined for the Batch Account)
 * @returns {Record<string, any>} the transaction JSON to sign
 */
const batchJsonForSigning = (
    txJson: Record<string, any>,
    batchAccount?: string,
    coSignerBatchSigner?: BatchSignerEntry,
): Record<string, any> => {
    if (coSignerBatchSigner) {
        return { ...txJson, BatchSigners: [coSignerBatchSigner] };
    }

    if (txJson?.TransactionType === 'Batch' && Array.isArray(txJson?.BatchSigners)) {
        return { ...txJson, BatchSigners: outerBatchSigners(txJson.BatchSigners, batchAccount) };
    }

    return { ...txJson };
};

/* Export ==================================================================== */
export { outerBatchSigners, batchJsonForSigning };
