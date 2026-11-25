/**
 * Out-of-range HTTP statuses used to abort release builds.
 * Production keeps the failed request on the existing error path.
 * Developer mode on a debug or TestFlight build can inspect the exchange.
 */

import { CoreRepository } from '@store/repositories';

import { Clipboard } from '@common/helpers/clipboard';
import { IsDebugBuild, IsTestFlightBuild } from '@common/helpers/app';
import { Navigator } from '@common/helpers/navigator';
import { Toast } from '@common/helpers/interface';

import Localize from '@locale';

const MAX_BODY_CHARS = 1500;

export interface UnexpectedBackendResponse {
    method: string;
    url: string;
    status: number;
    body: string;
}

export const shouldShowBackendResponseDetails = (
    developerMode: boolean,
    debugBuild: boolean,
    testFlight: boolean,
): boolean => {
    return developerMode && (debugBuild || testFlight);
};

export const formatBackendResponseDetails = (details: UnexpectedBackendResponse): string => {
    const rawBody = details.body || '(empty)';
    const body = rawBody.length > MAX_BODY_CHARS ? `${rawBody.slice(0, MAX_BODY_CHARS)}\n…` : rawBody;

    return `Method: ${details.method}\nURL: ${details.url}\nHTTP: ${String(details.status)}\n\n${body}`;
};

const developerModeEnabled = (): boolean => {
    try {
        return CoreRepository.isDeveloperModeEnabled();
    } catch {
        return false;
    }
};

let detailsVisible = false;

export const reportUnexpectedBackendResponse = (details: UnexpectedBackendResponse): void => {
    try {
        if (
            !shouldShowBackendResponseDetails(developerModeEnabled(), IsDebugBuild(), IsTestFlightBuild()) ||
            detailsVisible
        ) {
            return;
        }
    } catch {
        return;
    }

    detailsVisible = true;
    const report = formatBackendResponseDetails(details);
    const hide = () => {
        detailsVisible = false;
    };

    Navigator.showAlertModal({
        type: 'error',
        text: Localize.t('global.unexpectedBackendResponse'),
        buttons: [
            {
                text: Localize.t('global.close'),
                light: true,
                onPress: hide,
            },
            {
                text: Localize.t('global.details'),
                onPress: () => {
                    Navigator.showAlertModal({
                        type: 'info',
                        title: Localize.t('global.details'),
                        text: report,
                        buttons: [
                            {
                                text: Localize.t('global.close'),
                                light: true,
                                onPress: hide,
                            },
                            {
                                text: Localize.t('global.copy'),
                                onPress: () => {
                                    Clipboard.setString(report);
                                    Toast(Localize.t('global.copiedToClipboard'));
                                    hide();
                                },
                            },
                        ],
                    }).catch(hide);
                },
            },
        ],
    }).catch(hide);
};
