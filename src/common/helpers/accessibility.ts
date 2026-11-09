import { AccessibilityActionEvent, AccessibilityInfo, Alert } from 'react-native';

import Localize from '@locale';

/**
 * Call when a screen that shows or takes a secret opens. A screen reader reads the secret out
 * loud, so ask for headphones first. Does nothing when no screen reader is on.
 *
 * Never put a secret in an announcement: on Android every accessibility service receives them.
 */
const WarnSecretReadAloud = async (): Promise<void> => {
    let screenReaderEnabled = false;

    try {
        screenReaderEnabled = await AccessibilityInfo.isScreenReaderEnabled();
    } catch {
        // can't tell: say nothing, as before
    }

    if (screenReaderEnabled) {
        Alert.alert(Localize.t('global.warning'), Localize.t('account.secretReadAloudWarning'));
    }
};

/**
 * What screen readers call a button that only shows an icon. Buttons with text of their own
 * are read by that text; an icon without an entry here stays unnamed, as before.
 */
const ICON_LABELS: { [icon: string]: () => string } = {
    IconChevronLeft: () => Localize.t('global.back'),
    IconX: () => Localize.t('global.close'),
    IconPlus: () => Localize.t('global.add'),
    IconEdit: () => Localize.t('global.edit'),
    IconInfo: () => Localize.t('global.info'),
    IconShare: () => Localize.t('global.share'),
    IconFilter: () => Localize.t('global.filter'),
    IconScan: () => Localize.t('global.scanAQRCode'),
    IconCopy: () => Localize.t('global.copy'),
    IconSearch: () => Localize.t('global.search'),
    IconTrash: () => Localize.t('global.remove'),
    IconSettings: () => Localize.t('global.settings'),
    IconTabBarSettings: () => Localize.t('global.settings'),
    IconTabBarSettingsSelected: () => Localize.t('global.settings'),
    IconMoreHorizontal: () => Localize.t('accessibility.moreOptions'),
    IconMoreVertical: () => Localize.t('accessibility.moreOptions'),
    IconRefresh: () => Localize.t('accessibility.refresh'),
    IconHelpCircle: () => Localize.t('accessibility.help'),
    IconSortTop: () => Localize.t('accessibility.moveToTop'),
    IconReorderHandle: () => Localize.t('accessibility.reorder'),
};

const IconAccessibilityLabel = (icon?: string): string | undefined => {
    if (!icon || !ICON_LABELS[icon]) {
        return undefined;
    }

    return ICON_LABELS[icon]();
};

/**
 * Screen readers garble an XRPL address. Read its start and end, and offer an action that spells out
 * the whole address. Addresses are public, so announcing one is fine (never use this for secrets).
 *
 * Spread these on a View that wraps the address Text, never on the Text itself: the iOS native Text
 * view has no onAccessibilityAction setter, so React Native drops the whole UI update and the screen
 * stays blank (seen in e2e on the review screen of build 474).
 */
const spaced = (text: string) => text.split('').join(' ');

const AddressAccessibilityProps = (address?: string) => {
    if (!address) {
        return {};
    }

    return {
        accessible: true,
        accessibilityLabel: Localize.t('accessibility.addressStartsEnds', {
            start: spaced(address.slice(0, 5)),
            end: spaced(address.slice(-4)),
        }),
        accessibilityActions: [{ name: 'spellOut', label: Localize.t('accessibility.spellOutAddress') }],
        onAccessibilityAction: (event: AccessibilityActionEvent) => {
            if (event.nativeEvent.actionName === 'spellOut') {
                AccessibilityInfo.announceForAccessibility(spaced(address));
            }
        },
    };
};

export { WarnSecretReadAloud, IconAccessibilityLabel, AddressAccessibilityProps };
