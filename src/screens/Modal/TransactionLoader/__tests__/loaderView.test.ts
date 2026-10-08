import { readFileSync } from 'fs';
import { join } from 'path';

import { transactionLoaderView } from '../loaderView';

const loaderModal = readFileSync(join(__dirname, '../TransactionLoaderModal.tsx'), 'utf8');

describe('TransactionLoader view priority', () => {
    it('shows the network switch ahead of a fetch error while the switch is still required', () => {
        expect(
            transactionLoaderView({
                isLoading: false,
                requiresSwitchNetwork: true,
                error: true,
            }),
        ).toBe('switch');
        expect(loaderModal).toContain('transactionLoaderView({ isLoading, requiresSwitchNetwork, error })');
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
