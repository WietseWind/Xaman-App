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

const deferredRate = () => {
    let resolve: (value: ReturnType<typeof rateResponse>) => void = () => undefined;
    let reject: (reason: Error) => void = () => undefined;
    const promise = new Promise<ReturnType<typeof rateResponse>>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

describe('BackendService.getCurrencyRate', () => {
    beforeEach(() => {
        BackendService.onNetworkChange();
        jest.restoreAllMocks();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('shares one pending request across 25 consumers and updates every consumer', async () => {
        useNetwork('MAINNET', 'XRP');
        const response = deferredRate();
        const fetchSpy = jest.spyOn(ApiService, 'fetch').mockReturnValue(response.promise);
        const updates = Array.from({ length: 25 }, () => jest.fn());
        const consumers = updates.map((update) => BackendService.getCurrencyRate('USD').then(update));

        const requestCount = fetchSpy.mock.calls.length;
        response.resolve(rateResponse({ XRP: 2.5 }));
        await Promise.all(consumers);

        expect(requestCount).toBe(1);
        updates.forEach((update) => {
            expect(update).toHaveBeenCalledTimes(1);
            expect(update).toHaveBeenCalledWith(expect.objectContaining({ rate: 2.5, code: 'USD', symbol: '$' }));
        });
        await BackendService.getCurrencyRate('USD');
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps pending requests separate for different fiat currencies', async () => {
        useNetwork('MAINNET', 'XRP');
        const usd = deferredRate();
        const eur = deferredRate();
        const fetchSpy = jest.spyOn(ApiService, 'fetch')
            .mockReturnValueOnce(usd.promise).mockReturnValueOnce(eur.promise);
        const first = BackendService.getCurrencyRate('USD');
        const second = BackendService.getCurrencyRate('EUR');
        usd.resolve(rateResponse({ XRP: 2.5 }));
        eur.resolve(rateResponse({ XRP: 2.3 }));
        await expect(first).resolves.toMatchObject({ rate: 2.5, code: 'USD' });
        await expect(second).resolves.toMatchObject({ rate: 2.3, code: 'EUR' });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it.each([
        ['XAHAUTESTNET', 'XAH'],
        ['XAHAU', 'XRP'],
    ])('separates pending requests by network and native asset (%s / %s)', async (key, asset) => {
        const oldResponse = deferredRate();
        const nextResponse = deferredRate();
        const fetchSpy = jest.spyOn(ApiService, 'fetch')
            .mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(nextResponse.promise);
        useNetwork('XAHAU', 'XAH');
        const first = BackendService.getCurrencyRate('USD');
        useNetwork(key, asset);
        const second = BackendService.getCurrencyRate('USD');
        oldResponse.resolve(rateResponse({ XAH: 0.01, XRP: 2.5 }));
        nextResponse.resolve(rateResponse({ XAH: 0.02, XRP: 2.6 }));
        await expect(first).resolves.toMatchObject({ rate: 0.01 });
        await expect(second).resolves.toMatchObject({ rate: asset === 'XAH' ? 0.02 : 2.6 });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('rejects every waiting consumer on failure and permits a new request', async () => {
        useNetwork('MAINNET', 'XRP');
        const response = deferredRate();
        const fetchSpy = jest.spyOn(ApiService, 'fetch').mockReturnValue(response.promise);
        const first = BackendService.getCurrencyRate('USD');
        const second = BackendService.getCurrencyRate('USD');
        const results = Promise.allSettled([first, second]);
        const error = new Error('Offline');
        response.reject(error);
        expect(await results).toEqual([
            { status: 'rejected', reason: error },
            { status: 'rejected', reason: error },
        ]);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        fetchSpy.mockResolvedValue(rateResponse({ XRP: 2.5 }));
        await expect(BackendService.getCurrencyRate('USD')).resolves.toMatchObject({ rate: 2.5 });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('keeps the existing 60-second cache lifetime and shares the refresh after expiry', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        useNetwork('MAINNET', 'XRP');
        const fetchSpy = jest.spyOn(ApiService, 'fetch').mockResolvedValue(rateResponse({ XRP: 2.5 }));
        await BackendService.getCurrencyRate('USD');
        jest.advanceTimersByTime(60_000);
        await BackendService.getCurrencyRate('USD');
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(1_000);
        const response = deferredRate();
        fetchSpy.mockReturnValue(response.promise);
        const first = BackendService.getCurrencyRate('USD');
        const second = BackendService.getCurrencyRate('USD');
        response.resolve(rateResponse({ XRP: 2.6 }));
        await expect(first).resolves.toMatchObject({ rate: 2.6 });
        await expect(second).resolves.toMatchObject({ rate: 2.6 });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it.each([true, false])(
        'does not let an old request replace or remove the request after switching away and back (old first: %s)',
        async (oldFirst) => {
            useNetwork('MAINNET', 'XRP');
            const oldResponse = deferredRate();
            const nextResponse = deferredRate();
            const fetchSpy = jest.spyOn(ApiService, 'fetch')
                .mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(nextResponse.promise);
            const first = BackendService.getCurrencyRate('USD');
            useNetwork('XAHAU', 'XAH');
            BackendService.onNetworkChange();
            useNetwork('MAINNET', 'XRP');
            BackendService.onNetworkChange();
            const current = BackendService.getCurrencyRate('USD');

            if (oldFirst) {
                oldResponse.resolve(rateResponse({ XRP: 1 }));
                await expect(first).resolves.toMatchObject({ rate: 1 });
            } else {
                nextResponse.resolve(rateResponse({ XRP: 2.5 }));
                await current;
                oldResponse.resolve(rateResponse({ XRP: 1 }));
                await first;
            }
            const anotherConsumer = BackendService.getCurrencyRate('USD');
            nextResponse.resolve(rateResponse({ XRP: 2.5 }));
            await expect(current).resolves.toMatchObject({ rate: 2.5 });
            await expect(anotherConsumer).resolves.toMatchObject({ rate: 2.5 });
            await expect(BackendService.getCurrencyRate('USD')).resolves.toMatchObject({ rate: 2.5 });
            expect(fetchSpy).toHaveBeenCalledTimes(2);
        },
    );

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
