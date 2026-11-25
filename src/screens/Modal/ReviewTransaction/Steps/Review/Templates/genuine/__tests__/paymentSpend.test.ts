import { canAdjustNativeAmount, xrpLeavingDrops, NativeSpendInput } from '../paymentSpend';

const native = 'XRP';

const plain = (over: Partial<NativeSpendInput> = {}): NativeSpendInput => ({
    transactionType: 'Payment',
    nativeAsset: native,
    amount: { currency: 'XRP', value: '10' },
    account: 'rSender',
    destination: 'rDest',
    ...over,
});

describe('payment review native spend', () => {
    it('counts Amount for a plain XRP payment and allows shrinking it', () => {
        const input = plain();

        expect(xrpLeavingDrops(input)).toBe(10_000_000);
        expect(canAdjustNativeAmount(input)).toBe(true);
    });

    it('does not count incoming XRP on an RLUSD swap and does not rewrite Amount', () => {
        const input = plain({
            amount: { currency: 'XRP', value: '630.418064' },
            sendMax: { currency: 'RLUSD', value: '917.623456429008' },
            deliverMin: { currency: 'XRP', value: '627.265973' },
            paths: [[{ currency: 'BTC' }]],
            partialPayment: true,
            account: 'rSelf',
            destination: 'rSelf',
        });

        expect(xrpLeavingDrops(input)).toBe(0);
        expect(canAdjustNativeAmount(input)).toBe(false);
    });

    it('counts SendMax when the spent asset is XRP', () => {
        const input = plain({
            amount: { currency: 'USD', value: '100' },
            sendMax: { currency: 'XRP', value: '40' },
        });

        expect(xrpLeavingDrops(input)).toBe(40_000_000);
        expect(canAdjustNativeAmount(input)).toBe(false);
    });

    it('refuses to rewrite Amount when the payment is partial or pathed', () => {
        expect(canAdjustNativeAmount(plain({ partialPayment: true }))).toBe(false);
        expect(canAdjustNativeAmount(plain({ paths: [[{ currency: 'BTC' }]] }))).toBe(false);
        expect(canAdjustNativeAmount(plain({ deliverMin: { currency: 'XRP', value: '1' } }))).toBe(false);
        expect(canAdjustNativeAmount(plain({ account: 'rSelf', destination: 'rSelf' }))).toBe(false);
    });
});
