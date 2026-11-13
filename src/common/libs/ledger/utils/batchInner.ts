import BigNumber from 'bignumber.js';

import { BalanceChangeType, OperationActions } from '@common/libs/ledger/parser/types';
import { BalanceChanges, MutationsMixinType } from '@common/libs/ledger/mixin/types';

/* Types ==================================================================== */
// An inner transaction of a Batch, as looked up in the ledger.
export interface BatchInnerTransaction {
    transaction: { BalanceChange: MutationsMixinType['BalanceChange'] };
    hash: string;
    index: number;
    // false: the ledger does not have this inner transaction (it failed or was never tried)
    found: boolean;
    // the Batch that executed it; another Batch, or none, means it did not run as part of this one
    parentBatchId?: string;
}

/* Helpers ==================================================================== */
const assetKey = (change: BalanceChangeType) =>
    [change.currency, change.issuer ?? '', change.mpt_issuance_id ?? ''].join('|');

/**
 * Did this inner transaction run as part of the Batch with this hash?
 */
export const ranInBatch = (inner: BatchInnerTransaction, batchHash?: string): boolean =>
    !!batchHash && inner?.found === true && inner?.parentBatchId === batchHash;

/**
 * Net balance changes per asset: what came in minus what went out.
 */
export const netBalanceChanges = (changes: BalanceChanges[]): BalanceChanges => {
    const totals = new Map<string, { asset: BalanceChangeType; net: BigNumber }>();

    changes.forEach((change) => {
        [OperationActions.INC, OperationActions.DEC].forEach((action) => {
            (change?.[action] || []).forEach((entry) => {
                const value = new BigNumber(entry?.value);
                if (!value.isFinite()) {
                    return;
                }
                const key = assetKey(entry);
                const total = totals.get(key) || { asset: entry, net: new BigNumber(0) };
                // a value is an amount without direction: the action is the direction
                const amount = value.absoluteValue();
                total.net = action === OperationActions.INC ? total.net.plus(amount) : total.net.minus(amount);
                totals.set(key, total);
            });
        });
    });

    const net: BalanceChanges = { [OperationActions.INC]: [], [OperationActions.DEC]: [] };

    totals.forEach(({ asset, net: value }) => {
        if (value.isZero()) {
            return;
        }
        const action = value.isPositive() ? OperationActions.INC : OperationActions.DEC;
        net[action].push({ ...asset, action, value: value.absoluteValue().toString(10) });
    });

    return net;
};

/**
 * What the inner transactions that ran in this Batch did to the balance of `owner`.
 * Inner transactions that failed, were not tried or ran outside this Batch are left out.
 */
export const batchInnerBalanceChange = (
    inner: BatchInnerTransaction[] | undefined,
    batchHash: string | undefined,
    owner: string,
): BalanceChanges =>
    netBalanceChanges(
        (inner || [])
            .filter((entry) => ranInBatch(entry, batchHash))
            .map((entry) => entry.transaction.BalanceChange(owner)),
    );
