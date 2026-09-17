describe('PayID lookup result timing', () => {
    it('reproduces publishing before async payid enrichment finishes', async () => {
        const searchResult: string[] = [];
        const matches = [{ source: 'payid', account: 'r1', alias: 'alice' }];

        matches.forEach(async (element: { source: string; account: string; alias: string }) => {
            if (element.source === 'payid') {
                await Promise.resolve();
                searchResult.push(element.alias);
            }
        });

        expect(searchResult).toEqual([]);
        await Promise.resolve();
        await Promise.resolve();
        expect(searchResult).toEqual(['alice']);
    });

    it('publishes only after payid enrichment when matches are awaited', async () => {
        const searchResult: string[] = [];
        const matches = [{ source: 'payid', account: 'r1', alias: 'alice' }];

        for (const element of matches) {
            if (element.source === 'payid') {
                await Promise.resolve();
                searchResult.push(element.alias);
            }
        }

        expect(searchResult).toEqual(['alice']);
    });
});
