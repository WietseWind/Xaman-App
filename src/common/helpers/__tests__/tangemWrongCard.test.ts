/**
 * The alert of the app for "this is not the card I asked for" (issue 564).
 */
import { Navigator } from '@common/helpers/navigator';
import LoggerService from '@services/LoggerService';
import Localize from '@locale';

import { showTangemWrongCard } from '../tangemWrongCard';

jest.mock('@common/helpers/navigator', () => ({ Navigator: { showAlertModal: jest.fn(async () => true) } }));
jest.mock('@services/LoggerService', () => ({ __esModule: true, default: { recordError: jest.fn() } }));

const realFs = jest.requireActual('fs');
const realPath = jest.requireActual('path');

beforeEach(() => jest.clearAllMocks());

describe('the "Different card" alert', () => {
    it('names the card the app asked for', () => {
        showTangemWrongCard('  Savings card ');
        expect(Navigator.showAlertModal).toHaveBeenCalledTimes(1);
        const alert = jest.mocked(Navigator.showAlertModal).mock.calls[0][0];
        expect(alert).toMatchObject({
            testID: 'tangem-wrong-card-alert',
            type: 'error',
            title: Localize.t('account.tangemDifferentCard'),
            text: Localize.t('account.tangemDifferentCardExplain', { name: 'Savings card' }),
        });
        expect(alert.text).toContain('“Savings card”');
        expect(alert.buttons).toHaveLength(1);
    });

    it.each([undefined, '', '   '])('without a name (%p) it says how to scan, and names no card', (name) => {
        showTangemWrongCard(name);
        const alert = jest.mocked(Navigator.showAlertModal).mock.calls[0][0];
        expect(alert.title).toBe(Localize.t('account.tangemDifferentCard'));
        expect(alert.text).toBe(Localize.t('account.tangemScanHint'));
    });

    it('an alert that cannot be shown is recorded, not thrown', async () => {
        jest.mocked(Navigator.showAlertModal).mockRejectedValueOnce(new Error('no overlay'));
        expect(() => showTangemWrongCard('Card')).not.toThrow();
        await Promise.resolve();
        await Promise.resolve();
        expect(LoggerService.recordError).toHaveBeenCalledTimes(1);
    });
});

describe('the text of the alert in every language', () => {
    const dir = realPath.resolve(__dirname, '../../../locale');
    const files = [
        realPath.join(dir, 'en.json'),
        ...realFs
            .readdirSync(realPath.join(dir, 'translations'))
            .filter((file: string) => file.endsWith('.json'))
            .map((file: string) => realPath.join(dir, 'translations', file)),
    ];

    it('is there, and has the name of the card exactly once', () => {
        expect(files.length).toBeGreaterThan(50);
        for (const file of files) {
            const text = JSON.parse(realFs.readFileSync(file, 'utf8')).account?.tangemDifferentCardExplain;
            const ok = typeof text === 'string' && text.split('%{name}').length === 2;
            expect({ file: realPath.basename(file), ok }).toEqual({ file: realPath.basename(file), ok: true });
        }
    });
});
