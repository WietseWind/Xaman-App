import { TransactionTypes } from '@common/libs/ledger/types/enums';

import {
    canCancelNFTokenOffer,
    collectSignRequestCounterparties,
    craftCancelFromSignRequest,
    isScamDanger,
    isScamImageUrl,
} from '../scamRejectAction';

describe('scamRejectAction', () => {
    describe('isScamDanger', () => {
        it('treats probable and confirmed advisory as scam', () => {
            expect(isScamDanger('CONFIRMED')).toBe(true);
            expect(isScamDanger('PROBABLE')).toBe(true);
            expect(isScamDanger('HIGH_PROBABILITY')).toBe(true);
            expect(isScamDanger('NONE')).toBe(false);
            expect(isScamDanger('UNKNOWN')).toBe(false);
            expect(isScamDanger(undefined)).toBe(false);
        });
    });

    describe('isScamImageUrl', () => {
        it('detects a scam image URL from NFT details', () => {
            expect(isScamImageUrl('https://cdn.xaman.app/scam-nft.png')).toBe(true);
            expect(isScamImageUrl('https://cdn.xaman.app/normal.png')).toBe(false);
            expect(isScamImageUrl(undefined)).toBe(false);
        });
    });

    describe('canCancelNFTokenOffer', () => {
        it('allows the owner or private destination to cancel', () => {
            expect(canCancelNFTokenOffer({ Owner: 'rOwner', Destination: 'rDest' }, 'rDest')).toBe(true);
            expect(canCancelNFTokenOffer({ Owner: 'rOwner' }, 'rOwner')).toBe(true);
            expect(canCancelNFTokenOffer({ Owner: 'rOwner' }, 'rOther')).toBe(false);
        });
    });

    describe('collectSignRequestCounterparties', () => {
        it('skips the signing account and dedupes', () => {
            expect(
                collectSignRequestCounterparties(
                    {
                        Account: 'rMe',
                        Destination: 'rDest',
                        Owner: 'rDest',
                        Amount: { issuer: 'rIssuer' },
                    },
                    'rMe',
                ),
            ).toEqual(['rDest', 'rIssuer']);
        });
    });

    describe('craftCancelFromSignRequest', () => {
        it('crafts NFTokenCancelOffer from an accept offer', () => {
            expect(
                craftCancelFromSignRequest({
                    Type: TransactionTypes.NFTokenAcceptOffer,
                    NFTokenSellOffer: 'OFFERID',
                }),
            ).toEqual({
                txJson: {
                    TransactionType: TransactionTypes.NFTokenCancelOffer,
                    NFTokenOffers: ['OFFERID'],
                },
                labelKey: 'cancelOffer',
            });
        });

        it('crafts CheckCancel from CheckCash', () => {
            expect(
                craftCancelFromSignRequest({
                    Type: TransactionTypes.CheckCash,
                    CheckID: 'CHECKID',
                }),
            ).toEqual({
                txJson: {
                    TransactionType: TransactionTypes.CheckCancel,
                    CheckID: 'CHECKID',
                },
                labelKey: 'cancelCheck',
            });
        });

        it('crafts EscrowCancel from EscrowFinish when identifiers exist', () => {
            expect(
                craftCancelFromSignRequest({
                    Type: TransactionTypes.EscrowFinish,
                    Owner: 'rOwner',
                    PreviousTxnID: 'TXID',
                }),
            ).toEqual({
                txJson: {
                    TransactionType: TransactionTypes.EscrowCancel,
                    Owner: 'rOwner',
                    PreviousTxnID: 'TXID',
                },
                labelKey: 'cancelEscrow',
            });
        });

        it('does not craft a cancel for payments or incomplete escrow finish', () => {
            expect(
                craftCancelFromSignRequest({ Type: TransactionTypes.Payment, Destination: 'rDest' }),
            ).toBeUndefined();
            expect(
                craftCancelFromSignRequest({ Type: TransactionTypes.EscrowFinish, Owner: 'rOwner' }),
            ).toBeUndefined();
        });
    });
});
