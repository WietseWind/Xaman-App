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

describe('IconAccessibilityLabel', () => {
    it('names icon-only buttons after what they do', () => {
        // eslint-disable-next-line global-require
        const { IconAccessibilityLabel } = require('../accessibility');

        expect(IconAccessibilityLabel('IconChevronLeft')).toBe(Localize.t('global.back'));
        expect(IconAccessibilityLabel('IconX')).toBe(Localize.t('global.close'));
        expect(IconAccessibilityLabel('IconMoreHorizontal')).toBe(Localize.t('accessibility.moreOptions'));
        expect(IconAccessibilityLabel('IconSomethingNew')).toBeUndefined();
        expect(IconAccessibilityLabel(undefined)).toBeUndefined();
    });
});

describe('AddressAccessibilityProps', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('reads the start and end, and spells out the whole address on request', () => {
        // eslint-disable-next-line global-require
        const { AddressAccessibilityProps } = require('../accessibility');
        const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

        const props = AddressAccessibilityProps('rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY');

        expect(props.accessible).toBe(true);
        expect(props.accessibilityLabel).toBe('Address starting with r P E P P, ending with 6 G D Y');
        expect(props.accessibilityActions).toEqual([{ name: 'spellOut', label: 'Spell out the full address' }]);

        props.onAccessibilityAction({ nativeEvent: { actionName: 'spellOut' } });
        expect(announce).toHaveBeenCalledWith('r P E P P E R 7 k f T D 9 w 2 T o 4 C Q k 6 U C f u H M 9 c 6 G D Y');
    });

    it('adds nothing without an address', () => {
        // eslint-disable-next-line global-require
        const { AddressAccessibilityProps } = require('../accessibility');

        expect(AddressAccessibilityProps(undefined)).toEqual({});
    });
});
