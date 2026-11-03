import {
    MPTAmountError,
    MPT_MAX_AMOUNT,
    mptAssetScale,
    mptDisplayToRaw,
    mptRawToDisplay,
    mptScaleFromCache,
} from '../mptAmount';

it.each([
    [0, '10', '10'],
    [1, '10', '100'],
    [2, '0.29', '29'],
    [6, '1.000001', '1000001'],
    [2, '90071992547409.93', '9007199254740993'],
    [0, MPT_MAX_AMOUNT, MPT_MAX_AMOUNT],
    [2, '92233720368547758.07', MPT_MAX_AMOUNT],
    [1, '0', '0'],
])('round trips scale %s amount %s exactly', (scale, display, raw) => {
    expect(mptDisplayToRaw(display, scale)).toBe(raw);
    expect(mptRawToDisplay(raw, scale)).toBe(display);
});

it.each([
    ['1.1', 0, 'precision'],
    ['0.01', 1, 'precision'],
    ['0.291', 2, 'precision'],
    ['9223372036854775808', 0, 'range'],
    ['-1', 0, 'amount'],
    ['NaN', 0, 'amount'],
    ['Infinity', 0, 'amount'],
    ['', 0, 'amount'],
])('rejects %s at scale %s without rounding', (amount, scale, reason) => {
    expect(() => mptDisplayToRaw(amount, scale)).toThrow(expect.objectContaining({ reason }));
});

it('supports the full UInt8 scale range without division rounding', () => {
    const display = `0.${'0'.repeat(254)}1`;
    expect(mptRawToDisplay('1', 255)).toBe(display);
    expect(mptDisplayToRaw(display, 255)).toBe('1');
});

it.each([-1, 256, 1.5, NaN, '2', null])('rejects invalid scale %s', (scale) => {
    expect(() => mptAssetScale(scale)).toThrow(MPTAmountError);
});

it('defaults a known issuance to scale zero and parses metadata containing pipes', () => {
    expect(mptScaleFromCache('0|{}')).toBe(0);
    expect(mptScaleFromCache('0|{"AssetScale":1,"description":"a|b"}')).toBe(1);
});

it.each([undefined, '', '0', '0|undefined', '0|null', '0|[]', '0|{"AssetScale":256}'])(
    'refuses missing/corrupt metadata %s',
    (cache) => {
        expect(() => mptScaleFromCache(cache)).toThrow(expect.objectContaining({ reason: 'metadata' }));
    },
);
