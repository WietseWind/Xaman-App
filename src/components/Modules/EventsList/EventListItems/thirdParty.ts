import { OperationActions } from '@common/libs/ledger/parser/types';

/**
 * Does a transaction row belong to the account it is shown for?
 *
 * A transaction that did not change the account's balance and is not the account's own (sender, credential issuer,
 * clawback holder) is a third party transaction: the row shows the transaction type without an amount.
 * `showDespiteThirdParty` shows the full row anyway.
 */
export const hasOwnEffect = (item: any, address: string, showDespiteThirdParty?: boolean): boolean => {
    const mutations = item.BalanceChange(address);

    if (mutations?.[OperationActions.INC]?.[0] || mutations?.[OperationActions.DEC]?.[0]) {
        return true;
    }

    return !(
        (
            !showDespiteThirdParty &&
            item?.Account !== address &&
            item?.Issuer !== address && // credential
            item?.Holder !== address
        ) // clawback
    );
};
