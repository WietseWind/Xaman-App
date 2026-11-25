/**
 * ResolverService.getAccountAdvisoryInfo: `blackHole` keeps its meaning; `blackHoleHookControlled` is added next to
 * it, and is looked up for black holed accounts only.
 */
import ResolverService from '@services/ResolverService';
import BackendService from '@services/BackendService';
import LedgerService from '@services/LedgerService';
import NetworkService from '@services/NetworkService';

jest.mock('@store/repositories/contact', () => ({
    __esModule: true,
    default: { on: jest.fn(), off: jest.fn(), findOne: jest.fn(() => null) },
}));

jest.mock('@store/repositories/account', () => ({
    __esModule: true,
    default: { on: jest.fn(), off: jest.fn(), findOne: jest.fn(() => null) },
}));

jest.mock('@store/repositories', () => ({
    CurrencyRepository: { on: jest.fn(), off: jest.fn(), findAll: jest.fn(() => []), update: jest.fn() },
}));

jest.mock('@services/BackendService', () => ({
    __esModule: true,
    default: { getAccountAdvisory: jest.fn() },
}));

jest.mock('@services/LedgerService', () => ({
    __esModule: true,
    default: { getAccountInfo: jest.fn(), getLedgerEntry: jest.fn(), getTransactions: jest.fn() },
}));

jest.mock('@services/NetworkService', () => ({
    __esModule: true,
    default: { getNetworkId: jest.fn() },
}));

jest.mock('@services/LoggerService', () => ({
    __esModule: true,
    default: { createLogger: () => ({ error: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

const ACCOUNT = 'rHookControlledAccountxxxxxxxxxxxx';
const BLACK_HOLE_KEY = 'rrrrrrrrrrrrrrrrrrrrBZbvji';
const HOOK_HASH = '5EDF6439C47C423EAC99C1061EE2A0CE6A24A58C8E8A66E4B3AF91D76772DC77';

const getAccountAdvisory = BackendService.getAccountAdvisory as jest.Mock;
const getAccountInfo = LedgerService.getAccountInfo as jest.Mock;
const getLedgerEntry = LedgerService.getLedgerEntry as jest.Mock;
const getTransactions = LedgerService.getTransactions as jest.Mock;
const getNetworkId = NetworkService.getNetworkId as jest.Mock;

const blackHoledAccount = (account = ACCOUNT) => ({
    account_data: { Account: account, RegularKey: BLACK_HOLE_KEY, Balance: '1000000' },
    account_flags: { disableMasterKey: true },
});

describe('ResolverService.getAccountAdvisoryInfo: black holed account controlled by its Hook', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getNetworkId.mockReturnValue(21337);
        getAccountAdvisory.mockResolvedValue({
            account: ACCOUNT,
            danger: 'UNKNOWN',
            force_dtag: false,
            force_whitelist: true,
        });
        getAccountInfo.mockResolvedValue(blackHoledAccount());
        getLedgerEntry.mockResolvedValue({
            node: { LedgerEntryType: 'Hook', Account: ACCOUNT, Hooks: [{ Hook: { HookHash: HOOK_HASH } }] },
        });
        getTransactions.mockResolvedValue({ transactions: [] });
    });

    it('whitelisted, Hooks network, black holed, Hook installed: black holed and Hook controlled', async () => {
        const info = await ResolverService.getAccountAdvisoryInfo(ACCOUNT);
        expect(info).toEqual(
            expect.objectContaining({ exist: true, danger: 'UNKNOWN', blackHole: true, blackHoleHookControlled: true }),
        );
    });

    it('not whitelisted (also an older backend without the field): black holed, not Hook controlled', async () => {
        getAccountAdvisory.mockResolvedValue({ account: ACCOUNT, danger: 'UNKNOWN', force_dtag: false });
        const info = await ResolverService.getAccountAdvisoryInfo(ACCOUNT);
        expect(info).toEqual(expect.objectContaining({ blackHole: true, blackHoleHookControlled: false }));
        expect(getLedgerEntry).not.toHaveBeenCalled();
    });

    it('the XRP Ledger (network 0): black holed, not Hook controlled', async () => {
        getNetworkId.mockReturnValue(0);
        const info = await ResolverService.getAccountAdvisoryInfo(ACCOUNT);
        expect(info).toEqual(expect.objectContaining({ blackHole: true, blackHoleHookControlled: false }));
        expect(getLedgerEntry).not.toHaveBeenCalled();
    });

    it('no Hook installed: black holed, not Hook controlled', async () => {
        getLedgerEntry.mockResolvedValue({ error: 'entryNotFound' });
        const info = await ResolverService.getAccountAdvisoryInfo(ACCOUNT);
        expect(info).toEqual(expect.objectContaining({ blackHole: true, blackHoleHookControlled: false }));
    });

    it('a failing Hook lookup does not fail the advisory', async () => {
        getLedgerEntry.mockRejectedValue(new Error('timeout'));
        const info = await ResolverService.getAccountAdvisoryInfo(ACCOUNT);
        expect(info).toEqual(expect.objectContaining({ exist: true, blackHole: true, blackHoleHookControlled: false }));
    });

    it('an account that is not black holed: no Hook lookup', async () => {
        getAccountInfo.mockResolvedValue({ account_data: { Account: ACCOUNT, Balance: '1000000' }, account_flags: {} });
        const info = await ResolverService.getAccountAdvisoryInfo(ACCOUNT);
        expect(info).toEqual(expect.objectContaining({ blackHole: false, blackHoleHookControlled: false }));
        expect(getLedgerEntry).not.toHaveBeenCalled();
    });

    it('a lost-key address with Hooks (the genesis account): black holed, never Hook controlled', async () => {
        const genesis = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
        getAccountInfo.mockResolvedValue(blackHoledAccount(genesis));
        const info = await ResolverService.getAccountAdvisoryInfo(genesis);
        expect(info).toEqual(expect.objectContaining({ blackHole: true, blackHoleHookControlled: false }));
        expect(getLedgerEntry).not.toHaveBeenCalled();
    });

    it('a black hole address that does not exist in the ledger: black holed, as before', async () => {
        const blackHole = 'rrrrrrrrrrrrrrrrrrrrrhoLvTp';
        getAccountInfo.mockResolvedValue({ error: 'actNotFound' });
        const info = await ResolverService.getAccountAdvisoryInfo(blackHole);
        expect(info).toEqual({ exist: false, danger: 'UNKNOWN', blackHole: true });
        expect(getLedgerEntry).not.toHaveBeenCalled();
    });

    it('a blacklisted account keeps its danger level, whatever the Hook state', async () => {
        getAccountAdvisory.mockResolvedValue({
            account: ACCOUNT,
            danger: 'CONFIRMED',
            force_dtag: false,
            force_whitelist: true,
        });
        const info = await ResolverService.getAccountAdvisoryInfo(ACCOUNT);
        expect(info.danger).toBe('CONFIRMED');
    });
});
