import { settleLedgerFetches, shouldIgnoreSourceChange } from '../settleLedgerFetches';

describe('review MPT fetch and source switch', () => {
    it('swallows a rejected ledger_entry so review can continue', async () => {
        await expect(settleLedgerFetches([Promise.reject(new Error('ledger_entry failed'))])).resolves.toEqual({
            ok: false,
        });
    });

    it('returns the ledger entries when every fetch succeeds', async () => {
        await expect(settleLedgerFetches([Promise.resolve({ node: { id: 1 } })])).resolves.toEqual({
            ok: true,
            values: [{ node: { id: 1 } }],
        });
    });

    it('ignores account picker changes while signing is already in flight', () => {
        expect(shouldIgnoreSourceChange(true)).toBe(true);
        expect(shouldIgnoreSourceChange(false)).toBe(false);
    });
});
