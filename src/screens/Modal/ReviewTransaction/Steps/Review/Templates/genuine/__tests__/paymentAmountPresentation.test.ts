import { showMinimumReceiveFirst } from '../paymentAmountPresentation';

type Amounts = Parameters<typeof showMinimumReceiveFirst>[0];
const ISSUER = 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De';
const amounts = (overrides: Partial<Amounts> = {}): Amounts => ({
    Flags: { tfPartialPayment: true },
    Amount: { currency: 'USD', issuer: ISSUER, value: '994673548.861546' },
    DeliverMin: { currency: 'USD', issuer: ISSUER, value: '1.27890052' },
    SendMax: { currency: 'XRP', value: '1' },
    ...overrides,
});

it('recognizes the large receive cap in issue #360', () => {
    expect(showMinimumReceiveFirst(amounts())).toBe(true);
});

it.each([
    ['below two times', '1.99', '1', false],
    ['exactly two times', '2', '1', false],
    ['above two times', '2.01', '1', true],
    ['large exact boundary', '9007199254740992', '4503599627370496', false],
    ['large one-unit difference', '9007199254740993', '4503599627370496', true],
    ['scientific exact boundary', '2e-80', '1e-80', false],
    ['scientific above boundary', '2.000000000000001e-80', '1e-80', true],
])('%s uses decimal precision', (_label, maximum, minimum, expected) => {
    expect(showMinimumReceiveFirst(amounts({
        Amount: { currency: 'USD', issuer: ISSUER, value: maximum as string },
        DeliverMin: { currency: 'USD', issuer: ISSUER, value: minimum as string },
    }))).toBe(expected);
});

it.each([
    ['missing flag', { Flags: {} }],
    ['explicit false flag', { Flags: { tfPartialPayment: false } }],
    ['missing Amount', { Amount: undefined }],
    ['missing SendMax', { SendMax: undefined }],
    ['missing DeliverMin', { DeliverMin: undefined }],
    ['different currency', { DeliverMin: { currency: 'EUR', issuer: ISSUER, value: '1' } }],
    ['different issuer', { DeliverMin: { currency: 'USD', issuer: 'rOtherIssuer', value: '1' } }],
    ['missing receive currency', { DeliverMin: { currency: '', issuer: ISSUER, value: '1' } }],
    ['case-sensitive standard currency', { DeliverMin: { currency: 'usd', issuer: ISSUER, value: '1' } }],
    ['MPT amount', { Amount: { mpt_issuance_id: 'A'.repeat(48), value: '1000' } }],
])('does not reorder %s', (_label, overrides) => {
    expect(showMinimumReceiveFirst(amounts(overrides as Partial<Amounts>))).toBe(false);
});

it.each([
    ['Amount', 'NaN'], ['Amount', 'Infinity'], ['Amount', ''], ['Amount', 'bad'],
    ['DeliverMin', 'NaN'], ['DeliverMin', 'Infinity'], ['DeliverMin', '0'], ['DeliverMin', '-1'],
    ['SendMax', 'NaN'], ['SendMax', 'Infinity'], ['SendMax', '0'], ['SendMax', '-1'],
])('does not promote invalid %s value %s', (field, value) => {
    const input = amounts();
    Object.assign(input, { [field]: { ...(input as any)[field], value } });
    expect(showMinimumReceiveFirst(input)).toBe(false);
});

it('compares hexadecimal currency codes as bytes without changing issuer identity', () => {
    const code = '524C555344'.padEnd(40, '0');
    expect(showMinimumReceiveFirst(amounts({
        Amount: { currency: code.toLowerCase(), issuer: ISSUER, value: '1000' },
        DeliverMin: { currency: code, issuer: ISSUER, value: '1' },
    }))).toBe(true);
});

it('supports a native receive asset paid for with an issued asset', () => {
    expect(showMinimumReceiveFirst(amounts({
        Amount: { currency: 'XRP', value: '1000' },
        DeliverMin: { currency: 'XRP', value: '1' },
        SendMax: { currency: 'USD', issuer: ISSUER, value: '2' },
    }))).toBe(true);
});

it('does not mutate frozen parsed payment fields', () => {
    const input = amounts();
    Object.values(input).forEach(value => Object.freeze(value));
    Object.freeze(input);
    expect(showMinimumReceiveFirst(input)).toBe(true);
});
