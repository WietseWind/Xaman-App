import AmountText from '../AmountText';

const derive = (value: string | number, immutable = true) =>
    AmountText.getDerivedStateFromProps({ value, immutable }, {} as any);

it.each([
    ['90071992547409.93', '90,071,992,547,409.93'],
    ['9223372036854775807', '9,223,372,036,854,775,807'],
    ['0.000000000000000001', '0.000000000000000001'],
    ['0.29', '0.29'],
])('keeps immutable %s exact through formatting', (value, expected) => {
    const state = derive(value);
    expect(state?.value).toBe(expected);
    expect(state?.originalValue).toBe(value);
});

it('preserves compact display and ordinary zero behavior', () => {
    expect(derive('')?.value).toBe('0');
    expect(derive('  ')?.value).toBe('0');
    expect(derive(0)?.value).toBe('0');
    expect(derive('0')?.value).toBe('0');
    expect(derive('0.000000000001', false)?.value).toBe('0…');
    expect(derive('0.29', false)?.value).toBe('0.29');
});
