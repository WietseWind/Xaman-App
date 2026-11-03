import { nftOfferActions } from '../nftOfferActions';

const buyer = 'rBuyerxxxxxxxxxxxxxxxxxxxx';
const broker = 'rBrokerxxxxxxxxxxxxxxxxxxx';
const owner = 'rOwnerxxxxxxxxxxxxxxxxxxxx';

describe('nftOfferActions', () => {
    it('lets the creator cancel a brokered buy offer', () => {
        expect(
            nftOfferActions({ Owner: buyer, Destination: broker, Flags: { lsfSellNFToken: false } }, buyer),
        ).toEqual(['CANCEL_OFFER']);
    });

    it('lets the creator cancel a brokered sell offer', () => {
        expect(
            nftOfferActions({ Owner: owner, Destination: broker, Flags: { lsfSellNFToken: true } }, owner),
        ).toEqual(['CANCEL_OFFER']);
    });

    it('lets the destination cancel a brokered buy offer and still sell into it', () => {
        expect(
            nftOfferActions({ Owner: buyer, Destination: broker, Flags: { lsfSellNFToken: false } }, broker),
        ).toEqual(['CANCEL_NFTOKEN_OFFER', 'SELL_NFTOKEN']);
    });

    it('lets the destination cancel a brokered sell offer and still accept it', () => {
        expect(
            nftOfferActions({ Owner: owner, Destination: broker, Flags: { lsfSellNFToken: true } }, broker),
        ).toEqual(['CANCEL_NFTOKEN_OFFER', 'ACCEPT_NFTOKEN_OFFER']);
    });

    it('offers nothing to an account that is neither creator nor destination', () => {
        // The NFT owner in issue 93 is this account: a buy offer aimed at a broker.
        expect(
            nftOfferActions({ Owner: buyer, Destination: broker, Flags: { lsfSellNFToken: false } }, owner),
        ).toEqual([]);
    });

    it('does not let a bystander cancel an open buy offer', () => {
        expect(nftOfferActions({ Owner: buyer, Flags: { lsfSellNFToken: false } }, owner)).toEqual([
            'SELL_NFTOKEN',
        ]);
    });

    it('does not let a bystander cancel an open sell offer', () => {
        expect(nftOfferActions({ Owner: owner, Flags: { lsfSellNFToken: true } }, buyer)).toEqual([
            'ACCEPT_NFTOKEN_OFFER',
        ]);
    });
});
