/**
 * OTA Updates: the updates published for this store build (developer mode).
 * Opened from Settings > Advanced > Check for updates, with the list already loaded there.
 * The header uses the short title (settings.otaScreenTitle): "Over The Air Updates" doesn't fit there.
 * Newest first; tap one to install it; pull down to load the list again.
 * While an update downloads (otaInstall.ts), its row shows a spinner and no row can be tapped, also after
 * leaving the screen and opening it again. A downloaded update's row asks to restart.
 */

import React, { Component } from 'react';
import { Alert, RefreshControl, ScrollView, View } from 'react-native';

import { AppScreens } from '@common/constants';
import { Navigator } from '@common/helpers/navigator';

import LoggerService from '@services/LoggerService';
import StyleService from '@services/StyleService';
import UpdateService, { RunningUpdate } from '@services/UpdateService';

import { Header, LoadingIndicator } from '@components/General';

import Localize from '@locale';

import { SettingsRow, SettingsSection } from '../../SettingsSection';
import sectionStyles from '../../sectionStyles';
import styles from '../styles';

import {
    OtaInstall,
    OtaInstallStatus,
    fetchOtaUpdates,
    getOtaInstall,
    installOtaUpdate,
    promptOtaRestart,
    subscribeOtaInstall,
} from './otaInstall';

/* types ==================================================================== */
export interface Props {
    /** the list as loaded when Check for updates was tapped */
    updates?: XamanBackend.OtaUpdate[];
}

export interface State {
    updates?: XamanBackend.OtaUpdate[];
    /** first load, only when the list wasn't passed in */
    loading: boolean;
    /** pull to refresh, only when the user pulls */
    refreshing: boolean;
    /** the update downloading or downloaded in this session */
    install?: OtaInstall;
}

// session log (Settings > Advanced > Session log)
const logger = LoggerService.createLogger('Settings');

/* Component ==================================================================== */
class RuntimeUpdatesView extends Component<Props, State> {
    static screenName = AppScreens.Settings.RuntimeUpdates;

    private unsubscribeInstall?: () => void;

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
            install: getOtaInstall(),
        };
    }

    componentDidMount() {
        const { updates } = this.props;

        this.unsubscribeInstall = subscribeOtaInstall((install) => this.setState({ install }));

        // opened without the list (not via Check for updates): load it, without the pull-to-refresh animation
        if (!updates) {
            this.load('loading');
        }
    }

    componentWillUnmount() {
        if (this.unsubscribeInstall) {
            this.unsubscribeInstall();
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

    onUpdatePress = (update: XamanBackend.OtaUpdate) => {
        const { install } = this.state;

        // downloaded: it runs after a restart
        if (install?.status === OtaInstallStatus.Ready && install.otaId === update.otaId) {
            promptOtaRestart();
            return;
        }

        Alert.alert(Localize.t('settings.otaInstallQuestion', { otaId: update.otaId }), update.message, [
            { text: Localize.t('global.cancel'), style: 'cancel' },
            { text: Localize.t('settings.otaInstall'), onPress: () => installOtaUpdate(update.otaId) },
        ]);
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

    renderUpdate = (update: XamanBackend.OtaUpdate, running: RunningUpdate) => {
        const { install } = this.state;

        const key = `update-${update.otaId}-${update.manifest.uuid}`;
        const testID = `ota-update-${update.otaId}`;
        const label = this.label(update, running);
        const isInstall = install?.otaId === update.otaId;

        // a download runs: no row can be tapped
        if (install?.status === OtaInstallStatus.Downloading) {
            return isInstall ? (
                <SettingsRow key={key} testID={testID} label={label} value={Localize.t('settings.otaDownloading')}>
                    <LoadingIndicator style={styles.downloadIndicator} />
                </SettingsRow>
            ) : (
                <SettingsRow key={key} testID={testID} label={label} />
            );
        }

        return (
            <SettingsRow
                key={key}
                testID={testID}
                label={label}
                value={
                    isInstall && install?.status === OtaInstallStatus.Ready
                        ? Localize.t('settings.otaDownloaded')
                        : undefined
                }
                onPress={() => this.onUpdatePress(update)}
            />
        );
    };

    renderUpdates = () => {
        const { loading, updates, install } = this.state;

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
            <SettingsSection
                title={Localize.t('settings.otaCheckForUpdates')}
                footer={
                    install?.status === OtaInstallStatus.Downloading
                        ? Localize.t('settings.otaDownloadingHint')
                        : undefined
                }
            >
                {updates.map((update) => this.renderUpdate(update, running))}
            </SettingsSection>
        );
    };

    render() {
        const { refreshing } = this.state;

        return (
            <View testID="runtime-updates-screen" style={styles.container}>
                <Header
                    leftComponent={{ testID: 'back-button', icon: 'IconChevronLeft', onPress: Navigator.pop }}
                    centerComponent={{ text: Localize.t('settings.otaScreenTitle') }}
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
