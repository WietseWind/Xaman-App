import { shouldApplyAccountUpdate } from '../accountUpdateGuard';

describe('Home accountUpdate guard', () => {
    const updatedAccount = { isValid: () => true, address: 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY' };

    it('skips the update when no account is selected', () => {
        expect(shouldApplyAccountUpdate(updatedAccount, undefined)).toBe(false);
    });

    it('applies the update when the selected account is the one that changed', () => {
        expect(shouldApplyAccountUpdate(updatedAccount, { address: updatedAccount.address })).toBe(true);
    });

    it('skips an update for a different account', () => {
        expect(shouldApplyAccountUpdate(updatedAccount, { address: 'rOther' })).toBe(false);
    });
});
