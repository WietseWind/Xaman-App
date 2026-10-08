import { readFileSync } from 'fs';
import { join } from 'path';

import { runSetRootOnce, setRootLatch } from '../setRootLatch';

const navigatorSource = readFileSync(join(__dirname, '../navigator.ts'), 'utf8');

describe('startDefault setRoot latch', () => {
    beforeEach(() => {
        setRootLatch.current = false;
    });

    it('blocks a second call while the first setRoot is still latched', async () => {
        const setRootFn = jest.fn().mockResolvedValue(undefined);

        await runSetRootOnce(setRootFn);
        await runSetRootOnce(setRootFn);

        expect(setRootFn).toHaveBeenCalledTimes(1);
        expect(setRootLatch.current).toBe(true);
        expect(navigatorSource).toContain('await runSetRootOnce(async () => {');
    });

    it('clears the latch when setRoot rejects so a later call can retry', async () => {
        const setRootFn = jest.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce(undefined);

        await expect(runSetRootOnce(setRootFn)).rejects.toThrow('fail');
        expect(setRootLatch.current).toBe(false);

        await runSetRootOnce(setRootFn);
        expect(setRootFn).toHaveBeenCalledTimes(2);
        expect(setRootLatch.current).toBe(true);
    });
});
