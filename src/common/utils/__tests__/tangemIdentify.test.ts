import { AccountTypes } from '@store/types';

import { identifyScannedTangemSerial } from '../tangemIdentify';

const tangem = (address: string, cardId: string, label = address) => ({
    address,
    label,
    type: AccountTypes.Tangem,
    additionalInfo: { cardId },
});

describe('identifyScannedTangemSerial', () => {
    const accounts = [
        tangem('rSelected', 'AAA', 'Selected'),
        tangem('rOther', 'BBB', 'Travel'),
        { address: 'rRegular', label: 'Cash', type: AccountTypes.Regular },
    ];

    it('accepts the card whose serial matches the selected account', () => {
        expect(identifyScannedTangemSerial('AAA', 'AAA', accounts)).toEqual({ outcome: 'match' });
    });

    it('names another imported account when the serial belongs to that card', () => {
        expect(identifyScannedTangemSerial('BBB', 'AAA', accounts)).toEqual({
            outcome: 'known',
            account: accounts[1],
        });
    });

    it('says the card is new when no imported account has that serial', () => {
        expect(identifyScannedTangemSerial('CCC', 'AAA', accounts)).toEqual({ outcome: 'unknown' });
    });
});
