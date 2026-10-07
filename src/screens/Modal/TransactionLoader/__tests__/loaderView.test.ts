const loaderView = ({
    isLoading,
    requiresSwitchNetwork,
    error,
}: {
    isLoading: boolean;
    requiresSwitchNetwork: boolean;
    error: boolean;
}) => {
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

describe('TransactionLoader view priority', () => {
    it('reproduces showing the network-switch screen instead of a fetch error', () => {
        expect(
            loaderView({
                isLoading: false,
                requiresSwitchNetwork: true,
                error: true,
            }),
        ).toBe('switch');
    });

    it('shows the error once the switch flag is cleared', () => {
        expect(
            loaderView({
                isLoading: false,
                requiresSwitchNetwork: false,
                error: true,
            }),
        ).toBe('error');
    });
});
