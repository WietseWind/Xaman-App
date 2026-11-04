import { DEGEN_DONE, DEGEN_FLAG, degenVaultName, getDegenInfo } from '../degenSecret';

describe('getDegenInfo', () => {
    it('reads the flag, records of older versions, and everything else as none', () => {
        expect(getDegenInfo(DEGEN_FLAG)).toEqual({ kind: 'vault' });
        expect(getDegenInfo('{"degenMode":"123456.234567"}')).toEqual({
            kind: 'legacy',
            secretNumbers: '123456.234567',
        });
        expect(getDegenInfo(DEGEN_DONE)).toEqual({ kind: 'none' });
        expect(getDegenInfo(undefined)).toEqual({ kind: 'none' });
        expect(getDegenInfo('')).toEqual({ kind: 'none' });
        expect(getDegenInfo('{"degenMode":""}')).toEqual({ kind: 'none' });
        expect(getDegenInfo('{"degenMode":false}')).toEqual({ kind: 'none' });
        expect(getDegenInfo('{"degenMode":true}')).toEqual({ kind: 'none' });
        expect(getDegenInfo('{"degenVault":"yes"}')).toEqual({ kind: 'none' });
        expect(getDegenInfo('{"degenMode":broken')).toEqual({ kind: 'none' });
        expect(getDegenInfo('{"cardId":"CB79000000018201"}')).toEqual({ kind: 'none' });
    });

    it('hides the flag from the banner check of older builds, which cannot read the vault', () => {
        // older builds show the banner when the record starts with this, and split the value
        expect(DEGEN_FLAG.startsWith('{"degenMode":')).toBe(false);
        expect(getDegenInfo(DEGEN_FLAG)).toEqual({ kind: 'vault' });
    });

    it('names the vault entry after the public key', () => {
        expect(degenVaultName('02ABC')).toBe('02ABC_DEGEN');
    });
});
