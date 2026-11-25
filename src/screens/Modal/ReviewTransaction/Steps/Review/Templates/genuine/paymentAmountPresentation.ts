import BigNumber from 'bignumber.js';
import type { Payment } from '@common/libs/ledger/transactions';

type PaymentAmounts = Pick<Payment, 'Flags' | 'Amount' | 'SendMax' | 'DeliverMin'>;

const currencyKey = (currency: string): string =>
    /^[A-Fa-f0-9]{40}$/.test(currency) ? currency.toUpperCase() : currency;

/** A display-only choice: never substitute DeliverMin for the signed Amount. */
export const showMinimumReceiveFirst = (transaction: PaymentAmounts): boolean => {
    const { Flags: flags, Amount: amount, SendMax: sendMax, DeliverMin: minimum } = transaction;
    if (flags?.tfPartialPayment !== true || !amount || !sendMax || !minimum) return false;
    if (amount.mpt_issuance_id || minimum.mpt_issuance_id || sendMax.mpt_issuance_id) return false;
    if (!amount.currency || !minimum.currency || !sendMax.currency) return false;
    if (currencyKey(amount.currency) !== currencyKey(minimum.currency) || amount.issuer !== minimum.issuer) {
        return false;
    }

    const maximumValue = new BigNumber(amount.value);
    const minimumValue = new BigNumber(minimum.value);
    const sendValue = new BigNumber(sendMax.value);
    return maximumValue.isFinite() && minimumValue.isFinite() && sendValue.isFinite() &&
        minimumValue.gt(0) && sendValue.gt(0) && maximumValue.gt(minimumValue.times(2));
};
