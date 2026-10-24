import NetworkService from '@services/NetworkService';

import { changesForAccount, innerIndexForApplied, InnerOutcome, parentBatchId } from './rules';

const outcomeFromEntry = (entry: any, account: string): InnerOutcome => {
    const tx = entry?.tx || entry?.tx_json || {};
    const meta = entry?.meta || entry?.metaData || {};
    return {
        result: meta.TransactionResult || tx.meta?.TransactionResult || '',
        feeDrops: String(tx.Fee || '0'),
        changes: changesForAccount(meta, account),
    };
};

/**
 * Inner results of a Batch, keyed by 1-based RawTransactions index.
 * Missing entries did not run.
 */
export const loadBatchInnerOutcomes = async (
    batch: any,
    batchHash: string,
    ledgerIndex?: number,
): Promise<Map<number, InnerOutcome>> => {
    const outcomes = new Map<number, InnerOutcome>();
    const account = batch?.Account;
    if (!account || !batchHash) {
        return outcomes;
    }

    const request: Record<string, unknown> = {
        command: 'account_tx',
        account,
        limit: 200,
        binary: false,
    };
    if (typeof ledgerIndex === 'number' && ledgerIndex > 0) {
        request.ledger_index_min = ledgerIndex;
        request.ledger_index_max = ledgerIndex;
    }

    const response = await NetworkService.send(request as any);
    if (!response || 'error' in response) {
        return outcomes;
    }

    const transactions = (response as { transactions?: any[] }).transactions || [];
    for (const entry of transactions) {
        if (parentBatchId(entry) !== batchHash) {
            continue;
        }
        const applied = entry?.tx || entry?.tx_json;
        const index = innerIndexForApplied(batch, applied);
        if (!index || outcomes.has(index)) {
            continue;
        }
        outcomes.set(index, outcomeFromEntry(entry, account));
    }

    return outcomes;
};
