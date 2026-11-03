import LedgerService from '../LedgerService';
import NetworkService from '../NetworkService';
import { MPT_MAX_AMOUNT } from '@common/utils/mptAmount';

jest.mock('@services/NetworkService', () => ({ send: jest.fn(), getNativeAsset: () => 'XRP' }));
afterEach(() => jest.restoreAllMocks());

it.each([
    [1, '100', '10'],
    [2, '9007199254740993', '90071992547409.93'],
    [6, '1', '0.000001'],
])('stores an exact standard-unit balance at scale %s', async (scale, raw, display) => {
    jest.spyOn(NetworkService, 'send').mockImplementation(
        async (spec: any) =>
            (spec.command === 'account_objects'
                ? { account_objects: [{ MPTokenIssuanceID: 'A'.repeat(48), MPTAmount: raw }] }
                : { node: { AssetScale: scale, MaximumAmount: raw } }) as any,
    );
    const [line] = await LedgerService.getAccountMPTFullDetails('rOwner');
    expect(line.balance).toBe(display);
    expect(line.limit).toBe(display);
    expect(line.limit_peer).toBe(`${display}|${JSON.stringify({ AssetScale: scale, MaximumAmount: raw })}`);
});

it('uses ledger defaults for omitted scale and maximum', async () => {
    jest.spyOn(NetworkService, 'send').mockImplementation(
        async (spec: any) =>
            (spec.command === 'account_objects'
                ? { account_objects: [{ MPTokenIssuanceID: 'A'.repeat(48), MPTAmount: '3' }] }
                : { node: {} }) as any,
    );
    const [line] = await LedgerService.getAccountMPTFullDetails('rOwner');
    expect(line.balance).toBe('3');
    expect(line.limit).toBe(MPT_MAX_AMOUNT);
});

it('does not cache unscaled balances when issuance metadata could not be loaded', async () => {
    jest.spyOn(NetworkService, 'send').mockImplementation(
        async (spec: any) =>
            (spec.command === 'account_objects'
                ? { account_objects: [{ MPTokenIssuanceID: 'A'.repeat(48), MPTAmount: '100' }] }
                : { error: 'entryNotFound' }) as any,
    );
    await expect(LedgerService.getAccountMPTFullDetails('rOwner')).resolves.toEqual([]);
});
