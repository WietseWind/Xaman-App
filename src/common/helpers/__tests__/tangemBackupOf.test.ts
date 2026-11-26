/**
 * Which accounts a Tangem card is the back-up card of (issue 550).
 */
import { accountsBackedUpBy } from '../tangemBackupOf';

const PRIMARY = { address: 'rPrimary', regularKey: 'rBackup', type: 'Tangem', label: 'Primary card' };
const BACKUP = { address: 'rBackup', regularKey: undefined, type: 'Tangem', label: 'Backup card' };
const OTHER = { address: 'rOther', regularKey: 'rElse', type: 'Tangem', label: 'Other card' };
const REGULAR = { address: 'rRegular', regularKey: 'rBackup', type: 'Regular', label: 'Not a card' };

describe('accountsBackedUpBy', () => {
    it('finds the original card of a back-up card', () => {
        expect(accountsBackedUpBy(BACKUP, [PRIMARY, BACKUP, OTHER])).toEqual([PRIMARY]);
    });

    it('a card that is no back-up card has none', () => {
        expect(accountsBackedUpBy(PRIMARY, [PRIMARY, BACKUP, OTHER])).toEqual([]);
        expect(accountsBackedUpBy(OTHER, [PRIMARY, BACKUP, OTHER])).toEqual([]);
    });

    it('a card can be the back-up card of more than one card', () => {
        const second = { ...OTHER, regularKey: 'rBackup' };
        expect(accountsBackedUpBy(BACKUP, [PRIMARY, second])).toEqual([PRIMARY, second]);
    });

    it('only Tangem accounts count, and never the card itself', () => {
        const self = { address: 'rBackup', regularKey: 'rBackup', type: 'Tangem' };
        expect(accountsBackedUpBy(BACKUP, [REGULAR, self])).toEqual([]);
    });

    it('nothing known: nothing found', () => {
        expect(accountsBackedUpBy(undefined, [PRIMARY])).toEqual([]);
        expect(accountsBackedUpBy({ address: '' }, [PRIMARY])).toEqual([]);
        expect(accountsBackedUpBy(BACKUP, undefined)).toEqual([]);
        expect(accountsBackedUpBy(BACKUP, [])).toEqual([]);
    });

    it('takes a list that is no plain array (the result of the database)', () => {
        const results = { 0: PRIMARY, 1: OTHER, length: 2 };
        expect(accountsBackedUpBy(BACKUP, results)).toEqual([PRIMARY]);
    });
});
