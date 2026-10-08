import { extAssetsOrEmpty } from '../extAssetsOrEmpty';

describe('ext-assets vs ledger balance refresh', () => {
    it('keeps going with an empty list when ext-assets rejects', async () => {
        const warned: unknown[] = [];

        await expect(
            extAssetsOrEmpty(Promise.reject(new Error('ext-assets')), (error) => warned.push(error)),
        ).resolves.toEqual([]);
        expect(warned).toHaveLength(1);
    });

    it('returns the ext-assets list when the request succeeds', async () => {
        await expect(extAssetsOrEmpty(Promise.resolve(['line']))).resolves.toEqual(['line']);
    });
});
