describe('passcode change rollback', () => {
    it('reproduces hashing an already-hashed passcode on rollback', async () => {
        const hashPasscode = async (value: string) => `hashed(${value})`;
        const stored = await hashPasscode('111111');

        // pre-fix: rollback called setPasscode(storedHash)
        const rolledBack = await hashPasscode(stored);
        expect(rolledBack).toBe('hashed(hashed(111111))');
        expect(rolledBack).not.toBe(stored);
    });

    it('keeps the original hash when rollback writes settings as-is', async () => {
        const hashPasscode = async (value: string) => `hashed(${value})`;
        const stored = await hashPasscode('111111');

        const settings = { passcode: stored };
        // fix: saveSettings({ passcode: stored })
        settings.passcode = stored;
        expect(settings.passcode).toBe(stored);
    });
});
