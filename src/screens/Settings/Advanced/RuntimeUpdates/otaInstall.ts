/**
 * Installing an update by hand (developer mode): the update list, the download and the restart question.
 *
 * The install state lives here, not in a screen: the download goes on when the user leaves the OTA Updates
 * screen, and the screens show it again when they open (instead of offering a second download). expo-updates
 * reports no download progress and can't stop a running download, so the screens show a spinner and there is
 * no cancel: a download always ends in the restart question, or in an alert that says why it didn't.
 */

import { Alert } from 'react-native';

import { ExitApp } from '@common/helpers/app';

import BackendService from '@services/BackendService';
import LoggerService from '@services/LoggerService';
import UpdateService from '@services/UpdateService';

import Localize from '@locale';

/* types ==================================================================== */
export enum OtaInstallStatus {
    Downloading = 'downloading',
    /** downloaded: runs after a restart */
    Ready = 'ready',
}

export interface OtaInstall {
    otaId: number;
    status: OtaInstallStatus;
}

type Listener = (install?: OtaInstall) => void;

// session log (Settings > Advanced > Session log)
const logger = LoggerService.createLogger('Settings');

/* install state ==================================================================== */
let current: OtaInstall | undefined;
const listeners = new Set<Listener>();

const setInstall = (install?: OtaInstall) => {
    current = install;
    listeners.forEach((listener) => listener(install));
};

/** the update downloading or downloaded in this session, if any */
export const getOtaInstall = (): OtaInstall | undefined => current;

/** called on every change; returns the unsubscribe function */
export const subscribeOtaInstall = (listener: Listener) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

/* update list ==================================================================== */
const publishedAt = (update: XamanBackend.OtaUpdate) => new Date(update.manifest.createdAt).getTime();

/** newest published (or re-published) first */
export const newestFirst = (updates: XamanBackend.OtaUpdate[]) =>
    [...updates].sort((a, b) => publishedAt(b) - publishedAt(a) || b.otaId - a.otaId);

/** the published updates for the running store build, newest first, each with a fresh install token */
export const fetchOtaUpdates = async (): Promise<XamanBackend.OtaUpdate[]> => {
    const { runtimeVersion } = UpdateService.getRunningUpdate();
    if (!runtimeVersion) {
        return [];
    }
    const { updates } = await BackendService.getOtaUpdates(runtimeVersion);
    const list = Array.isArray(updates) ? newestFirst(updates) : [];
    logger.debug(`OTA updates: ${list.length} update(s) published for store build ${runtimeVersion}`);
    return list;
};

/* alerts ==================================================================== */
const showError = (error: any) => {
    Alert.alert(Localize.t('global.error'), error?.message ? String(error.message) : String(error));
};

export const restartIntoUpdate = () => {
    UpdateService.reloadNow().catch(showError);
};

/** "Ready. Restart Xaman now to run it?" */
export const promptOtaRestart = () => {
    Alert.alert(Localize.t('settings.otaTitle'), Localize.t('settings.otaReadyRestart'), [
        { text: Localize.t('global.notNow'), style: 'cancel' },
        { text: Localize.t('settings.otaRestartNow'), onPress: restartIntoUpdate },
    ]);
};

/**
 * expo-updates only installs updates newer than what the phone last applied, so an update can count
 * as older after the phone went to a newer one or back to the store version. Clearing the downloaded
 * updates at the next start (UpdateService.resetUpdateStorage) undoes that; then the same install works.
 */
const offerReset = (otaId: number) => {
    Alert.alert(Localize.t('settings.otaTitle'), Localize.t('settings.otaReinstallNeedsReset', { otaId }), [
        { text: Localize.t('global.cancel'), style: 'cancel' },
        {
            text: Localize.t('settings.otaCloseApp'),
            onPress: async () => {
                try {
                    await UpdateService.resetUpdateStorage();
                    ExitApp();
                } catch (error: any) {
                    logger.warn('OTA updates: clearing the downloaded updates failed', error);
                    showError(error);
                }
            },
        },
    ]);
};

/* install ==================================================================== */
/**
 * Downloads update otaId, with a fresh install token: the one from the list expires after a few minutes.
 * Ends in the restart question, or in an alert that says why nothing was installed. Ignored while a
 * download runs.
 */
export const installOtaUpdate = async (otaId: number): Promise<void> => {
    if (current?.status === OtaInstallStatus.Downloading) {
        return;
    }

    // an update downloaded earlier still runs after a restart when this one doesn't download
    const previous = current;
    setInstall({ otaId, status: OtaInstallStatus.Downloading });

    try {
        logger.debug(`OTA updates: install of update ${otaId} chosen`);
        const update = (await fetchOtaUpdates()).find((u) => u.otaId === otaId);
        if (!update) {
            setInstall(previous);
            logger.warn(`OTA updates: update ${otaId} is no longer published`);
            Alert.alert(Localize.t('settings.otaTitle'), Localize.t('settings.otaNothingToInstall'));
            return;
        }

        const isNew = await UpdateService.installDeveloperUpdate(update.manifest.uuid, update.installToken);
        if (!isNew) {
            setInstall(previous);
            if (UpdateService.getRunningUpdate().otaId === otaId) {
                Alert.alert(Localize.t('settings.otaTitle'), Localize.t('settings.otaNotNewer'));
            } else {
                offerReset(otaId);
            }
            return;
        }

        setInstall({ otaId, status: OtaInstallStatus.Ready });
        promptOtaRestart();
    } catch (error: any) {
        setInstall(previous);
        logger.warn(`OTA updates: install of update ${otaId} failed`, error);
        showError(error);
    }
};
