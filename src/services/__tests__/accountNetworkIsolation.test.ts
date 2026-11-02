import AccountService from '../AccountService';
import LedgerService from '../LedgerService';
import BackendService from '../BackendService';
import NetworkService from '../NetworkService';
import { AccountRepository, CurrencyRepository } from '@store/repositories';

jest.mock('@services/LedgerService', () => ({ __esModule: true, default: {
    getAccountInfo: jest.fn(), getFilteredAccountLines: jest.fn(),
    getAccountObligations: jest.fn(), getAccountMPTFullDetails: jest.fn(),
} }));
jest.mock('@services/BackendService', () => ({ __esModule: true, default: {
    getAccountExtAssets: jest.fn(),
} }));
jest.mock('@services/NetworkService', () => ({ __esModule: true, default: {
    getNetwork: jest.fn(), getNetworkId: jest.fn(),
} }));
jest.mock('@services/LoggerService', () => ({ __esModule: true, default: {
    createLogger: () => ({ debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
} }));
jest.mock('@store/repositories', () => ({
    AccountRepository: { updateDetails: jest.fn(), findOne: jest.fn() },
    CoreRepository: { getDefaultAccount: () => ({ address: 'rPublicNetworkIsolation' }) },
    CurrencyRepository: { upsert: jest.fn() },
}));

const ADDRESS = 'rPublicNetworkIsolation';
const mainnet = { id: 'mainnet', key: 'MAINNET', networkId: 0, name: 'XRP Ledger' };
const testnet = { id: 'testnet', key: 'TESTNET', networkId: 1, name: 'XRPL Testnet' };
let selected = mainnet;
const info = (balance: string) => ({ account_data: { Balance: balance, Sequence: 1 }, account_flags: {} });
const line = { account: 'rIssuer', currency: 'USD', balance: '12', limit: '100' };
const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
};

beforeEach(() => {
    jest.clearAllMocks();
    selected = mainnet;
    jest.mocked(NetworkService.getNetwork).mockImplementation(() => selected as any);
    jest.mocked(NetworkService.getNetworkId).mockImplementation(() => selected.networkId);
    jest.mocked(LedgerService.getAccountInfo).mockResolvedValue(info('1000000') as any);
    jest.mocked(LedgerService.getFilteredAccountLines).mockResolvedValue([]);
    jest.mocked(LedgerService.getAccountObligations).mockResolvedValue([]);
    jest.mocked(LedgerService.getAccountMPTFullDetails).mockResolvedValue([]);
    jest.mocked(BackendService.getAccountExtAssets).mockResolvedValue([]);
    jest.mocked(AccountRepository.updateDetails).mockResolvedValue({} as any);
    jest.mocked(AccountRepository.findOne).mockReturnValue({ address: ADDRESS, details: [] } as any);
    jest.mocked(CurrencyRepository.upsert).mockImplementation(async (currency) => currency as any);
});

it('discards account info that arrives after switching to another network', async () => {
    const pending = deferred<any>();
    jest.mocked(LedgerService.getAccountInfo).mockReturnValueOnce(pending.promise);
    const update = AccountService.updateAccountInfo(ADDRESS);
    selected = testnet;
    pending.resolve(info('765000000'));
    await update;
    expect(AccountRepository.updateDetails).not.toHaveBeenCalled();
});

it('discards token balances if the network changes while the lines are pending', async () => {
    const pending = deferred<any>();
    jest.mocked(LedgerService.getFilteredAccountLines).mockReturnValueOnce(pending.promise);
    const update = AccountService.updateAccountInfo(ADDRESS);
    await Promise.resolve();
    expect(LedgerService.getFilteredAccountLines).toHaveBeenCalledTimes(1);
    selected = testnet;
    pending.resolve([line]);
    await update;
    expect(AccountRepository.updateDetails).not.toHaveBeenCalled();
});

it('keeps the newest account response when older requests finish later', async () => {
    const older = deferred<any>();
    const newer = deferred<any>();
    jest.mocked(LedgerService.getAccountInfo).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const first = AccountService.updateAccountInfo(ADDRESS);
    const second = AccountService.updateAccountInfo(ADDRESS);
    newer.resolve(info('2000000'));
    await second;
    older.resolve(info('1000000'));
    await first;
    expect(AccountRepository.updateDetails).toHaveBeenCalledTimes(1);
    expect(jest.mocked(AccountRepository.updateDetails).mock.calls[0][1].balance).toBe(2);
});

it('gives the same issuer/currency distinct balance identities on different networks', async () => {
    jest.mocked(LedgerService.getFilteredAccountLines).mockResolvedValue([line] as any);
    const main = await AccountService.getNormalizedAccountLines(ADDRESS);
    selected = testnet;
    const test = await AccountService.getNormalizedAccountLines(ADDRESS);
    expect(main).toHaveLength(1);
    expect(test).toHaveLength(1);
    expect(main[0].id).not.toBe(test[0].id);
    expect(main[0].currency?.id).toBe(test[0].currency?.id);
});
