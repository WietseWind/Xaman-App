import { TransactionTypes } from '@common/libs/ledger/types/enums';

import {
    canCancelNFTokenOffer,
    collectLedgerOfferCounterparties,
    collectSignRequestCounterparties,
    craftCancelFromSignRequest,
    isScamDanger,
    isScamImageUrl,
    resolveScamSignRequest,
    SCAM_ACCEPT_CONFIRM_BUTTONS,
    ScamSignRequestLookup,
} from '../scamRejectAction';

/**
 * Captured 2026-09-17 from https://api.xrpl.to/api/nft/scam topScammers
 * (rKWQGG9…, 101 drains) + s1.ripple.com account_objects type=nft_offer.
 * 83 outstanding Destination-private sell offers, 0 public.
 * Do not ship this as an in-app dummy; tests only.
 */
const LIVE_SCAM_OFFER = {
    index: '0B90C84916FA3629EC353804F253B44AD8BC38160B777AE609E68F62D961ADC7',
    LedgerEntryType: 'NFTokenOffer',
    Flags: 1,
    Owner: 'rKWQGG9LsPNxEf49LoCxeALwbfoua3MaTp',
    Destination: 'rDABcXDrzf4wrk9RzP7AQPrnzKUnE9Cib8',
    NFTokenID: '00090000CB01BEFEDE61809ECDFD3DE747C87DDCD95BA0DBE732249F0613D704',
    Amount: {
        currency: '524C555344000000000000000000000000000000',
        issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
        value: '42.083958',
    },
};

const UNRELATED_ACCOUNT = 'ranPYbmjQ15Voee1QFCkBJBzjYoWiVpae';

const lookupFor = (
    overrides: Partial<ScamSignRequestLookup> & {
        advisoryByAddress?: Record<string, string>;
        blocked?: string[];
        nftImage?: string;
    } = {},
): ScamSignRequestLookup => {
    const { advisoryByAddress = {}, blocked = [], nftImage, ...rest } = overrides;
    return {
        getLedgerEntry: async () => ({ node: LIVE_SCAM_OFFER }),
        getNFTDetails: async (_account, tokens) => ({
            tokenData: {
                [tokens[0]]: nftImage ? { image: nftImage } : {},
            },
        }),
        getAccountAdvisory: async (address) => ({
            danger: advisoryByAddress[address] || 'NONE',
        }),
        getAccountName: async (address) => ({
            blocked: blocked.includes(address),
        }),
        ...rest,
    };
};

describe('scamRejectAction', () => {
    describe('scam accept confirm buttons', () => {
        it('puts light Continue on the left and solid Cancel on the right', () => {
            expect(SCAM_ACCEPT_CONFIRM_BUTTONS.map(({ action, light }) => ({ action, light }))).toEqual([
                { action: 'continue', light: true },
                { action: 'dismiss', light: false },
            ]);
        });
    });

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

    describe('live xrpl.to scam offer fixture', () => {
        const acceptTx = {
            Type: TransactionTypes.NFTokenAcceptOffer,
            Account: LIVE_SCAM_OFFER.Destination,
            NFTokenSellOffer: LIVE_SCAM_OFFER.index,
        };

        it('lets only the private destination or owner cancel', () => {
            expect(canCancelNFTokenOffer(LIVE_SCAM_OFFER, LIVE_SCAM_OFFER.Destination)).toBe(true);
            expect(canCancelNFTokenOffer(LIVE_SCAM_OFFER, LIVE_SCAM_OFFER.Owner)).toBe(true);
            expect(canCancelNFTokenOffer(LIVE_SCAM_OFFER, UNRELATED_ACCOUNT)).toBe(false);
        });

        it('treats the scammer owner as a counterparty even though accept-offer json has no Owner', () => {
            expect(collectSignRequestCounterparties(acceptTx, LIVE_SCAM_OFFER.Destination)).toEqual([]);
            expect(collectLedgerOfferCounterparties(LIVE_SCAM_OFFER, LIVE_SCAM_OFFER.Destination)).toEqual([
                LIVE_SCAM_OFFER.Owner,
            ]);
        });

        it('shows the cancel CTA when the destination signs and the owner is flagged', async () => {
            const result = await resolveScamSignRequest(
                acceptTx,
                LIVE_SCAM_OFFER.Destination,
                false,
                lookupFor({
                    advisoryByAddress: { [LIVE_SCAM_OFFER.Owner]: 'CONFIRMED' },
                }),
            );

            expect(result.isScam).toBe(true);
            expect(result.cancelCraft).toEqual({
                txJson: {
                    TransactionType: TransactionTypes.NFTokenCancelOffer,
                    NFTokenOffers: [LIVE_SCAM_OFFER.index],
                },
                labelKey: 'cancelOffer',
            });
        });

        it('flags the offer as scam for an unrelated signer but does not offer cancel', async () => {
            const result = await resolveScamSignRequest(
                {
                    ...acceptTx,
                    Account: UNRELATED_ACCOUNT,
                },
                UNRELATED_ACCOUNT,
                false,
                lookupFor({
                    advisoryByAddress: { [LIVE_SCAM_OFFER.Owner]: 'CONFIRMED' },
                }),
            );

            expect(result.isScam).toBe(true);
            expect(result.cancelCraft).toBeUndefined();
        });

        it('does not flag a clean payment or a clean accept-offer', async () => {
            const payment = await resolveScamSignRequest(
                {
                    Type: TransactionTypes.Payment,
                    Account: UNRELATED_ACCOUNT,
                    Destination: 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY',
                },
                UNRELATED_ACCOUNT,
                false,
                lookupFor({
                    advisoryByAddress: { rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY: 'NONE' },
                }),
            );
            expect(payment.isScam).toBe(false);
            expect(payment.cancelCraft).toBeUndefined();

            const accept = await resolveScamSignRequest(
                acceptTx,
                LIVE_SCAM_OFFER.Destination,
                false,
                lookupFor({
                    advisoryByAddress: { [LIVE_SCAM_OFFER.Owner]: 'NONE' },
                    nftImage: 'https://cdn.xaman.app/normal.png',
                }),
            );
            expect(accept.isScam).toBe(false);
            expect(accept.cancelCraft).toBeUndefined();
        });

        it('also flags via a scam NFT image URL from backend details', async () => {
            const result = await resolveScamSignRequest(
                acceptTx,
                LIVE_SCAM_OFFER.Destination,
                false,
                lookupFor({
                    nftImage: 'https://cdn.xaman.app/scam-nft.png',
                }),
            );

            expect(result.isScam).toBe(true);
            expect(result.cancelCraft?.labelKey).toBe('cancelOffer');
        });
    });
});
