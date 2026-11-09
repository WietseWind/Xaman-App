import { AccessibilityInfo, Alert } from 'react-native';

import Localize from '@locale';

import { WarnSecretReadAloud } from '../accessibility';

describe('WarnSecretReadAloud', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('asks for headphones when a screen reader is on', async () => {
        jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
        const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

        await WarnSecretReadAloud();

        expect(alert).toHaveBeenCalledTimes(1);
        expect(alert).toHaveBeenCalledWith(
            Localize.t('global.warning'),
            Localize.t('account.secretReadAloudWarning'),
        );
    });

    it('says nothing without a screen reader', async () => {
        jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
        const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

        await WarnSecretReadAloud();

        expect(alert).not.toHaveBeenCalled();
    });

    it('says nothing when the screen reader state is unknown', async () => {
        jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockRejectedValue(new Error('no module'));
        const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

        await WarnSecretReadAloud();

        expect(alert).not.toHaveBeenCalled();
    });
});
