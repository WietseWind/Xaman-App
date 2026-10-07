import { TransactionTypes } from '@common/libs/ledger/types/enums';
import { TransactionJson } from '@common/libs/ledger/types/transaction';

export const SCAM_DANGER_LEVELS = ['PROBABLE', 'HIGH_PROBABILITY', 'CONFIRMED'];

// Continue is left/light, Cancel is right/solid so a habitual right-tap backs out.
export const SCAM_ACCEPT_CONFIRM_BUTTONS = [
    { action: 'continue', light: true, testID: 'scam-accept-continue-button' },
    { action: 'dismiss', light: false, testID: 'scam-accept-cancel-button' },
] as const;

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

export type LedgerOfferNode = {
    Owner?: string;
    Destination?: string;
    NFTokenID?: string;
};

export const collectLedgerOfferCounterparties = (
    node: LedgerOfferNode | undefined,
    sourceAddress?: string,
): string[] => {
    const addresses: string[] = [];
    pushAddress(addresses, node?.Owner);
    pushAddress(addresses, node?.Destination);
    return [...new Set(addresses.filter((address) => address !== sourceAddress))];
};

export type ScamSignRequestLookup = {
    getLedgerEntry: (index: string) => Promise<{ node?: LedgerOfferNode } | undefined>;
    getNFTDetails: (
        account: string,
        tokens: string[],
    ) => Promise<{ tokenData?: Record<string, { image?: string }> } | undefined>;
    getAccountAdvisory: (address: string) => Promise<{ danger?: string } | undefined>;
    getAccountName: (address: string) => Promise<{ blocked?: boolean } | undefined>;
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

export const resolveScamSignRequest = async (
    transaction: any,
    sourceAddress: string | undefined,
    payloadRiskWarn: boolean,
    lookup: ScamSignRequestLookup,
): Promise<{ isScam: boolean; cancelCraft?: CancelCraft }> => {
    const cancelCraft = craftCancelFromSignRequest(transaction);
    let canCancel = !!cancelCraft;
    let isScam = !!payloadRiskWarn;
    let offerNode: LedgerOfferNode | undefined;

    if (cancelCraft?.labelKey === 'cancelOffer') {
        canCancel = false;
        try {
            const offerId = transaction?.NFTokenSellOffer || transaction?.NFTokenBuyOffer;
            if (typeof offerId === 'string' && offerId) {
                const res = await lookup.getLedgerEntry(offerId);
                offerNode = res?.node;
                canCancel = canCancelNFTokenOffer(offerNode, sourceAddress);

                if (offerNode?.NFTokenID && sourceAddress) {
                    const details = await lookup.getNFTDetails(sourceAddress, [offerNode.NFTokenID]);
                    const image = details?.tokenData?.[offerNode.NFTokenID]?.image;
                    if (isScamImageUrl(image)) {
                        isScam = true;
                    }
                }
            }
        } catch {
            canCancel = false;
        }
    }

    const addresses = [
        ...collectSignRequestCounterparties(transaction, sourceAddress),
        ...collectLedgerOfferCounterparties(offerNode, sourceAddress),
    ].filter((address, index, all) => address && address !== sourceAddress && all.indexOf(address) === index);

    await Promise.all(
        addresses.map(async (address) => {
            try {
                const advisory = await lookup.getAccountAdvisory(address);
                if (isScamDanger(advisory?.danger)) {
                    isScam = true;
                }
            } catch {
                // ignore lookup failures
            }
            try {
                const name = await lookup.getAccountName(address);
                if (name?.blocked) {
                    isScam = true;
                }
            } catch {
                // ignore lookup failures
            }
        }),
    );

    return {
        isScam,
        cancelCraft: isScam && canCancel ? cancelCraft : undefined,
    };
};
