import { libraries, utils } from 'xrpl-accountlib';
import { TransactionJson } from '@common/libs/ledger/types/transaction';

export type BatchCreatedNFTokenOffers = ReadonlyMap<string, 'buy' | 'sell'>;

const uint32 = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 0xffffffff;

// Presentation context only. These are proposed offers, never fetched ledger objects.
export const batchNFTokenOffersBefore = (
    transactions: TransactionJson[], index: number, flags?: number,
): BatchCreatedNFTokenOffers => {
    const offers = new Map<string, { side: 'buy' | 'sell'; token: string }>();
    const created = new Set<string>();
    // Other modes can continue after a failed create, or cannot apply both create and accept.
    if (!uint32(flags) || (flags & 0x000f0000) !== 0x00010000 ||
        !Number.isInteger(index) || index < 0 || index > transactions.length) return new Map();

    transactions.slice(0, index).forEach((transaction) => {
        const tx = transaction as Record<string, any>;
        if (tx.TransactionType === 'NFTokenCreateOffer') {
            const sequence = tx.TicketSequence !== undefined
                ? (tx.Sequence === 0 && uint32(tx.TicketSequence) ? tx.TicketSequence : undefined)
                : tx.Sequence;
            if (!uint32(sequence) || !uint32(tx.Flags) || !(tx.Flags & 0x40000000) ||
                tx.Fee !== '0' || tx.SigningPubKey !== '' || !/^[A-Fa-f0-9]{64}$/.test(tx.NFTokenID)) return;
            try {
                const account = libraries.rippleAddressCodec.decodeAccountID(tx.Account).toString('hex');
                // rippled keylet::nftokenOffer: namespace 'q' (0x0071), AccountID, SeqProxy value.
                const id = Buffer.from(utils.hash(`0071${account}${sequence.toString(16).padStart(8, '0')}`))
                    .toString('hex').toUpperCase();
                if (created.has(id)) {
                    offers.delete(id);
                    return;
                }
                created.add(id);
                offers.set(id, { side: tx.Flags & 1 ? 'sell' : 'buy', token: tx.NFTokenID.toUpperCase() });
            } catch {
                // An invalid or incomplete create must keep the normal lookup/error path.
            }
        } else if (tx.TransactionType === 'NFTokenCancelOffer') {
            if (Array.isArray(tx.NFTokenOffers)) {
                tx.NFTokenOffers.forEach((id: unknown) => {
                    if (typeof id === 'string') offers.delete(id.toUpperCase());
                });
            }
        } else if (tx.TransactionType === 'NFTokenAcceptOffer') {
            [tx.NFTokenSellOffer, tx.NFTokenBuyOffer].forEach((id) => {
                if (typeof id === 'string') offers.delete(id.toUpperCase());
            });
        } else if (tx.TransactionType === 'NFTokenBurn' && typeof tx.NFTokenID === 'string') {
            offers.forEach((offer, id) => {
                if (offer.token === tx.NFTokenID.toUpperCase()) offers.delete(id);
            });
        }
    });
    return new Map([...offers].map(([id, offer]) => [id, offer.side]));
};
