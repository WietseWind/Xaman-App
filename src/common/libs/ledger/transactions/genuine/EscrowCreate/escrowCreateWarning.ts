import { TransactionTypes } from '@common/libs/ledger/types/enums';

/**
 * An EscrowCreate with a condition and no CancelAfter can only be released by fulfilling
 * that condition. It can never be cancelled.
 */
export const escrowNeedsIrrevocableConditionWarning = (transaction: {
    Type?: string;
    Condition?: string;
    CancelAfter?: unknown;
}): boolean => {
    return (
        transaction.Type === TransactionTypes.EscrowCreate &&
        typeof transaction.Condition === 'string' &&
        transaction.Condition.length > 0 &&
        typeof transaction.CancelAfter === 'undefined'
    );
};
