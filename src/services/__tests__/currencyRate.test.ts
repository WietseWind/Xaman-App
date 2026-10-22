import BackendService from '@services/BackendService';
import ApiService from '@services/ApiService';
import NetworkService from '@services/NetworkService';

import { Endpoints } from '@common/constants/endpoints';

jest.mock('@services/NetworkService');

const rateResponse = (prices: { [asset: string]: number }) => ({
    ...prices,
    __meta: {
        currency: {
            symbol: '$',
            code: 'USD',
        },
    },
});

const useNetwork = (key: string, asset: string) => {
    jest.spyOn(NetworkService, 'getNativeAsset').mockReturnValue(asset);
    jest.spyOn(NetworkService, 'getNetwork').mockReturnValue({ key });
};

describe('BackendService.getCurrencyRate', () => {
    beforeEach(() => {
        BackendService.onNetworkChange();
        jest.restoreAllMocks();
    });

    it('reads the native asset captured when the request started', async () => {
        useNetwork('XAHAU', 'XAH');

        let resolveFetch: (value: ReturnType<typeof rateResponse>) => void = () => undefined;
        const fetchSpy = jest.spyOn(ApiService, 'fetch').mockReturnValue(
            new Promise((resolve) => {
                resolveFetch = resolve;
            }),
        );

        const pending = BackendService.getCurrencyRate('USD');

        expect(fetchSpy).toHaveBeenCalledWith(Endpoints.Rates, 'GET', { currency: 'USD' }, undefined, {
            'Cache-Control': 'no-cache',
            'X-Xaman-Net': 'XAHAU',
        });

        // Switch before the Xahau response arrives. The in-flight result must stay the XAH price.
        useNetwork('MAINNET', 'XRP');
        resolveFetch(rateResponse({ XAH: 0.01, XRP: 2.5 }));

        await expect(pending).resolves.toMatchObject({ rate: 0.01, code: 'USD', symbol: '$' });

        fetchSpy.mockResolvedValue(rateResponse({ XAH: 0.01, XRP: 2.5 }));
        await expect(BackendService.getCurrencyRate('USD')).resolves.toMatchObject({ rate: 2.5 });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(fetchSpy).toHaveBeenLastCalledWith(Endpoints.Rates, 'GET', { currency: 'USD' }, undefined, {
            'Cache-Control': 'no-cache',
            'X-Xaman-Net': 'MAINNET',
        });
    });

    it('does not reuse a rate from another network that shares the native asset code', async () => {
        const fetchSpy = jest.spyOn(ApiService, 'fetch').mockResolvedValue(rateResponse({ XAH: 0.02 }));

        useNetwork('XAHAU', 'XAH');
        await expect(BackendService.getCurrencyRate('USD')).resolves.toMatchObject({ rate: 0.02 });

        fetchSpy.mockResolvedValue(rateResponse({ XAH: 0.9 }));
        useNetwork('XAHAUTESTNET', 'XAH');
        await expect(BackendService.getCurrencyRate('USD')).resolves.toMatchObject({ rate: 0.9 });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('drops the cached rate when the network changes', async () => {
        useNetwork('MAINNET', 'XRP');
        const fetchSpy = jest.spyOn(ApiService, 'fetch').mockResolvedValue(rateResponse({ XRP: 2.5 }));

        await BackendService.getCurrencyRate('USD');
        await BackendService.getCurrencyRate('USD');
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        BackendService.onNetworkChange();

        await BackendService.getCurrencyRate('USD');
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
});
