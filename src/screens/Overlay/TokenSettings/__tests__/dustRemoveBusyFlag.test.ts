describe('dust remove busy flag', () => {
    it('reproduces leaving isRemoving true when only the success path resets it', () => {
        let isRemoving = false;

        const success = () => {
            isRemoving = false;
        };

        const clearDust = (shouldThrow: boolean) => {
            isRemoving = true;
            try {
                if (shouldThrow) {
                    throw new Error('issuer lookup failed');
                }
                success();
            } catch {
                // pre-fix: alert only
            }
        };

        clearDust(true);
        expect(isRemoving).toBe(true);

        isRemoving = false;
        const clearDustFixed = (shouldThrow: boolean) => {
            isRemoving = true;
            try {
                if (shouldThrow) {
                    throw new Error('issuer lookup failed');
                }
                success();
            } catch {
                isRemoving = false;
            }
        };

        clearDustFixed(true);
        expect(isRemoving).toBe(false);
    });
});
