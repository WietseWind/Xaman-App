import { resolveScamSignRequest, ScamSignRequestLookup } from '../scamRejectAction';

const lookup = (): ScamSignRequestLookup => ({
    getLedgerEntry: jest.fn(async (id) => ({
        node: {
            Owner: id === 'BUY' || id === 'CHECK' ? 'rFlagged' : 'rClean',
            Account: 'rFlagged',
            Destination: 'rSelf',
        },
    })),
    getNFTDetails: jest.fn(async () => ({})),
    getAccountAdvisory: jest.fn(async (address) => ({ danger: address === 'rFlagged' ? 'CONFIRMED' : 'NONE' })),
    getAccountName: jest.fn(async () => ({})),
});

describe('audit scam counterparties', () => {
    it.each([false, true])('checks a Batch Payment with wrapped=%s', async (wrapped) => {
        const entry = { TransactionType: 'Payment', Account: 'rSelf', Destination: 'rFlagged' };
        const api = lookup();
        const result = await resolveScamSignRequest(
            {
                TransactionType: 'Batch',
                Account: 'rSelf',
                RawTransactions: [wrapped ? { RawTransaction: entry } : entry],
            },
            'rSelf',
            false,
            api,
        );
        expect(api.getAccountAdvisory).toHaveBeenCalledWith('rFlagged');
        expect(result.isScam).toBe(true);
        expect(result.cancelCraft).toBeUndefined();
    });

    it('checks referenced Check objects inside a Batch', async () => {
        const api = lookup();
        const result = await resolveScamSignRequest(
            {
                TransactionType: 'Batch',
                Account: 'rSelf',
                RawTransactions: [{ TransactionType: 'CheckCash', CheckID: 'CHECK' }],
            },
            'rSelf',
            false,
            api,
        );
        expect(api.getLedgerEntry).toHaveBeenCalledWith('CHECK');
        expect(result.isScam).toBe(true);
    });

    it('checks both brokered offers and cancels only offers this signer can cancel', async () => {
        const api = lookup();
        (api.getLedgerEntry as jest.Mock).mockImplementation(async (id) => ({
            node: { Owner: id === 'BUY' ? 'rFlagged' : 'rClean', Destination: id === 'BUY' ? 'rSelf' : 'rOther' },
        }));
        const result = await resolveScamSignRequest(
            {
                TransactionType: 'NFTokenAcceptOffer',
                NFTokenSellOffer: 'SELL',
                NFTokenBuyOffer: 'BUY',
            },
            'rSelf',
            false,
            api,
        );
        expect(api.getLedgerEntry).toHaveBeenCalledWith('SELL');
        expect(api.getLedgerEntry).toHaveBeenCalledWith('BUY');
        expect(result.isScam).toBe(true);
        expect(result.cancelCraft?.txJson.NFTokenOffers).toEqual(['BUY']);
    });
});

it('continues checking the outer Batch Account when the selected signer is an inner account', async () => {
    const api = lookup();
    const result = await resolveScamSignRequest({
        TransactionType: 'Batch', Account: 'rFlagged',
        RawTransactions: [{ TransactionType: 'Payment', Account: 'rSelf', Destination: 'rClean' }],
    }, 'rSelf', false, api);
    expect(api.getAccountAdvisory).toHaveBeenCalledWith('rFlagged');
    expect(result.isScam).toBe(true);
});
