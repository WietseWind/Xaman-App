import { TransactionTypes } from '@common/libs/ledger/types/enums';

import { escrowNeedsIrrevocableConditionWarning } from '../EscrowCreate/escrowCreateWarning';

describe('escrowNeedsIrrevocableConditionWarning', () => {
    const condition = 'A0258020';

    it('warns when a condition is set and the escrow cannot be cancelled', () => {
        expect(
            escrowNeedsIrrevocableConditionWarning({
                Type: TransactionTypes.EscrowCreate,
                Condition: condition,
                FinishAfter: '2026-01-01T00:00:00.000Z',
            }),
        ).toBe(true);
    });

    it('does not warn when the escrow can be cancelled', () => {
        expect(
            escrowNeedsIrrevocableConditionWarning({
                Type: TransactionTypes.EscrowCreate,
                Condition: condition,
                CancelAfter: '2026-01-01T00:00:00.000Z',
            }),
        ).toBe(false);
    });

    it('does not warn when there is no condition', () => {
        expect(
            escrowNeedsIrrevocableConditionWarning({
                Type: TransactionTypes.EscrowCreate,
                FinishAfter: '2026-01-01T00:00:00.000Z',
            }),
        ).toBe(false);
    });

    it('does not warn for other transaction types', () => {
        expect(
            escrowNeedsIrrevocableConditionWarning({
                Type: TransactionTypes.Payment,
                Condition: condition,
            }),
        ).toBe(false);
    });
});
