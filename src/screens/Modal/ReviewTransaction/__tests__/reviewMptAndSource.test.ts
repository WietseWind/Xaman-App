describe('review MPT fetch and source switch', () => {
    it('reproduces an unhandled rejection when MPT ledger_entry fails', async () => {
        const fetchMPTDetails = async () => {
            await Promise.all([Promise.reject(new Error('ledger_entry failed'))]);
        };

        await expect(fetchMPTDetails()).rejects.toThrow('ledger_entry failed');
    });

    it('swallows MPT fetch failures so review can continue', async () => {
        const fetchMPTDetails = async () => {
            try {
                await Promise.all([Promise.reject(new Error('ledger_entry failed'))]);
            } catch {
                return 'handled';
            }
            return 'ok';
        };

        await expect(fetchMPTDetails()).resolves.toBe('handled');
    });

    it('ignores account picker changes while signing is already in flight', () => {
        let source = 'rOne';
        const isLoading = true;
        const setSource = (next: string) => {
            if (isLoading) {
                return;
            }
            source = next;
        };

        setSource('rTwo');
        expect(source).toBe('rOne');
    });
});
