export type TransactionLoaderView = 'loading' | 'switch' | 'error' | 'none';

/** Loading, then the network switch, then the fetch error. */
export const transactionLoaderView = ({
    isLoading,
    requiresSwitchNetwork,
    error,
}: {
    isLoading: boolean;
    requiresSwitchNetwork: boolean;
    error: boolean;
}): TransactionLoaderView => {
    if (isLoading) {
        return 'loading';
    }
    if (requiresSwitchNetwork) {
        return 'switch';
    }
    if (error) {
        return 'error';
    }
    return 'none';
};
