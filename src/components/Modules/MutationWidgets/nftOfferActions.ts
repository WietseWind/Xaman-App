/**
 * Which buttons an NFTokenOffer detail may show.
 *
 * NFTokenCancelOffer is allowed for the account that created the offer, or the
 * Destination when one is set. Anyone else gets tecNO_PERMISSION.
 * https://xrpl.org/docs/references/protocol/transactions/types/nftokencanceloffer
 */
export type NFTokenOfferAction =
    | 'CANCEL_OFFER'
    | 'CANCEL_NFTOKEN_OFFER'
    | 'ACCEPT_NFTOKEN_OFFER'
    | 'SELL_NFTOKEN';

export function nftOfferActions(
    offer: {
        Owner?: string;
        Destination?: string;
        Flags?: { lsfSellNFToken?: boolean };
    },
    accountAddress: string,
): NFTokenOfferAction[] {
    if (offer.Owner === accountAddress) {
        return ['CANCEL_OFFER'];
    }

    // A destination is the only other account allowed to accept or cancel.
    if (offer.Destination && offer.Destination !== accountAddress) {
        return [];
    }

    const actions: NFTokenOfferAction[] = [];

    if (offer.Flags?.lsfSellNFToken) {
        if (offer.Destination === accountAddress) {
            actions.push('CANCEL_NFTOKEN_OFFER');
        }
        actions.push('ACCEPT_NFTOKEN_OFFER');
    } else {
        // Buy offer. The destination (often a broker) may cancel it, same as a sell offer.
        if (offer.Destination === accountAddress) {
            actions.push('CANCEL_NFTOKEN_OFFER');
        }
        actions.push('SELL_NFTOKEN');
    }

    return actions;
}
