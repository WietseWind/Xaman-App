import NetworkService from '@services/NetworkService';

import { loadBatchInnerOutcomes } from '../batchOutcomes';

jest.mock('@services/NetworkService', () => ({
    __esModule: true,
    default: { send: jest.fn() },
}));

const send = NetworkService.send as jest.Mock;

const accountRoot = (account: string, previous: string, final: string) => ({
    AffectedNodes: [
        {
            ModifiedNode: {
                LedgerEntryType: 'AccountRoot',
                FinalFields: { Account: account, Balance: final },
                PreviousFields: { Balance: previous },
            },
        },
    ],
});

describe('batch inner outcomes', () => {
    beforeEach(() => {
        send.mockReset();
    });

    it('reads another account’s inner transaction on that account', async () => {
        const outer = 'rOuter';
        const other = 'rOtherAccount111111111111111';
        send.mockImplementation(async (request: { account: string }) => {
            if (request.account !== other) {
                return { transactions: [] };
            }
            return {
                transactions: [
                    {
                        tx: {
                            Account: other,
                            Sequence: 8,
                            Fee: '0',
                            ParentBatchID: 'BATCH',
                        },
                        meta: {
                            ParentBatchID: 'BATCH',
                            TransactionResult: 'tesSUCCESS',
                            ...accountRoot(other, '1000000', '500000'),
                        },
                    },
                ],
            };
        });

        const outcomes = await loadBatchInnerOutcomes(
            {
                Account: outer,
                RawTransactions: [{ RawTransaction: { Account: other, Sequence: 8, TransactionType: 'Payment' } }],
            },
            'BATCH',
            10,
        );

        expect(send).toHaveBeenCalledWith(expect.objectContaining({ command: 'account_tx', account: other }));
        expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ account: outer }));
        expect(outcomes.get(1)?.result).toBe('tesSUCCESS');
        expect(outcomes.get(1)?.changes).toEqual([expect.objectContaining({ currency: 'XRP', value: '-0.5' })]);
    });
});
