import Localize from '@locale';

describe('5.4.0 warning copy', () => {
    it('says account removal only removes the copy on this device', () => {
        const warning = Localize.t('account.accountRemoveWarning');

        expect(warning).toContain('removed from this device');
        expect(warning).toContain('re-import');
        expect(warning).not.toContain('deleted permanently');
    });

    it('tells a Tangem card account it can be added again with the same card', () => {
        const warning = Localize.t('account.accountRemoveTangemWarning');

        expect(warning).toContain('removed from this device');
        expect(warning).toContain('add a new account');
        expect(warning).toContain('Tangem card');
        expect(warning).toContain('same card');
        expect(warning).not.toContain('account secret');
    });

    it('warns that the destination is not currently active, without the cut-off sentence', () => {
        const warning = Localize.t('send.destinationNotExistCreationWarning', {
            nativeAsset: 'XAH',
            baseReserve: '1',
            amount: '10',
        });

        expect(warning).toContain('not currently active on the ledger');
        expect(warning).toContain('It has no balance');
        expect(warning).not.toContain('has never been used');
        expect(warning).not.toContain('aware of the risks');
    });
});
