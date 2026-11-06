/**
 * Runtime updates: the over-the-air updates published for this store build (developer mode).
 * Opened from Settings > Advanced > Check for updates. Newest first; tap one to install it.
 */

import React, { Component } from 'react';
import { Alert, NativeModules, RefreshControl, ScrollView, View } from 'react-native';

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
    /** an update was downloaded and runs after a restart */
    onUpdateReady?: () => void;
}

export interface State {
    loading: boolean;
    updates?: XamanBackend.OtaUpdate[];
    busy: boolean;
}

// session log (Settings > Advanced > Session log)
const logger = LoggerService.createLogger('Settings');

/** newest published (or re-published) first */
const publishedAt = (update: XamanBackend.OtaUpdate) => new Date(update.manifest.createdAt).getTime();
const newestFirst = (updates: XamanBackend.OtaUpdate[]) =>
    [...updates].sort((a, b) => publishedAt(b) - publishedAt(a) || b.otaId - a.otaId);

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
            loading: true,
            updates: undefined,
            busy: false,
        };
    }

    componentDidMount() {
        this.load();
    }

    showError = (error: any) => {
        Alert.alert(Localize.t('global.error'), error?.message ? String(error.message) : String(error));
    };

    /** the published updates, each with a fresh install token */
    fetchUpdates = async (): Promise<XamanBackend.OtaUpdate[]> => {
        const { runtimeVersion } = UpdateService.getRunningUpdate();
        if (!runtimeVersion) {
            return [];
        }
        const { updates } = await BackendService.getOtaUpdates(runtimeVersion);
        return Array.isArray(updates) ? newestFirst(updates) : [];
    };

    load = async () => {
        this.setState({ loading: true });
        try {
            const updates = await this.fetchUpdates();
            this.setState({ updates });
            logger.debug(
                `Hot updates: ${updates.length} update(s) published for store build ${
                    UpdateService.getRunningUpdate().runtimeVersion
                }`,
            );
        } catch (error: any) {
            logger.warn('Hot updates: the update list could not be loaded', error);
            this.showError(error);
        } finally {
            this.setState({ loading: false });
        }
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
            logger.debug(`Hot updates: install of update ${otaId} chosen`);
            // a fresh install token: the one from the list expires after a few minutes
            const updates = await this.fetchUpdates();
            this.setState({ updates });

            const update = updates.find((u) => u.otaId === otaId);
            if (!update) {
                logger.warn(`Hot updates: update ${otaId} is no longer published`);
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
            logger.warn(`Hot updates: install of update ${otaId} failed`, error);
            this.showError(error);
        } finally {
            this.setState({ busy: false });
        }
    };

    /**
     * expo-updates only installs updates newer than what the phone last applied. Going back to the store
     * version stamps it with the time of that step, so an earlier update counts as older from then on.
     * Clearing the downloaded updates at the next start (the native revert without blocking anything)
     * undoes that; then the same install works.
     * NOTE: calls the native module directly because the updater (UpdateService) can't change in an
     * over-the-air update; this moves into UpdateService with the next store build.
     */
    offerReset = (otaId: number) => {
        Alert.alert(Localize.t('settings.otaTitle'), Localize.t('settings.otaReinstallNeedsReset', { otaId }), [
            { text: Localize.t('global.cancel'), style: 'cancel' },
            {
                text: Localize.t('settings.otaCloseApp'),
                onPress: async () => {
                    try {
                        await NativeModules.OtaRecoveryModule.scheduleRevert(null, 0);
                        logger.warn(
                            `Hot updates: downloaded updates are cleared at the next start, so update ${otaId} ` +
                                'can be installed again',
                        );
                        ExitApp();
                    } catch (error: any) {
                        logger.warn('Hot updates: clearing the downloaded updates failed', error);
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
        const { loading } = this.state;

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
                            onRefresh={this.load}
                            refreshing={loading}
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
