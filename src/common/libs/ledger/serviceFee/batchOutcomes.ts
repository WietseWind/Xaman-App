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

const innerAccounts = (batch: any): string[] => {
    const raw = Array.isArray(batch?.RawTransactions) ? batch.RawTransactions : [];
    const accounts = new Set<string>();
    for (const entry of raw) {
        const account = (entry?.RawTransaction || entry)?.Account;
        if (typeof account === 'string' && account) {
            accounts.add(account);
        }
    }
    if (accounts.size === 0 && typeof batch?.Account === 'string' && batch.Account) {
        accounts.add(batch.Account);
    }
    return [...accounts];
};

/**
 * Inner results of a Batch, keyed by 1-based RawTransactions index.
 * Each inner account is read on its own, including a BatchSigners account.
 * Missing entries did not run.
 */
export const loadBatchInnerOutcomes = async (
    batch: any,
    batchHash: string,
    ledgerIndex?: number,
): Promise<Map<number, InnerOutcome>> => {
    const outcomes = new Map<number, InnerOutcome>();
    if (!batchHash) {
        return outcomes;
    }

    for (const account of innerAccounts(batch)) {
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

        let response: any;
        try {
            response = await NetworkService.send(request as any);
        } catch {
            continue;
        }
        if (!response || response.error) {
            continue;
        }

        const transactions = response.transactions || [];
        for (const entry of transactions) {
            if (parentBatchId(entry) !== batchHash) {
                continue;
            }
            const applied = entry?.tx || entry?.tx_json;
            const index = innerIndexForApplied(batch, applied);
            if (!index || outcomes.has(index)) {
                continue;
            }
            outcomes.set(index, outcomeFromEntry(entry, applied?.Account || account));
        }
    }

    return outcomes;
};
