import { type SignableTransaction } from '@common/libs/ledger/transactions/types';
import { type SignedObjectType } from '@common/libs/ledger/types';
import { serviceFeeLastLedgerSequence, serviceFeeSequence } from '@common/libs/ledger/serviceFee/rules';
import LedgerService from '@services/LedgerService';
import * as AccountLib from 'xrpl-accountlib';
import AppConfig from '@common/constants/config';
import { AuthMethods } from './types';

/**
 * Unsigned service-fee Payment. Sequence is unresolved when the main transaction
 * has none yet (a ticket); the caller then reads the account sequence.
 */
export const buildServiceFeePayment = (
    transaction: SignableTransaction,
    signedObject: SignedObjectType,
): { feeTrx: Record<string, any>; sequence: number | undefined } => {
    const json = transaction.JsonForSigning;
    const serviceFeeTxFee = String(Math.min(Number(json.Fee) || 100, 100));
    const sequence = serviceFeeSequence(json);

    let sequenceType = 'B';
    let sequenceInfo = '';
    const networkId = String(transaction?.NetworkID ? transaction.NetworkID : '');

    if (typeof sequence === 'number') {
        sequenceType = 'C';
        sequenceInfo = String(sequence);
    }
    if (typeof json?.TicketSequence !== 'undefined') {
        sequenceType = 'D';
        sequenceInfo = String(json.TicketSequence);
    }

    const feeTrx: Record<string, any> = {
        TransactionType: 'Payment',
        Account: json.Account,
        InvoiceID:
            signedObject?.id || `${'0'.repeat(64)}EE000${networkId}AA${sequenceType}000${sequenceInfo}`.slice(-64),
        Memos: [
            {
                Memo: {
                    MemoData: Buffer.from('Xaman Service Fee', 'utf-8').toString('hex').toUpperCase(),
                },
            },
        ],
        Destination: AppConfig.feeAccount,
        Sequence: sequence,
        NetworkID: transaction?.NetworkID,
        Amount: String(transaction.ServiceFee),
        Fee: serviceFeeTxFee,
    };

    const lastLedgerSequence = serviceFeeLastLedgerSequence(json);
    if (typeof lastLedgerSequence === 'number') {
        feeTrx.LastLedgerSequence = lastLedgerSequence;
    }

    return { feeTrx, sequence };
};

const getServiceFeeTx = async (
    transaction: SignableTransaction, // The original TX, for Account, Fee, Sequence, NetworkID
    signedObject: SignedObjectType, // The signed TX, for the TX ID
    signerInstance: AccountLib.XRPL_Account | undefined, // The instance so we can immediately sign again
    definitions: AccountLib.XrplDefinitions, // The definitions so we can deal with the network
    method: AuthMethods, // The signing method, so we can replicate that on the output
): Promise<SignedObjectType | undefined> => {
    let signedServiceFeeObject;
    if (Number(transaction?.ServiceFee || 0) > 0) {
        const built = buildServiceFeePayment(transaction, signedObject);
        const Sequence =
            typeof built.sequence === 'number'
                ? built.sequence
                : await LedgerService.getAccountSequence(transaction.JsonForSigning.Account);
        // A ticket on the main transaction does not consume a sequence, so read the account sequence.

        const feeTrx: Record<string, any> = {
            ...built.feeTrx,
            Sequence,
        };

        if (typeof built.sequence !== 'number' && !signedObject?.id) {
            const networkId = String(transaction?.NetworkID ? transaction.NetworkID : '');
            const ticket = transaction.JsonForSigning?.TicketSequence;
            const sequenceType = typeof ticket !== 'undefined' ? 'D' : 'C';
            const sequenceInfo = String(typeof ticket !== 'undefined' ? ticket : Sequence);
            feeTrx.InvoiceID = `${'0'.repeat(64)}EE000${networkId}AA${sequenceType}000${sequenceInfo}`.slice(-64);
        }

        // console.log(feeTrx);

        if (!signerInstance && method === AuthMethods.TANGEM) {
            return {
                signedTransaction: '',
                txJson: feeTrx,
            };
        }

        signedServiceFeeObject = AccountLib.sign(feeTrx, signerInstance, definitions) as SignedObjectType;

        // console.log(signedServiceFeeObject)

        // console.log('Vault overlay [servicefeeobject]', String(transaction.ServiceFee));
        signedServiceFeeObject = {
            ...signedServiceFeeObject,
            signerPubKey: signerInstance?.keypair?.publicKey ?? undefined,
            signMethod: method,
        };
    }

    return signedServiceFeeObject;
};

export { getServiceFeeTx };
