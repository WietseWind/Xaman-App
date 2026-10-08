import { runSetRootOnce } from '../setRootLatch';

describe('startDefault setRoot latch', () => {
    it('blocks a second call while the first setRoot is still latched', async () => {
        const latch = { current: false };
        const setRootFn = jest.fn().mockResolvedValue(undefined);

        await runSetRootOnce(setRootFn, latch);
        await runSetRootOnce(setRootFn, latch);

        expect(setRootFn).toHaveBeenCalledTimes(1);
        expect(latch.current).toBe(true);
    });

    it('clears the latch when setRoot rejects so a later call can retry', async () => {
        const latch = { current: false };
        const setRootFn = jest.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce(undefined);

        await expect(runSetRootOnce(setRootFn, latch)).rejects.toThrow('fail');
        expect(latch.current).toBe(false);

        await runSetRootOnce(setRootFn, latch);
        expect(setRootFn).toHaveBeenCalledTimes(2);
        expect(latch.current).toBe(true);
    });
});
