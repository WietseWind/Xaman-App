import { AccountTypes } from '@store/types';

import { identifyScannedTangemSerial, tangemIdentifySessionLog } from '../tangemIdentify';

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

    it('writes a session line for each finding', () => {
        const base = {
            lookingForSerial: 'AAA',
            lookingForAddress: 'rSelected',
            scannedSerial: 'AAA',
            scannedAddress: 'rSelected',
        };

        expect(
            tangemIdentifySessionLog({
                ...base,
                outcome: { outcome: 'match' },
            }),
        ).toBe('Identify Tangem card: looking for AAA rSelected, scanned: AAA rSelected = Correct card');

        expect(
            tangemIdentifySessionLog({
                ...base,
                scannedSerial: 'BBB',
                scannedAddress: 'rOther',
                outcome: { outcome: 'known', account: accounts[1] },
            }),
        ).toBe(
            'Identify Tangem card: looking for AAA rSelected, ' +
                'scanned: BBB rOther = In Xaman, different card: Travel rOther',
        );

        expect(
            tangemIdentifySessionLog({
                ...base,
                scannedSerial: 'CCC',
                scannedAddress: 'rNew',
                outcome: { outcome: 'unknown' },
            }),
        ).toBe('Identify Tangem card: looking for AAA rSelected, scanned: CCC rNew = Not in Xaman');
    });
});
