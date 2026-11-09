import { AccessibilityInfo, Alert } from 'react-native';

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

export { WarnSecretReadAloud };
