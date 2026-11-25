import { describeDelegatePermission } from '../delegatePermission';

const transactionTypes = {
    Payment: 0,
    EscrowCreate: 1,
    EscrowFinish: 2,
    AccountSet: 3,
    EscrowCancel: 4,
    NFTokenMint: 25,
};

describe('describeDelegatePermission', () => {
    it('warns for a transaction name that is not on the trusted list', () => {
        expect(describeDelegatePermission('Payment', transactionTypes)).toEqual({
            label: 'Payment',
            dangerous: true,
        });
    });

    it('does not warn for a trusted transaction name', () => {
        expect(describeDelegatePermission('EscrowFinish', transactionTypes)).toEqual({
            label: 'EscrowFinish',
            dangerous: false,
        });
    });

    it('maps a numeric permission to transaction type plus one, not the raw type code', () => {
        // Permission 1 is Payment (type 0), not EscrowCreate (type 1).
        expect(describeDelegatePermission(1, transactionTypes)).toEqual({
            label: 'Payment',
            dangerous: true,
        });
        // Permission 2 is EscrowCreate. The old check treated 2 as trusted EscrowFinish.
        expect(describeDelegatePermission(2, transactionTypes)).toEqual({
            label: 'EscrowCreate',
            dangerous: true,
        });
        expect(describeDelegatePermission(3, transactionTypes)).toEqual({
            label: 'EscrowFinish',
            dangerous: false,
        });
    });

    it('accepts the numeric permission as a decimal string', () => {
        expect(describeDelegatePermission('1', transactionTypes)).toEqual({
            label: 'Payment',
            dangerous: true,
        });
    });

    it('names granular permissions without the transaction warning', () => {
        expect(describeDelegatePermission('TrustlineAuthorize', transactionTypes)).toEqual({
            label: 'TrustlineAuthorize',
            dangerous: false,
        });
        expect(describeDelegatePermission(65537, transactionTypes)).toEqual({
            label: 'TrustlineAuthorize',
            dangerous: false,
        });
        expect(describeDelegatePermission(65546, transactionTypes)).toEqual({
            label: 'PaymentBurn',
            dangerous: false,
        });
    });

    it('leaves unknown values unchanged and unwarned', () => {
        expect(describeDelegatePermission('NotAPermission', transactionTypes)).toEqual({
            label: 'NotAPermission',
            dangerous: false,
        });
        expect(describeDelegatePermission(0, transactionTypes)).toEqual({
            label: '0',
            dangerous: false,
        });
        expect(describeDelegatePermission(99999, transactionTypes)).toEqual({
            label: '99999',
            dangerous: false,
        });
    });
});
