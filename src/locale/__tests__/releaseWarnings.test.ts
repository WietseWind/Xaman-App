import Localize from '@locale';

describe('5.4.0 warning copy', () => {
    it('says account removal only removes the copy on this device', () => {
        const warning = Localize.t('account.accountRemoveWarning');

        expect(warning).toContain('removed from this device');
        expect(warning).toContain('re-import');
        expect(warning).not.toContain('deleted permanently');
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
