import { readFileSync } from 'fs';
import { join } from 'path';

import { settleLedgerFetches, shouldIgnoreSourceChange } from '../settleLedgerFetches';

const payment = readFileSync(
    join(__dirname, '../Steps/Review/Templates/genuine/Payment.tsx'),
    'utf8',
);
const reviewModal = readFileSync(join(__dirname, '../ReviewTransactionModal.tsx'), 'utf8');

describe('review MPT fetch and source switch', () => {
    it('swallows a rejected ledger_entry so review can continue', async () => {
        await expect(settleLedgerFetches([Promise.reject(new Error('ledger_entry failed'))])).resolves.toEqual({
            ok: false,
        });
        expect(payment).toContain('await settleLedgerFetches([');
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
        expect(reviewModal).toContain('if (shouldIgnoreSourceChange(isLoading))');
    });
});
