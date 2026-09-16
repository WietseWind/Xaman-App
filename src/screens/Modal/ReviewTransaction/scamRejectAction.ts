import { TransactionTypes } from '@common/libs/ledger/types/enums';
import { TransactionJson } from '@common/libs/ledger/types/transaction';

export const SCAM_DANGER_LEVELS = ['PROBABLE', 'HIGH_PROBABILITY', 'CONFIRMED'];

export type CancelCraft = {
    txJson: TransactionJson;
    labelKey: 'cancelOffer' | 'cancelCheck' | 'cancelEscrow';
};

export const isScamDanger = (danger?: string): boolean => {
    return !!danger && SCAM_DANGER_LEVELS.includes(danger);
};

export const isScamImageUrl = (image?: string): boolean => {
    return typeof image === 'string' && /scam/i.test(image);
};

export const canCancelNFTokenOffer = (
    offer: { Owner?: string; Destination?: string } | undefined,
    sourceAddress?: string,
): boolean => {
    if (!offer || !sourceAddress) {
        return false;
    }
    return offer.Owner === sourceAddress || offer.Destination === sourceAddress;
};

const pushAddress = (bucket: string[], value: unknown) => {
    if (typeof value === 'string' && value) {
        bucket.push(value);
    }
};

export const collectSignRequestCounterparties = (
    transaction: any,
    sourceAddress?: string,
): string[] => {
    const addresses: string[] = [];

    pushAddress(addresses, transaction?.Destination);
    pushAddress(addresses, transaction?.Owner);
    pushAddress(addresses, transaction?.Issuer);

    if (transaction?.Account && transaction.Account !== sourceAddress) {
        pushAddress(addresses, transaction.Account);
    }

    pushAddress(addresses, transaction?.LimitAmount?.issuer);
    pushAddress(addresses, transaction?.Amount?.issuer);
    pushAddress(addresses, transaction?.TakerPays?.issuer);
    pushAddress(addresses, transaction?.TakerGets?.issuer);
    pushAddress(addresses, transaction?.SendMax?.issuer);

    return [...new Set(addresses)];
};

export const craftCancelFromSignRequest = (transaction: any): CancelCraft | undefined => {
    const type = transaction?.Type || transaction?.TransactionType;

    if (type === TransactionTypes.NFTokenAcceptOffer) {
        const offerId = transaction.NFTokenSellOffer || transaction.NFTokenBuyOffer;
        if (typeof offerId === 'string' && offerId) {
            return {
                txJson: {
                    TransactionType: TransactionTypes.NFTokenCancelOffer,
                    NFTokenOffers: [offerId],
                },
                labelKey: 'cancelOffer',
            };
        }
    }

    if (type === TransactionTypes.CheckCash && typeof transaction?.CheckID === 'string' && transaction.CheckID) {
        return {
            txJson: {
                TransactionType: TransactionTypes.CheckCancel,
                CheckID: transaction.CheckID,
            },
            labelKey: 'cancelCheck',
        };
    }

    if (type === TransactionTypes.EscrowFinish && typeof transaction?.Owner === 'string' && transaction.Owner) {
        const txJson: TransactionJson = {
            TransactionType: TransactionTypes.EscrowCancel,
            Owner: transaction.Owner,
        };

        if (transaction.OfferSequence != null) {
            txJson.OfferSequence = transaction.OfferSequence;
        }
        if (typeof transaction.PreviousTxnID === 'string' && transaction.PreviousTxnID) {
            txJson.PreviousTxnID = transaction.PreviousTxnID;
        }
        if (typeof transaction.EscrowID === 'string' && transaction.EscrowID) {
            txJson.EscrowID = transaction.EscrowID;
        }

        if (txJson.OfferSequence == null && !txJson.PreviousTxnID && !txJson.EscrowID) {
            return undefined;
        }

        return {
            txJson,
            labelKey: 'cancelEscrow',
        };
    }

    return undefined;
};
