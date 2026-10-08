describe('ext-assets vs ledger balance refresh', () => {
    it('reproduces Promise.all aborting ledger results when ext-assets rejects', async () => {
        await expect(
            Promise.all([Promise.resolve(['line']), Promise.resolve(['mpt']), Promise.reject(new Error('ext-assets'))]),
        ).rejects.toThrow('ext-assets');
    });

    it('keeps ledger results when ext-assets is caught', async () => {
        const [lines, mpt, ext] = await Promise.all([
            Promise.resolve(['line']),
            Promise.resolve(['mpt']),
            Promise.reject(new Error('ext-assets')).catch(() => []),
        ]);

        expect(lines).toEqual(['line']);
        expect(mpt).toEqual(['mpt']);
        expect(ext).toEqual([]);
    });
});
