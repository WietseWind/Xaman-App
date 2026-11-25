/**
 * What a Remit pays for at the destination, besides what it sends.
 *
 * The sender of a Remit (Xahau) pays the reserve for everything the Remit makes for the
 * destination: the account itself when it does not exist yet, a trust line for every issued
 * amount the destination has no trust line for, and every URIToken it transfers or mints.
 *
 * `assumed` is the answer before the ledger was asked, and the answer when the ledger did not
 * say: everything that can cost a reserve counts. The caution is then too wide, never too narrow.
 * Every question to the ledger ends: a request that gets no answer is an error after the time-out
 * of the network service, and an error is "not known", never a crash.
 */
import BigNumber from 'bignumber.js';

import LedgerService from '@services/LedgerService';

import { Remit } from '@common/libs/ledger/transactions';

export interface RemitCosts {
    /** the destination account does not exist: the Remit activates it */
    activation: boolean;
    /** trust lines the Remit creates for the destination */
    trustLines: number;
    /** URITokens the Remit transfers to or mints for the destination */
    uriTokens: number;
}

export const remitCostsAny = (costs: RemitCosts): boolean =>
    costs.activation || costs.trustLines > 0 || costs.uriTokens > 0;

const issuedAmounts = (transaction: Remit) => (transaction.Amounts || []).filter((amount) => !!amount.issuer);

const uriTokenCount = (transaction: Remit) =>
    (transaction.URITokenIDs || []).length + (transaction.MintURIToken ? 1 : 0);

/** Without the ledger: every part that can cost a reserve. */
export const assumedRemitCosts = (transaction: Remit): RemitCosts => ({
    activation: true,
    trustLines: issuedAmounts(transaction).length,
    uriTokens: uriTokenCount(transaction),
});

const errorOf = (response: unknown): string | undefined =>
    response && typeof response === 'object' && 'error' in response
        ? String((response as { error: unknown }).error)
        : undefined;

export interface RemitCostsAnswer {
    costs: RemitCosts;
    /** the ledger answered every question; false: a part of `costs` is assumed, so it is "at most" */
    known: boolean;
}

/** With the ledger. A question the ledger did not answer keeps its assumed answer. */
export const remitCosts = async (transaction: Remit): Promise<RemitCostsAnswer> => {
    const costs = assumedRemitCosts(transaction);
    const destination = transaction.Destination;
    if (!destination) return { costs, known: false };

    let exists: boolean | undefined;
    try {
        const info = await LedgerService.getAccountInfo(destination);
        const error = errorOf(info);
        if (!error) exists = true;
        else if (error === 'actNotFound') exists = false;
    } catch {
        // not known
    }

    // an account that does not exist has no trust lines: all of them are made
    if (exists !== true) return { costs, known: exists === false };
    costs.activation = false;

    const lines = await Promise.all(
        issuedAmounts(transaction).map(async (amount) => {
            // back to its issuer: there is no trust line to find, and the ledger takes the reserve
            if (amount.issuer === destination) return { count: 1, known: true };
            try {
                const entry = await LedgerService.getLedgerEntry({
                    ripple_state: { accounts: [destination, amount.issuer], currency: amount.currency },
                });
                const error = errorOf(entry);
                if (!error) return { count: 0, known: true };
                // any other error: not known, so it counts
                return { count: 1, known: error === 'entryNotFound' };
            } catch {
                return { count: 1, known: false };
            }
        }),
    );
    costs.trustLines = lines.reduce<number>((sum, line) => sum + line.count, 0);

    return { costs, known: lines.every((line) => line.known) };
};

/* What it costs ==================================================================== */
export interface RemitCostLine {
    kind: 'activation' | 'trustLines' | 'uriTokens';
    /** how many accounts, trust lines or URITokens */
    count: number;
    /** in the native asset, with the same number of decimals on every line */
    amount: string;
}

/**
 * The reserve the Remit sends along for each part, and the total, in the native asset.
 * The account reserve is for the activation; every trust line and every URIToken is one object.
 *
 * All amounts get the number of decimals of the one with the most ("1" next to "0.2" is "1.0"),
 * so they line up under each other.
 */
export const remitCostAmounts = (
    costs: RemitCosts,
    reserve: { BaseReserve: number; OwnerReserve: number } | undefined,
): { total: string; lines: RemitCostLine[] } | undefined => {
    // the reserves of the network are not known: no amounts (the caution then names the parts only)
    if (!reserve || !Number.isFinite(reserve.BaseReserve) || !Number.isFinite(reserve.OwnerReserve)) {
        return undefined;
    }

    const perObject = new BigNumber(reserve.OwnerReserve);
    const parts = [
        { kind: 'activation' as const, count: costs.activation ? 1 : 0, value: new BigNumber(reserve.BaseReserve) },
        { kind: 'trustLines' as const, count: costs.trustLines, value: perObject.times(costs.trustLines) },
        { kind: 'uriTokens' as const, count: costs.uriTokens, value: perObject.times(costs.uriTokens) },
    ].filter((part) => part.count > 0);

    const total = parts.reduce((sum, part) => sum.plus(part.value), new BigNumber(0));
    const values = [total, ...parts.map((part) => part.value)];
    const decimals = Math.max(0, ...values.map((value) => value.decimalPlaces() ?? 0));

    return {
        total: total.toFixed(decimals),
        lines: parts.map((part) => ({ kind: part.kind, count: part.count, amount: part.value.toFixed(decimals) })),
    };
};
