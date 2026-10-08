describe('startDefault setRoot latch', () => {
    it('reproduces blocking later retries after a rejected setRoot', async () => {
        let latched = false;
        const setRootFn = jest.fn().mockRejectedValue(new Error('fail'));

        const start = async () => {
            if (!latched) {
                latched = true;
                await setRootFn();
            }
        };

        await expect(start()).rejects.toThrow('fail');
        await start();
        expect(setRootFn).toHaveBeenCalledTimes(1);
    });

    it('allows a retry when the latch is cleared on rejection', async () => {
        let latched = false;
        const setRootFn = jest.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce(undefined);

        const start = async () => {
            if (!latched) {
                latched = true;
                try {
                    await setRootFn();
                } catch (error) {
                    latched = false;
                    throw error;
                }
            }
        };

        await expect(start()).rejects.toThrow('fail');
        await start();
        expect(setRootFn).toHaveBeenCalledTimes(2);
    });
});
