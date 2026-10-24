/**
 * When a presigned service-fee Payment may be sent, and which sequence and
 * amount the app may sign. The quote amount itself does not change here.
 */

import BigNumber from 'bignumber.js';
import { parseBalanceChanges } from 'ripple-lib-transactionparser';

const TF_PARTIAL_PAYMENT = 0x00020000;

export interface TokenAmount {
    currency: string;
    issuer: string;
    value: string;
}

export type ConditionAmount = string | TokenAmount;

export interface MovedShare {
    minMovedShare: number;
    field: string;
    amount: ConditionAmount;
}

export interface SingleSubmitCondition extends MovedShare {}

export interface BatchInnerCondition extends MovedShare {
    index: number;
}

export interface BatchSubmitCondition {
    allRequiredInnerSucceeded: true;
    requiredInner: number[];
    inner?: BatchInnerCondition[];
}

export type ServiceFeeSubmitCondition = SingleSubmitCondition | BatchSubmitCondition;

export interface BalanceRow {
    currency: string;
    value: string;
    counterparty?: string;
}

export interface InnerOutcome {
    result: string;
    feeDrops: string;
    changes: BalanceRow[];
}

export const isBatchSubmitCondition = (
    condition: ServiceFeeSubmitCondition | undefined | null,
): condition is BatchSubmitCondition => {
    return !!condition && 'requiredInner' in condition;
};

const dropsOfXrp = (value: string): BigNumber => {
    return new BigNumber(value).times(1_000_000).integerValue(BigNumber.ROUND_HALF_UP);
};

/** A drops string, or an XRP amount object. Issued tokens return undefined. */
export const xrpDrops = (amount: unknown): BigNumber | undefined => {
    if (typeof amount === 'string' && /^\d+$/.test(amount)) {
        return new BigNumber(amount);
    }

    if (!amount || typeof amount !== 'object') {
        return undefined;
    }

    const shaped = amount as { currency?: string; issuer?: string; value?: string };
    if (shaped.issuer || !shaped.value) {
        return undefined;
    }
    if (shaped.currency && shaped.currency !== 'XRP') {
        return undefined;
    }

    const drops = dropsOfXrp(shaped.value);
    return drops.isFinite() ? drops : undefined;
};

const flagNumber = (flags: unknown): number => {
    if (typeof flags === 'number') {
        return flags;
    }
    if (flags && typeof flags === 'object' && (flags as { tfPartialPayment?: boolean }).tfPartialPayment) {
        return TF_PARTIAL_PAYMENT;
    }
    return 0;
};

const sameAccount = (left: unknown, right: unknown): boolean => {
    return typeof left === 'string' && typeof right === 'string' && left === right;
};

/**
 * XRP the trade is expected to deliver to the signer, in drops.
 * Anything outside the four audited shapes brings in nothing for the cap.
 */
export const incomingXrpDrops = (tx: any): BigNumber => {
    if (!tx) {
        return new BigNumber(0);
    }

    if (tx.TransactionType === 'Payment' && sameAccount(tx.Account, tx.Destination)) {
        const deliverMin = xrpDrops(tx.DeliverMin);
        if (deliverMin) {
            return deliverMin;
        }
        if ((flagNumber(tx.Flags) & TF_PARTIAL_PAYMENT) === 0) {
            return xrpDrops(tx.Amount) || new BigNumber(0);
        }
        return new BigNumber(0);
    }

    if (tx.TransactionType === 'OfferCreate') {
        return xrpDrops(tx.TakerPays) || new BigNumber(0);
    }

    if (tx.TransactionType === 'AMMWithdraw' && xrpDrops(tx.Amount) && tx.Amount2 == null) {
        return xrpDrops(tx.Amount) as BigNumber;
    }

    return new BigNumber(0);
};

/**
 * Cap a quoted fee to spendable XRP before the trade, plus XRP the trade brings in,
 * minus the existing 100-drop margin. A plain XRP send is not capped here.
 */
export const cappedServiceFeeDrops = (
    quotedDrops: number,
    spendableBeforeDrops: number,
    incomingDrops: number,
): number => {
    const quoted = new BigNumber(quotedDrops).integerValue(BigNumber.ROUND_FLOOR);
    const room = new BigNumber(spendableBeforeDrops)
        .integerValue(BigNumber.ROUND_FLOOR)
        .minus(100)
        .plus(new BigNumber(incomingDrops).integerValue(BigNumber.ROUND_FLOOR));
    const capped = BigNumber.minimum(quoted.isPositive() ? quoted : 0, room.isPositive() ? room : 0);
    return capped.integerValue(BigNumber.ROUND_FLOOR).toNumber();
};

const xrpChangeDrops = (changes: BalanceRow[]): BigNumber => {
    return changes
        .filter((row) => row.currency === 'XRP' && !row.counterparty)
        .reduce((sum, row) => sum.plus(dropsOfXrp(row.value)), new BigNumber(0));
};

/** A token change, or an XRP change that is not exactly the network fee. */
export const valueMoved = (changes: BalanceRow[], feeDrops: string): boolean => {
    const tokenMoved = changes.some((row) => row.currency !== 'XRP' && !new BigNumber(row.value || 0).isZero());
    if (tokenMoved) {
        return true;
    }

    const fee = new BigNumber(feeDrops || 0);
    return !xrpChangeDrops(changes).plus(fee).isZero();
};

