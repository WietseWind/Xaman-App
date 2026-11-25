import LedgerService from '../LedgerService';
import NetworkService from '../NetworkService';

jest.mock('@services/NetworkService', () => ({ send: jest.fn(), getNativeAsset: () => 'XRP' }));
afterEach(() => jest.restoreAllMocks());

const holding = (digit: string) => ({ MPTokenIssuanceID: digit.repeat(48), MPTAmount: '100' });

it('sends opaque continuation markers and loads every holding once across three pages', async () => {
    const requests: any[] = [];
    jest.spyOn(NetworkService, 'send').mockImplementation(async (spec: any) => {
        if (spec.command === 'ledger_entry') return { node: { AssetScale: 1 } } as any;
        requests.push(spec);
        if (!spec.marker) return { account_objects: [holding('A')], marker: 'cursor-1' } as any;
        if (spec.marker === 'cursor-1') return { account_objects: [holding('B')], marker: 'cursor-2' } as any;
        return { account_objects: [holding('C')] } as any;
    });
    const lines = await LedgerService.getAccountMPTFullDetails('rOwner');
    expect(requests.map((spec) => spec.marker)).toEqual([undefined, 'cursor-1', 'cursor-2']);
    expect(lines.map((line) => line.currency).sort()).toEqual(
        ['A', 'B', 'C'].map((digit) => digit.repeat(48)),
    );
    expect(lines.map((line) => line.balance)).toEqual(['10', '10', '10']);
});

it('preserves completed pages if a later page returns an error', async () => {
    jest.spyOn(NetworkService, 'send').mockImplementation(async (spec: any) => {
        if (spec.command === 'ledger_entry') return { node: { AssetScale: 1 } } as any;
        if (!spec.marker) return { account_objects: [holding('A')], marker: 'cursor-1' } as any;
        return { error: 'ledgerNotFound' } as any;
    });
    const lines = await LedgerService.getAccountMPTFullDetails('rOwner');
    expect(lines).toHaveLength(1);
    expect(lines[0].currency).toBe('A'.repeat(48));
});

it('keeps the existing repeated-marker guard', async () => {
    const requests: any[] = [];
    jest.spyOn(NetworkService, 'send').mockImplementation(async (spec: any) => {
        if (spec.command === 'ledger_entry') return { node: { AssetScale: 1 } } as any;
        requests.push(spec);
        return { account_objects: [holding(spec.marker ? 'B' : 'A')], marker: 'cursor-1' } as any;
    });
    const lines = await LedgerService.getAccountMPTFullDetails('rOwner');
    expect(requests).toHaveLength(2);
    expect(lines.map((line) => line.currency).sort()).toEqual(['A', 'B'].map((digit) => digit.repeat(48)));
});
