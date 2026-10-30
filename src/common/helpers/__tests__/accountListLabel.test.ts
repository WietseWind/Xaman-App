import { AccountTypes } from '@store/types';

import { accountLabelSortKey, accountListLabel, compareAccountLabels } from '../accountListLabel';

describe('accountListLabel', () => {
    it('leaves a normal account label unchanged', () => {
        expect(accountListLabel({ type: AccountTypes.Regular, label: 'Savings' })).toBe('Savings');
    });

    it('shows a card before a Tangem label that does not already have one', () => {
        expect(accountListLabel({ type: AccountTypes.Tangem, label: 'Travel' })).toBe('💳 Travel');
    });

    it('does not add a second card when the label already contains one', () => {
        expect(accountListLabel({ type: AccountTypes.Tangem, label: '💳 Travel' })).toBe('💳 Travel');
        expect(accountListLabel({ type: AccountTypes.Tangem, label: 'Travel 💳' })).toBe('Travel 💳');
    });

    it('sorts a leading card emoji with the first letter after it', () => {
        expect(accountLabelSortKey('💳 Zulu')).toBe('Zulu');
        expect(accountLabelSortKey('💳Zulu')).toBe('Zulu');
        expect(compareAccountLabels('💳 Zulu', 'Alpha')).toBeGreaterThan(0);
        expect(compareAccountLabels('Alpha', '💳 Beta')).toBeLessThan(0);
        expect(compareAccountLabels('💳 Zulu', 'Zulu')).toBe(0);
    });
});
