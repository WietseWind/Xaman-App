/**
 * Whether an event should be looked up as spam/scam and suppressed when
 * Settings → Hide Spam/Scam events is on.
 *
 * Dimmed (half transparent) rows are a separate UI path: blocked sender and
 * the setting off. This helper only decides client-side hide.
 */
import { TransactionTypes } from '@common/libs/ledger/types/enums';

type TxSlice = {
    TransactionType?: string;
    Account?: string;
    Destination?: string;
};

const INCOMING_CREATE_TYPES: string[] = [
    TransactionTypes.Payment,
    TransactionTypes.CheckCreate,
    TransactionTypes.EscrowCreate,
];

const THIRD_PARTY_LIFECYCLE_TYPES: string[] = [
    TransactionTypes.CheckCancel,
    TransactionTypes.EscrowCancel,
    TransactionTypes.EscrowFinish,
];

export const shouldLookupAdvisorySender = (
    tx: TxSlice | undefined,
    myAddress: string,
    isMyAccountThroughRegularKey: boolean,
): boolean => {
    if (!tx?.Account || tx.Account === myAddress) {
        return false;
    }

    const type = tx.TransactionType;

    if (INCOMING_CREATE_TYPES.includes(String(type))) {
        return tx.Destination === myAddress || isMyAccountThroughRegularKey;
    }

    if (THIRD_PARTY_LIFECYCLE_TYPES.includes(String(type))) {
        return true;
    }

    return false;
};
