import { hasOwnEffect } from '../thirdParty';

const ME = 'rMe';
const item = (overrides: Record<string, unknown> = {}, changes: { INC?: any[]; DEC?: any[] } = {}) => ({
    Account: 'rSomeoneElse',
    BalanceChange: () => ({ INC: changes.INC || [], DEC: changes.DEC || [] }),
    ...overrides,
});
const change = { value: '1', currency: 'XRP' };

describe('hasOwnEffect', () => {
    it('is true when the balance of the account changed', () => {
        expect(hasOwnEffect(item({}, { INC: [change] }), ME)).toBe(true);
        expect(hasOwnEffect(item({}, { DEC: [change] }), ME)).toBe(true);
    });

    it('is true for a transaction sent by the account, without a balance change', () => {
        expect(hasOwnEffect(item({ Account: ME }), ME)).toBe(true);
    });

    it('is true for the issuer of a credential and the holder of a clawback', () => {
        expect(hasOwnEffect(item({ Issuer: ME }), ME)).toBe(true);
        expect(hasOwnEffect(item({ Holder: ME }), ME)).toBe(true);
    });

    it('is false for a transaction of another account that did not change the balance', () => {
        expect(hasOwnEffect(item(), ME)).toBe(false);
        expect(hasOwnEffect(item({ Destination: ME }), ME)).toBe(false);
        expect(hasOwnEffect(item(), ME, false)).toBe(false);
    });

    it('is true when the row is shown despite being a third party transaction', () => {
        expect(hasOwnEffect(item(), ME, true)).toBe(true);
    });

    it('asks for the balance change of the account the row is shown for', () => {
        const BalanceChange = jest.fn(() => ({ INC: [], DEC: [] }));
        hasOwnEffect({ Account: 'rSomeoneElse', BalanceChange }, ME);
        expect(BalanceChange).toHaveBeenCalledWith(ME);
    });
});
