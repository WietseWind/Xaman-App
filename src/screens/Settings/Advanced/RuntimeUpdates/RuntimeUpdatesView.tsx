/**
 * Over The Air Updates: the updates published for this store build (developer mode).
 * Opened from Settings > Advanced > Check for updates, with the list already loaded there.
 * Newest first; tap one to install it; pull down to load the list again.
 */

import React, { Component } from 'react';
import { Alert, RefreshControl, ScrollView, View } from 'react-native';

import { AppScreens } from '@common/constants';
import { Navigator } from '@common/helpers/navigator';
import { ExitApp } from '@common/helpers/app';

import BackendService from '@services/BackendService';
import LoggerService from '@services/LoggerService';
import StyleService from '@services/StyleService';
import UpdateService, { RunningUpdate } from '@services/UpdateService';

import { Header } from '@components/General';

import Localize from '@locale';

import { SettingsRow, SettingsSection } from '../../SettingsSection';
import sectionStyles from '../../sectionStyles';
import styles from '../styles';

/* types ==================================================================== */
export interface Props {
    /** the list as loaded when Check for updates was tapped */
    updates?: XamanBackend.OtaUpdate[];
    /** an update was downloaded and runs after a restart */
    onUpdateReady?: () => void;
}

export interface State {
    updates?: XamanBackend.OtaUpdate[];
    /** first load, only when the list wasn't passed in */
    loading: boolean;
    /** pull to refresh, only when the user pulls */
    refreshing: boolean;
    busy: boolean;
}

// session log (Settings > Advanced > Session log)
const logger = LoggerService.createLogger('Settings');

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

/* Component ==================================================================== */
class RuntimeUpdatesView extends Component<Props, State> {
    static screenName = AppScreens.Settings.RuntimeUpdates;

    static options() {
        return {
            bottomTabs: { visible: false },
        };
    }

    constructor(props: Props) {
        super(props);

        this.state = {
            updates: props.updates,
            loading: !props.updates,
            refreshing: false,
            busy: false,
        };
    }

    componentDidMount() {
        const { updates } = this.props;

        // opened without the list (not via Check for updates): load it, without the pull-to-refresh animation
        if (!updates) {
            this.load('loading');
        }
    }

    showError = (error: any) => {
        Alert.alert(Localize.t('global.error'), error?.message ? String(error.message) : String(error));
    };

    load = async (indicator: 'loading' | 'refreshing') => {
        this.setState({ [indicator]: true } as Pick<State, 'loading' | 'refreshing'>);
        try {
            this.setState({ updates: await fetchOtaUpdates() });
        } catch (error: any) {
            logger.warn('OTA updates: the update list could not be loaded', error);
            this.showError(error);
        } finally {
            this.setState({ [indicator]: false } as Pick<State, 'loading' | 'refreshing'>);
        }
    };

    refresh = () => {
        this.load('refreshing');
    };

    confirmInstall = (update: XamanBackend.OtaUpdate) => {
        const { busy } = this.state;

        if (busy) {
            return;
        }

        Alert.alert(Localize.t('settings.otaInstallQuestion', { otaId: update.otaId }), update.message, [
            { text: Localize.t('global.cancel'), style: 'cancel' },
            { text: Localize.t('settings.otaInstall'), onPress: () => this.install(update.otaId) },
        ]);
    };

    install = async (otaId: number) => {
        const { onUpdateReady } = this.props;

        this.setState({ busy: true });
        try {
            logger.debug(`OTA updates: install of update ${otaId} chosen`);
            // a fresh install token: the one from the list expires after a few minutes
            const updates = await fetchOtaUpdates();
            this.setState({ updates });

            const update = updates.find((u) => u.otaId === otaId);
            if (!update) {
                logger.warn(`OTA updates: update ${otaId} is no longer published`);
                Alert.alert(Localize.t('settings.otaTitle'), Localize.t('settings.otaNothingToInstall'));
                return;
            }

            const isNew = await UpdateService.installDeveloperUpdate(update.manifest.uuid, update.installToken);
            if (!isNew) {
                if (UpdateService.getRunningUpdate().otaId === otaId) {
                    Alert.alert(Localize.t('settings.otaTitle'), Localize.t('settings.otaNotNewer'));
                } else {
                    this.offerReset(otaId);
                }
                return;
            }

            if (typeof onUpdateReady === 'function') {
                onUpdateReady();
            }
            Alert.alert(Localize.t('settings.otaTitle'), Localize.t('settings.otaReadyRestart'), [
                { text: Localize.t('global.notNow'), style: 'cancel' },
                { text: Localize.t('settings.otaRestartNow'), onPress: this.restart },
            ]);
        } catch (error: any) {
            logger.warn(`OTA updates: install of update ${otaId} failed`, error);
            this.showError(error);
        } finally {
            this.setState({ busy: false });
        }
    };

    /**
     * expo-updates only installs updates newer than what the phone last applied, so an update can count
     * as older after the phone went to a newer one or back to the store version. Clearing the downloaded
     * updates at the next start (UpdateService.resetUpdateStorage) undoes that; then the same install works.
     */
    offerReset = (otaId: number) => {
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
                        this.showError(error);
                    }
                },
            },
        ]);
    };

    restart = () => {
        UpdateService.reloadNow().catch(this.showError);
    };

    label = (update: XamanBackend.OtaUpdate, running: RunningUpdate): string => {
        const status =
            update.status === 'dev'
                ? Localize.t('settings.otaStatusTest')
                : Localize.t('settings.otaStatusPublic', { percent: update.rollout });

        return [
            `${update.otaId === running.otaId ? '✓ ' : ''}${update.otaId}`,
            update.held ? `${status}, ${Localize.t('settings.otaStatusHeld')}` : status,
            update.message,
        ].join(' · ');
    };

    renderUpdates = () => {
        const { loading, updates } = this.state;

        if (!updates) {
            return loading ? (
                <SettingsSection>
                    <SettingsRow label={Localize.t('global.loading')} />
                </SettingsSection>
            ) : null;
        }

        if (!updates.length) {
            return (
                <SettingsSection>
                    <SettingsRow label={Localize.t('settings.otaNoUpdates')} />
                </SettingsSection>
            );
        }

        const running = UpdateService.getRunningUpdate();
        return (
            <SettingsSection title={Localize.t('settings.otaCheckForUpdates')}>
                {updates.map((update) => (
                    <SettingsRow
                        key={`update-${update.otaId}-${update.manifest.uuid}`}
                        testID={`ota-update-${update.otaId}`}
                        label={this.label(update, running)}
                        onPress={() => this.confirmInstall(update)}
                    />
                ))}
            </SettingsSection>
        );
    };

    render() {
        const { refreshing } = this.state;

        return (
            <View testID="runtime-updates-screen" style={styles.container}>
                <Header
                    leftComponent={{ testID: 'back-button', icon: 'IconChevronLeft', onPress: Navigator.pop }}
                    centerComponent={{ text: Localize.t('settings.otaTitle') }}
                />
                <ScrollView
                    contentContainerStyle={sectionStyles.content}
                    refreshControl={
                        <RefreshControl
                            onRefresh={this.refresh}
                            refreshing={refreshing}
                            tintColor={StyleService.value('$contrast')}
                        />
                    }
                >
                    {this.renderUpdates()}
                </ScrollView>
            </View>
        );
    }
}

export default RuntimeUpdatesView;
