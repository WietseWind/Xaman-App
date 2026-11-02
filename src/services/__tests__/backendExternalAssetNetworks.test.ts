import BackendService from '../BackendService';
import ApiService from '../ApiService';
import NetworkService from '../NetworkService';

jest.mock('@services/ApiService', () => ({ __esModule: true, default: { fetch: jest.fn() } }));
jest.mock('@services/NetworkService', () => ({ __esModule: true, default: {
    getConnectionDetails: jest.fn(), getNetwork: jest.fn(),
} }));
jest.mock('@services/LoggerService', () => ({ __esModule: true, default: {
    createLogger: () => ({ debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
} }));

const ADDRESS = 'rPublicNetworkIsolation';
const asset = { account: 'Doppler Finance', currency: 'Doppler XRP', balance: '765.769494',
    limit_peer: 'DOPPLER_FIN|{"xApp":"doppler.xrpfi"}', order: -8998 };
let key = 'MAINNET';

beforeEach(() => {
    jest.clearAllMocks();
    key = 'MAINNET';
    jest.mocked(NetworkService.getConnectionDetails).mockImplementation(() => ({ networkKey: key } as any));
    jest.mocked(NetworkService.getNetwork).mockImplementation(() => ({ key } as any));
    jest.mocked(ApiService.fetch).mockResolvedValue({ account: ADDRESS, network: 'MAINNET', assets: [asset] });
});

it('retains Mainnet holdings and their launch metadata', async () => {
    const lines = await BackendService.getAccountExtAssets(ADDRESS);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ ...asset, limit: '-9999999999' });
    expect(ApiService.fetch).toHaveBeenCalledTimes(1);
});

it.each(['TESTNET', 'DEVNET', 'XAHAU', 'XAHAUTESTNET', 'CUSTOM'])(
    'does not fetch or expose Mainnet external holdings on %s', async (network) => {
        key = network;
        expect(await BackendService.getAccountExtAssets(ADDRESS)).toEqual([]);
        expect(ApiService.fetch).not.toHaveBeenCalled();
    },
);

it('discards a Mainnet external response after switching networks', async () => {
    let finish!: (value: unknown) => void;
    jest.mocked(ApiService.fetch).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const pending = BackendService.getAccountExtAssets(ADDRESS);
    key = 'TESTNET';
    finish({ account: ADDRESS, network: 'MAINNET', assets: [asset] });
    expect(await pending).toEqual([]);
});

it('rejects a response explicitly labeled for another network', async () => {
    jest.mocked(ApiService.fetch).mockResolvedValueOnce({ account: ADDRESS, network: 'TESTNET', assets: [asset] });
    expect(await BackendService.getAccountExtAssets(ADDRESS)).toEqual([]);
});
