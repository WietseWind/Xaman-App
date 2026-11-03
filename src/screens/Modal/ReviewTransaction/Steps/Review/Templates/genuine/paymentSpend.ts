/**
 * Which native amount a payment review may treat as XRP leaving the account.
 * A cross-currency swap delivers XRP in Amount and spends the other asset in SendMax.
 */
export type NativeSpendInput = {
    transactionType?: string;
    nativeAsset: string;
    amount?: { currency?: string; value?: string };
    sendMax?: { currency?: string; value?: string };
    deliverMin?: unknown;
    paths?: unknown;
    partialPayment?: boolean;
    account?: string;
    destination?: string;
};

const dropsFromNativeValue = (value?: string): number => {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
        return 0;
    }
    return Math.ceil(amount * 1_000_000);
};

export const xrpLeavingDrops = (input: NativeSpendInput): number => {
    const { nativeAsset, amount, sendMax } = input;

    if (sendMax?.currency === nativeAsset) {
        return dropsFromNativeValue(sendMax.value);
    }

    if (!sendMax?.currency && amount?.currency === nativeAsset) {
        return dropsFromNativeValue(amount.value);
    }

    return 0;
};

/**
 * The review may shrink Amount only for a plain XRP payment.
 * A swap, a path, a partial payment, or a payment to yourself must keep Amount.
 */
export const canAdjustNativeAmount = (input: NativeSpendInput): boolean => {
    if (input.transactionType !== 'Payment') {
        return false;
    }
    if (input.amount?.currency !== input.nativeAsset) {
        return false;
    }
    if (input.sendMax?.currency) {
        return false;
    }
    if (input.deliverMin) {
        return false;
    }
    if (Array.isArray(input.paths) && input.paths.length > 0) {
        return false;
    }
    if (input.partialPayment) {
        return false;
    }
    if (input.account && input.destination && input.account === input.destination) {
        return false;
    }

    return true;
};

export const nativeSpendFromTransaction = (transaction: any, nativeAsset: string): NativeSpendInput => {
    const account = typeof transaction?.Account === 'string' ? transaction.Account : transaction?.Account?.address;
    const destination =
        typeof transaction?.Destination === 'string' ? transaction.Destination : transaction?.Destination?.address;

    return {
        transactionType: transaction?.TransactionType,
        nativeAsset,
        amount: transaction?.Amount,
        sendMax: transaction?.SendMax,
        deliverMin: transaction?.DeliverMin,
        paths: transaction?.Paths,
        partialPayment: Boolean(transaction?.Flags?.tfPartialPayment),
        account,
        destination,
    };
};
