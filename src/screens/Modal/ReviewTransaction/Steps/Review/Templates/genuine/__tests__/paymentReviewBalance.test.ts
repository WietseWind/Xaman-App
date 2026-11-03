import { paymentReceivesAmount, showSpendableNextToSendMax } from '../paymentReviewBalance';

describe('payment review spendable balance', () => {
    it('keeps a direct payment balance next to Amount', () => {
        expect(paymentReceivesAmount()).toBe(false);
        expect(showSpendableNextToSendMax()).toBe(false);
    });

    it('puts a cross-currency balance next to Send Max', () => {
        const sendMax = { currency: 'RLUSD', issuer: 'rIssuer' };

        expect(paymentReceivesAmount(sendMax)).toBe(true);
        expect(showSpendableNextToSendMax(sendMax)).toBe(true);
    });

    it('leaves the balance on Amount when a path hides the Send Max row', () => {
        const sendMax = { currency: 'RLUSD' };

        expect(paymentReceivesAmount(sendMax)).toBe(true);
        expect(showSpendableNextToSendMax(sendMax, true)).toBe(false);
    });
});
