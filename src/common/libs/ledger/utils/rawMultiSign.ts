import * as AccountLib from 'xrpl-accountlib';

import { SignedObjectType } from '@common/libs/ledger/types';

/* Types ==================================================================== */
export type PreparedRawMultiSign = {
    signAs: string;
    signingPubKey: string;
    transaction: Record<string, any>;
    message: string;
    hashToSign: string;
};

/* Utils ==================================================================== */
/**
 * Multi sign with a key that only signs a hash (a Tangem card), "as" a given account.
 *
 * The signer of a multi signature (Signer.Account) is the account in the signer list. Its key can be the
 * key of another account: its regular key. xrpl-accountlib's rawSigning always signs as the account of the
 * key itself, so a signer with a card as regular key came out as the card account.
 *
 * @param txJson the transaction to sign
 * @param publicKey public key of the card (as the card gives it, or compressed / with the ED prefix)
 * @param signAs the account the signature is made as (Signer.Account)
 * @param definitions network definitions
 * @returns the data and the hash the card has to sign
 */
const prepareRawMultiSign = (
    txJson: Record<string, any>,
    publicKey: string,
    signAs: string,
    definitions?: AccountLib.XrplDefinitions,
): PreparedRawMultiSign => {
    if (!AccountLib.utils.isValidClassicAddress(signAs)) {
        throw new Error('Multi sign: the account to sign as is not a valid address');
    }

    const signingPubKey = AccountLib.utils.compressPubKey(publicKey);
    const transaction = { ...txJson, SigningPubKey: '' };
    // the signing data ends with the account the signature is made as
    const message = AccountLib.utils.encodeTransaction(transaction, signAs, definitions);

    return {
        signAs,
        signingPubKey,
        transaction,
        message,
        // an ed25519 card signs the data itself, a secp256k1 card its SHA-512Half
        hashToSign:
            AccountLib.utils.getAlgorithmFromKey(signingPubKey) === 'ed25519'
                ? message
                : AccountLib.utils.bytesToHex(AccountLib.utils.hash(message)),
    };
};

/**
 * Put the raw signature of the card in the transaction, as the one Signer.
 * Throws when the signature is not a signature of the prepared data by the prepared key.
 */
const completeRawMultiSign = (
    prepared: PreparedRawMultiSign,
    signature: string,
    definitions?: AccountLib.XrplDefinitions,
): SignedObjectType => {
    const rawSignature = String(signature).trim().toUpperCase();
    if (!/^[0-9A-F]{128}$/.test(rawSignature)) {
        throw new Error('Multi sign: the card did not give a 64 byte signature');
    }

    const txnSignature =
        AccountLib.utils.getAlgorithmFromKey(prepared.signingPubKey) === 'ed25519'
            ? rawSignature
            : AccountLib.utils.secp256k1_p1363ToFullyCanonicalDerSignature(rawSignature);

    if (!AccountLib.utils.verifySignature(prepared.message, txnSignature, prepared.signingPubKey)) {
        throw new Error(`Invalid signature by/for ${prepared.signAs}`);
    }

    const signedTransaction = AccountLib.utils.encodeTransaction(
        {
            ...prepared.transaction,
            Signers: [
                {
                    Signer: {
                        Account: prepared.signAs,
                        SigningPubKey: prepared.signingPubKey,
                        TxnSignature: txnSignature,
                    },
                },
            ],
        },
        undefined,
        definitions,
    );

    return {
        type: 'MultiSignedTx',
        id: AccountLib.utils.computeBinaryTransactionHash(signedTransaction),
        signedTransaction,
        txJson: AccountLib.binary.decode(signedTransaction, definitions),
        signers: [prepared.signAs],
    };
};

export { prepareRawMultiSign, completeRawMultiSign };
