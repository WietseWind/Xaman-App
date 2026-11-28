/**
 * The message of the app for "this is not the card I asked for".
 *
 * A card operation that gets another card ends (see `TangemCard` in @common/utils/tangemSession). The
 * app then shows this alert, and the user starts a new scan with the button they came from.
 */
import { Navigator } from '@common/helpers/navigator';

import LoggerService from '@services/LoggerService';

import Localize from '@locale';

/** `name`: the name of the card (account) the app asked for, when there is one. */
export const showTangemWrongCard = (name?: string) => {
    const label = name?.trim();
    Navigator.showAlertModal({
        testID: 'tangem-wrong-card-alert',
        type: 'error',
        title: Localize.t('account.tangemDifferentCard'),
        text: label
            ? Localize.t('account.tangemDifferentCardExplain', { name: label })
            : Localize.t('account.tangemScanHint'),
        buttons: [{ text: Localize.t('global.ok'), testID: 'tangem-wrong-card-ok' }],
    }).catch((error) => LoggerService.recordError('Unable to show the Tangem different card alert', error));
};
