import { filterActionsForScamAdvisory, isReportedScamAdvisory } from '../scamActionFilter';

describe('filterActionsForScamAdvisory', () => {
    const nftOfferActions = ['CANCEL_NFTOKEN_OFFER', 'ACCEPT_NFTOKEN_OFFER'];
    const checkActions = ['CASH_CHECK', 'CANCEL_CHECK'];
    const escrowActions = ['CANCEL_ESCROW', 'FINISH_ESCROW'];

    it('does not treat missing or UNKNOWN advisory as scam', () => {
        expect(isReportedScamAdvisory(undefined)).toBe(false);
        expect(isReportedScamAdvisory('UNKNOWN')).toBe(false);
        expect(isReportedScamAdvisory('CONFIRMED')).toBe(true);
        expect(isReportedScamAdvisory('PROBABLE')).toBe(true);
    });

    it('keeps accept and cancel when there is no scam advisory', () => {
        expect(filterActionsForScamAdvisory(nftOfferActions)).toEqual(nftOfferActions);
        expect(filterActionsForScamAdvisory(checkActions, 'UNKNOWN')).toEqual(checkActions);
        expect(filterActionsForScamAdvisory(escrowActions, undefined)).toEqual(escrowActions);
    });

    it('hides accept/cash/finish on scam but keeps cancel', () => {
        expect(filterActionsForScamAdvisory(nftOfferActions, 'CONFIRMED')).toEqual(['CANCEL_NFTOKEN_OFFER']);
        expect(filterActionsForScamAdvisory(checkActions, 'PROBABLE')).toEqual(['CANCEL_CHECK']);
        expect(filterActionsForScamAdvisory(escrowActions, 'HIGH_PROBABILITY')).toEqual(['CANCEL_ESCROW']);
    });

    it('hides sell-my-NFT accept paths on scam', () => {
        expect(filterActionsForScamAdvisory(['SELL_NFTOKEN', 'CANCEL_OFFER'], 'CONFIRMED')).toEqual(['CANCEL_OFFER']);
        expect(filterActionsForScamAdvisory(['ACCEPT_URITOKEN_OFFER', 'CANCEL_OFFER'], 'CONFIRMED')).toEqual([
            'CANCEL_OFFER',
        ]);
    });

    it('leaves no buttons when only accept actions were available', () => {
        expect(filterActionsForScamAdvisory(['ACCEPT_NFTOKEN_OFFER', 'CASH_CHECK'], 'CONFIRMED')).toEqual([]);
    });
});
