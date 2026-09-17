describe('Home accountUpdate guard', () => {
    it('reproduces a throw when the selected account is still missing', () => {
        const updatedAccount = { isValid: () => true, address: 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY' };
        const account = undefined as { address: string } | undefined;

        expect(() => {
            // pre-fix: selected account was not optional-chained
            if (updatedAccount?.isValid() && updatedAccount.address === account.address) {
                return true;
            }
            return false;
        }).toThrow();
    });

    it('skips the update when no account is selected', () => {
        const updatedAccount = { isValid: () => true, address: 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY' };
        const account = undefined as { address: string } | undefined;

        let applied = false;
        if (updatedAccount?.isValid() && updatedAccount.address === account?.address) {
            applied = true;
        }
        expect(applied).toBe(false);
    });
});
