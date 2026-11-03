import Meta from '../meta';

const metadata = (count: number, withIssuance = true) => ({
    TransactionResult: 'tesSUCCESS',
    AffectedNodes: [
        ...Array.from({ length: count }, () => ({ ModifiedNode: {
            LedgerEntryType: 'MPToken', FinalFields: {
                Account: 'holder', Issuer: 'issuer', MPTAmount: '10000',
            }, PreviousFields: { MPTAmount: '0' },
        } })),
        ...(withIssuance ? [{ ModifiedNode: { LedgerEntryType: 'MPTokenIssuance',
            FinalFields: { AssetScale: 2 }, PreviousFields: {} } }] : []),
    ],
});

const instrument = (meta: Meta) => {
    const counter = { inspections: 0 };
    const { nodes } = meta;
    for (const method of ['filter', 'find'] as const) {
        const original = Array.prototype[method];
        jest.spyOn(nodes, method).mockImplementation(((predicate: any, thisArg?: any) =>
            original.call(nodes, (node: any, index: number, array: any) => {
                counter.inspections++;
                return predicate.call(thisArg, node, index, array);
            })) as any);
    }
    return () => counter.inspections;
};
const value = (meta: Meta) => meta.parseBalanceChanges().holder[0].value;

afterEach(() => jest.restoreAllMocks());

it('searches issuance nodes at most once per parse for a large MPT transaction', () => {
    const meta = new Meta(metadata(1000) as any);
    const count = instrument(meta);
    expect(value(meta)).toBe('100000');
    expect(count()).toBeLessThanOrEqual(meta.nodes.length);
    const first = count();
    expect(value(meta)).toBe('100000');
    expect(count() - first).toBeLessThanOrEqual(meta.nodes.length);
});

it('also avoids repeated full scans when the issuance node is absent', () => {
    const meta = new Meta(metadata(1000, false) as any);
    const count = instrument(meta);
    expect(value(meta)).toBe('10000000');
    expect(count()).toBeLessThanOrEqual(meta.nodes.length);
});

it('retains the first matching issuance and reflects public nodes changed between parses', () => {
    const meta = new Meta(metadata(100) as any);
    expect(value(meta)).toBe('10000');
    (meta.nodes.find((node) => node.LedgerEntryType === 'MPTokenIssuance') as any).FinalFields.AssetScale = 4;
    expect(value(meta)).toBe('100');
    meta.nodes.unshift({ LedgerEntryType: 'MPTokenIssuance', diffType: 'ModifiedNode',
        FinalFields: { AssetScale: 3 } } as any);
    expect(value(meta)).toBe('1000');
    meta.nodes = [];
    expect(meta.parseBalanceChanges()).toEqual({});
});

it('keeps attachment precedence and reflects attachment changes between parses', () => {
    const meta = new Meta(metadata(100) as any);
    (meta.meta as any)._attachments = { MPTokenIssuance: { AssetScale: 4 } };
    expect(value(meta)).toBe('100');
    (meta.meta as any)._attachments.MPTokenIssuance.AssetScale = 6;
    expect(value(meta)).toBe('1');
    delete (meta.meta as any)._attachments;
    expect(value(meta)).toBe('10000');
});