export const shareMoved = (changes: BalanceRow[], feeDrops: string, condition: MovedShare): boolean => {
    const share = new BigNumber(condition.minMovedShare);
    if (typeof condition.amount === 'string') {
        const moved = xrpChangeDrops(changes)
            .plus(feeDrops || 0)
            .abs();
        return moved.isGreaterThanOrEqualTo(new BigNumber(condition.amount).times(share));
    }

    const { currency, issuer, value } = condition.amount;
    const moved = changes
        .filter((row) => row.currency === currency && row.counterparty === issuer)
        .reduce((sum, row) => sum.plus(row.value || 0), new BigNumber(0))
        .abs();
    return moved.isGreaterThanOrEqualTo(new BigNumber(value).times(share));
};

export const changesForAccount = (meta: any, account: string): BalanceRow[] => {
    if (!meta || !account) {
        return [];
    }

    try {
        const parsed = parseBalanceChanges(meta) as Record<string, BalanceRow[]>;
        return parsed?.[account] || [];
    } catch {
        return [];
    }
};

export interface SingleFeeInput {
    result?: string;
    changes: BalanceRow[];
    feeDrops: string;
    submitCondition?: ServiceFeeSubmitCondition | null;
}

/** Rules 2a, 2b, and 2c. No batch condition: 2a and 2b only. */
export const shouldSubmitSingleFee = ({ result, changes, feeDrops, submitCondition }: SingleFeeInput): boolean => {
    if (result !== 'tesSUCCESS') {
        return false;
    }
    if (!valueMoved(changes, feeDrops)) {
        return false;
    }
    if (submitCondition && !isBatchSubmitCondition(submitCondition)) {
        return shareMoved(changes, feeDrops, submitCondition);
    }
    return true;
};

export const shouldSubmitBatchFee = (
    condition: BatchSubmitCondition,
    inners: Map<number, InnerOutcome | undefined>,
): boolean => {
    if (!condition.requiredInner?.length) {
        return false;
    }

    for (const index of condition.requiredInner) {
        const inner = inners.get(index);
        if (inner?.result !== 'tesSUCCESS') {
            return false;
        }
    }

    for (const rule of condition.inner || []) {
        const inner = inners.get(rule.index);
        if (!inner || !shareMoved(inner.changes, inner.feeDrops, rule)) {
            return false;
        }
    }

    return true;
};

const innerBody = (entry: any): any => entry?.RawTransaction || entry;

/**
 * Next sequence after a real sequence. Sequence 0 means a ticket: the caller
 * must read the account sequence instead of signing the fee at sequence 1.
 */
const ownSequence = (tx: any): number | undefined =>
    typeof tx?.Sequence === 'number' && tx.Sequence > 0 ? tx.Sequence + 1 : undefined;

/**
 * Sequence of the service-fee Payment.
 * Batch: one past the highest sequence that account consumes in the outer
 * transaction and its own inner transactions. Tickets are not counted.
 */
export const serviceFeeSequence = (tx: any): number | undefined => {
    if (tx?.TransactionType !== 'Batch') {
        return ownSequence(tx);
    }

    let highest: number | undefined;
    const raw = Array.isArray(tx.RawTransactions) ? tx.RawTransactions : [];
    for (const entry of raw) {
        const inner = innerBody(entry);
        if (!sameAccount(inner?.Account, tx.Account)) {
            continue;
        }
        if (inner?.TicketSequence) {
            continue;
        }
        const sequence = Number(inner?.Sequence);
        if (!Number.isFinite(sequence) || sequence <= 0) {
            continue;
        }
        if (highest === undefined || sequence > highest) {
            highest = sequence;
        }
    }

    return highest !== undefined ? highest + 1 : ownSequence(tx);
};

export const serviceFeeLastLedgerSequence = (tx: any): number | undefined => {
    const last = Number(tx?.LastLedgerSequence);
    if (!Number.isFinite(last) || last <= 0) {
        return undefined;
    }
    return last + 20;
};

/** 1-based RawTransactions index of an applied inner transaction, when it belongs to this batch. */
export const innerIndexForApplied = (batch: any, applied: any): number | undefined => {
    const raw = Array.isArray(batch?.RawTransactions) ? batch.RawTransactions : [];
    for (let index = 0; index < raw.length; index++) {
        const inner = innerBody(raw[index]);
        if (!inner || !sameAccount(applied?.Account, inner.Account)) {
            continue;
        }
        if (inner.TicketSequence && String(applied?.TicketSequence) === String(inner.TicketSequence)) {
            return index + 1;
        }
        if (Number(inner.Sequence) > 0 && String(applied?.Sequence) === String(inner.Sequence)) {
            return index + 1;
        }
    }
    return undefined;
};

export const parentBatchId = (entry: any): string | undefined => {
    return (
        entry?.meta?.ParentBatchID ||
        entry?.metaData?.ParentBatchID ||
        entry?.tx?.ParentBatchID ||
        entry?.tx_json?.ParentBatchID ||
        undefined
    );
};
