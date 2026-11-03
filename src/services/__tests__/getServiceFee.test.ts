import ApiService from '../ApiService';
import BackendService from '../BackendService';
import NetworkService from '../NetworkService';

describe('getServiceFee timer', () => {
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('clears the timeout when the fee request succeeds', async () => {
        jest.useFakeTimers();
        jest.replaceProperty(NetworkService, 'network', { key: 'MAINNET' } as any);
        jest.spyOn(ApiService, 'fetch').mockResolvedValue({
            availableFees: [{ type: 'LOW', value: '12' }],
            feeHooks: 0,
            feePercentage: 0,
            suggested: 'LOW',
        });

        const resultPromise = BackendService.getServiceFee({ Account: 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY' });
        await resultPromise;

        expect(jest.getTimerCount()).toBe(0);
    });
});
