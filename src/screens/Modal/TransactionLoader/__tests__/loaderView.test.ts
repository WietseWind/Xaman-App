import { transactionLoaderView } from '../loaderView';

describe('TransactionLoader view priority', () => {
    it('shows the network switch ahead of a fetch error while the switch is still required', () => {
        expect(
            transactionLoaderView({
                isLoading: false,
                requiresSwitchNetwork: true,
                error: true,
            }),
        ).toBe('switch');
    });

    it('shows the error once the switch flag is cleared', () => {
        expect(
            transactionLoaderView({
                isLoading: false,
                requiresSwitchNetwork: false,
                error: true,
            }),
        ).toBe('error');
    });

    it('shows the loader while a fetch is in flight', () => {
        expect(
            transactionLoaderView({
                isLoading: true,
                requiresSwitchNetwork: false,
                error: true,
            }),
        ).toBe('loading');
    });
});
