import BigNumber from 'bignumber.js';

export const MPT_MAX_AMOUNT = '9223372036854775807';

export class MPTAmountError extends Error {
    constructor(
        public reason: 'metadata' | 'amount' | 'precision' | 'range',
        public scale = 0,
    ) {
        super(reason);
    }
}

export const mptAssetScale = (scale: unknown = 0): number => {
    if (typeof scale !== 'number' || !Number.isInteger(scale) || scale < 0 || scale > 255) {
        throw new MPTAmountError('metadata');
    }
    return scale;
};

// Missing AssetScale in a known issuance means zero. Missing issuance metadata
// cannot be treated as zero: doing so could sign a different number of units.
export const mptScaleFromCache = (cache: string | undefined): number => {
    try {
        const separator = cache?.indexOf('|') ?? -1;
        if (separator < 0) throw new Error('Missing issuance');
        const issuance = JSON.parse(cache!.slice(separator + 1));
        if (!issuance || typeof issuance !== 'object' || Array.isArray(issuance)) {
            throw new Error('Invalid issuance');
        }
        return mptAssetScale(issuance.AssetScale);
    } catch {
        throw new MPTAmountError('metadata');
    }
};

export const mptDisplayToRaw = (amount: string, assetScale = 0): string => {
    const scale = mptAssetScale(assetScale);
    const value = new BigNumber(amount);
    if (!value.isFinite() || value.isNegative()) throw new MPTAmountError('amount', scale);
    const raw = value.shiftedBy(scale);
    if (!raw.isInteger()) throw new MPTAmountError('precision', scale);
    if (raw.isGreaterThan(MPT_MAX_AMOUNT)) throw new MPTAmountError('range', scale);
    return raw.toFixed(0);
};

export const mptRawToDisplay = (amount: BigNumber.Value, assetScale = 0): string => {
    const scale = mptAssetScale(assetScale);
    const value = new BigNumber(amount);
    if (!value.isFinite() || !value.isInteger()) throw new MPTAmountError('amount', scale);
    return value.shiftedBy(-scale).toFixed();
};
