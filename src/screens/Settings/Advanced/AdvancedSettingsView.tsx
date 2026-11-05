/**
 * Advanced Settings Screen
 */

import React, { Component } from 'react';
import { View, Text, ScrollView, Alert, Platform, Linking } from 'react-native';

import PushNotificationsService from '@services/PushNotificationsService';
import NetworkService from '@services/NetworkService';
import BackendService from '@services/BackendService';
import UpdateService, { RunningUpdate, UpdateChannel } from '@services/UpdateService';
import LoggerService from '@services/LoggerService';

import { CoreRepository, NetworkRepository, ProfileRepository } from '@store/repositories';
import { CoreModel, ProfileModel } from '@store/models';
import { NetworkType } from '@store/types';

import { AppScreens, NetworkConfig } from '@common/constants';
import { Navigator } from '@common/helpers/navigator';

import { SetFlagSecure, GetAppVersionCode, ExitApp } from '@common/helpers/app';

import { Header, Switch, MultiPressDetector } from '@components/General';

import Localize from '@locale';

import { SessionLogViewProps } from '@screens/Settings/Advanced/Logs';
import { NetworkSettingViewProps } from '@screens/Settings/Advanced/Network';
import { DeveloperSettingViewProps } from '@screens/Settings/Advanced/DeveloperSettings';
import { AuthenticateOverlayProps } from '@screens/Overlay/Authenticate';
import { ChangeLogOverlayProps } from '@screens/Overlay/ChangeLog';

// style
import { SettingsRow, SettingsSection } from '../SettingsSection';
import sectionStyles from '../sectionStyles';
import styles from './styles';

// session log (Settings > Advanced > Session log)
const logger = LoggerService.createLogger('Settings');

/* types ==================================================================== */
export interface Props {}

export interface State {
    coreSettings: CoreModel;
    profile?: ProfileModel;
    // over-the-air updates (developer mode)
    otaBusy: boolean;
    otaUpdates?: XamanBackend.OtaUpdate[];
    otaReady: boolean;
}

/* Component ==================================================================== */
class AdvancedSettingsView extends Component<Props, State> {
    static screenName = AppScreens.Settings.Advanced;

    static options() {
        return {
            bottomTabs: { visible: false },
        };
    }

    constructor(props: Props) {
        super(props);

        this.state = {
            coreSettings: CoreRepository.getSettings(),
            profile: ProfileRepository.getProfile(),
            otaBusy: false,
            otaUpdates: undefined,
            otaReady: false,
        };
    }

    componentDidMount() {
        CoreRepository.on('updateSettings', this.updateUI);
    }

    componentWillUnmount() {
        CoreRepository.off('updateSettings', this.updateUI);
    }

    updateUI = (coreSettings: CoreModel) => {
        this.setState({
            coreSettings,
        });
    };

    showChangeLog = () => {
        const currentVersionCode = GetAppVersionCode();

        Navigator.showOverlay<ChangeLogOverlayProps>(AppScreens.Overlay.ChangeLog, { version: currentVersionCode });
    };

    openAppSettings = () => {
        Linking.openSettings();
    };

    reRegisterPushToken = async () => {
        try {
            // get current permission status
            let hasPermission = await PushNotificationsService.checkPermission();

            if (!hasPermission) {
                // try to request the permission again
                hasPermission = await PushNotificationsService.requestPermission();
            }

            // if still no permission granted, user need to give the permission manually
            if (!hasPermission) {
                Alert.alert(
                    Localize.t('global.error'),
                    Localize.t('global.pushErrorPermissionMessage'),
                    [
                        { text: Localize.t('global.approvePermissions'), onPress: this.openAppSettings },
                        { text: Localize.t('global.cancel') },
                    ],
                    { cancelable: true },
                );
                return;
            }

            // fetch the push token and send to backend
            const devicePushToken = await PushNotificationsService.getToken();

            if (!devicePushToken) {
                Alert.alert(
                    Localize.t('global.error'),
                    Localize.t('settings.unableToReRegisteredForPushNotifications'),
                );
                return;
            }

            BackendService.updateDevice({ devicePushToken })
                .then(() => {
                    Alert.alert(
                        Localize.t('global.success'),
                        Localize.t('settings.successfullyReRegisteredForPushNotifications'),
                    );
                })
                .catch(() => {
                    Alert.alert(
                        Localize.t('global.error'),
                        Localize.t('settings.unableToReRegisteredForPushNotifications'),
                    );
                });
        } catch {
            Alert.alert(Localize.t('global.error'), Localize.t('settings.unableToReRegisteredForPushNotifications'));
        }
    };

    enableDeveloperMode = () => {
        // authenticate with passcode before enabling the developer mode
        Navigator.showOverlay<AuthenticateOverlayProps>(AppScreens.Overlay.Auth, {
            canAuthorizeBiometrics: false,
            onSuccess: () => {
                // persist the settings
                CoreRepository.saveSettings({ developerMode: true });
                BackendService.action('developermode', 'on');
                logger.debug('Developer mode turned on (hot updates: test updates can be installed by hand)');

                if (Platform.OS === 'android') {
                    SetFlagSecure(false);
                }
            },
        });
    };

    disableDeveloperMode = () => {
        // Check if on non devmode network, then switch network if required
        const selectedNetwork = CoreRepository.getSelectedNetwork();
        if (selectedNetwork.type !== NetworkType.Main) {
            const networkId = selectedNetwork.networkId > 1024 ? 21337 : NetworkConfig.defaultNetworkId;
            const toNetwork = NetworkRepository.getNetworks({ networkId, type: NetworkType.Main});
            if (toNetwork?.[0]) {
                NetworkService.switchNetwork(toNetwork[0]);
            }
        }
        
        // persist the settings
        CoreRepository.saveSettings({ developerMode: false });
        BackendService.action('developermode', 'off');
        logger.debug('Developer mode turned off');

        if (Platform.OS === 'android') {
            SetFlagSecure(true);
        }

        // a test update runs: back to the public version (or the store version). Offline, this is
        // retried after the next start.
        this.setState({ otaUpdates: undefined });
        if (UpdateService.getRunningUpdate().channel === UpdateChannel.Developer) {
            UpdateService.exitDeveloperChannel()
                .then((changed) => {
                    if (changed) {
                        this.setState({ otaReady: true });
                        this.promptOtaRestart();
                    }
                })
                .catch((error) => {
                    // retried by UpdateService after the next start
                    logger.warn('Hot updates: leaving the test update failed; retried after the next start', error);
                });
        }
    };

    onDeveloperModeChangeRequest = (enable: boolean) => {
        // Enabling developer mode
        // NOTE: enabling developer mode requires authentication
        if (enable) {
            Navigator.showAlertModal({
                type: 'warning',
                title: Localize.t('global.warning'),
                text: Localize.t('settings.developerModeEnabledWarning'),
                buttons: [
                    {
                        text: Localize.t('global.cancel'),
                        type: 'dismiss',
                        light: false,
                    },
                    {
                        text: Localize.t('global.continue'),
                        onPress: this.enableDeveloperMode,
                        type: 'continue',
                        light: true,
                        testID: 'developer-mode-alert-continue-button',
                    },
                ],
            });
            return;
        }

        // Disabling developer mode
        // NOTE: If user is connected to non Mainnet network like `TestNet` we need to revert to `MainNet`
        const selectedNetwork = CoreRepository.getSelectedNetwork();

        // already in the MainNet, no need to show warning
        if (selectedNetwork.type === NetworkType.Main) {
            this.disableDeveloperMode();
            return;
        }

        // get default network object
        const defaultNetwork = NetworkRepository.getNetworks({
            networkId: selectedNetwork.networkId > 1024 ? 21337 : NetworkConfig.defaultNetworkId,
            type: NetworkType.Main,
        })?.[0];

        if (!defaultNetwork) {
            throw new Error('Unable to find default network from config!');
        }

        Navigator.showAlertModal({
            type: 'warning',
            title: Localize.t('settings.disablingDeveloperMode'),
            text: Localize.t('settings.disableDeveloperModeRevertNetworkWarning', {
                currentNetwork: selectedNetwork.name,
                defaultNetwork: defaultNetwork.name,
            }),
            buttons: [
                {
                    text: Localize.t('global.cancel'),
                    type: 'dismiss',
                    light: false,
                },
                {
                    text: Localize.t('global.continue'),
                    onPress: async () => {
                        // switch the network
                        await NetworkService.switchNetwork(defaultNetwork);
                        // disable developer mode
                        this.disableDeveloperMode();
                    },
                    type: 'continue',
                    light: true,
                },
            ],
        });
    };

    showSessionLogs = () => {
        Navigator.push<SessionLogViewProps>(AppScreens.Settings.SessionLog, {});
    };

    showNetworkSettings = () => {
        Navigator.push<NetworkSettingViewProps>(AppScreens.Settings.Network.List, {});
    };

    /* Hot updates (developer mode) ==================================================================== */

    showOtaError = (error: any) => {
        Alert.alert(Localize.t('global.error'), error?.message ? String(error.message) : String(error));
    };

    checkOtaUpdates = async () => {
        const { otaBusy } = this.state;
        const { runtimeVersion } = UpdateService.getRunningUpdate();

        if (otaBusy || !runtimeVersion) {
            return;
        }

        this.setState({ otaBusy: true });
        try {
            const { updates } = await BackendService.getOtaUpdates(runtimeVersion);
            this.setState({ otaUpdates: Array.isArray(updates) ? updates : [] });
            logger.debug(
                `Hot updates: ${Array.isArray(updates) ? updates.length : 0} update(s) published for store build ${runtimeVersion}`,
            );
        } catch (error: any) {
            logger.warn('Hot updates: the update list could not be loaded', error);
            this.showOtaError(error);
        } finally {
            this.setState({ otaBusy: false });
        }
    };

    installOtaUpdate = (update: XamanBackend.OtaUpdate) => {
        const { otaBusy } = this.state;

        if (otaBusy) {
            return;
        }

        Alert.alert(Localize.t('settings.otaInstallQuestion', { otaId: update.otaId }), update.message, [
            { text: Localize.t('global.cancel'), style: 'cancel' },
            { text: Localize.t('settings.otaInstall'), onPress: () => this.runOtaInstall(update.otaId) },
        ]);
    };

    runOtaInstall = async (otaId: number) => {
        const { runtimeVersion } = UpdateService.getRunningUpdate();

        if (!runtimeVersion) {
            return;
        }

        this.setState({ otaBusy: true });
        try {
            logger.debug(`Hot updates: install of update ${otaId} chosen`);
            // a fresh install token: the one from the list expires after a few minutes
            const { updates } = await BackendService.getOtaUpdates(runtimeVersion);
            this.setState({ otaUpdates: Array.isArray(updates) ? updates : [] });

            const update = updates?.find((u) => u.otaId === otaId);
            if (!update) {
                logger.warn(`Hot updates: update ${otaId} is no longer published`);
                Alert.alert(Localize.t('settings.otaTitle'), Localize.t('settings.otaNothingToInstall'));
                return;
            }

            const isNew = await UpdateService.installDeveloperUpdate(update.manifest.uuid, update.installToken);
            if (!isNew) {
                Alert.alert(Localize.t('settings.otaTitle'), Localize.t('settings.otaNotNewer'));
                return;
            }

            this.setState({ otaReady: true });
            this.promptOtaRestart();
        } catch (error: any) {
            logger.warn(`Hot updates: install of update ${otaId} failed`, error);
            this.showOtaError(error);
        } finally {
            this.setState({ otaBusy: false });
        }
    };

    leaveTestUpdate = async () => {
        const { otaBusy } = this.state;

        if (otaBusy) {
            return;
        }

        this.setState({ otaBusy: true });
        try {
            logger.debug('Hot updates: "Back to the public version" chosen');
            const changed = await UpdateService.exitDeveloperChannel();
            if (!changed) {
                Alert.alert(Localize.t('settings.otaTitle'), Localize.t('settings.otaNothingToInstall'));
                return;
            }
            this.setState({ otaReady: true });
            this.promptOtaRestart();
        } catch (error: any) {
            logger.warn('Hot updates: leaving the test update failed', error);
            this.showOtaError(error);
        } finally {
            this.setState({ otaBusy: false });
        }
    };

    promptOtaRestart = () => {
        Alert.alert(Localize.t('settings.otaTitle'), Localize.t('settings.otaReadyRestart'), [
            { text: Localize.t('global.notNow'), style: 'cancel' },
            { text: Localize.t('settings.otaRestartNow'), onPress: this.restartIntoUpdate },
        ]);
    };

    restartIntoUpdate = () => {
        UpdateService.reloadNow().catch(this.showOtaError);
    };

    revertToStoreVersion = () => {
        const { otaId } = UpdateService.getRunningUpdate();

        Alert.alert(Localize.t('settings.otaRevertToStore'), Localize.t('settings.otaRevertWarning', { otaId }), [
            { text: Localize.t('global.cancel'), style: 'cancel' },
            { text: Localize.t('global.continue'), style: 'destructive', onPress: this.runRevert },
        ]);
    };

    runRevert = async () => {
        try {
            // takes effect on the next launch, before the update can run again
            await UpdateService.revertToStoreVersion();
            Alert.alert(Localize.t('settings.otaRevertToStore'), Localize.t('settings.otaReopen'), [
                { text: Localize.t('global.notNow'), style: 'cancel' },
                { text: Localize.t('settings.otaCloseApp'), onPress: ExitApp },
            ]);
        } catch (error: any) {
            logger.warn('Hot updates: scheduling the revert to the store version failed', error);
            this.showOtaError(error);
        }
    };

    otaRunningLabel = (running: RunningUpdate): string => {
        if (running.otaId === 0) {
            return Localize.t('settings.otaStoreVersion');
        }
        if (running.channel === UpdateChannel.Developer) {
            return Localize.t('settings.otaTestUpdateNumber', { otaId: running.otaId });
        }
        return Localize.t('settings.otaUpdateNumber', { otaId: running.otaId });
    };

    otaUpdateLabel = (update: XamanBackend.OtaUpdate, running: RunningUpdate): string => {
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

    renderHotUpdates = () => {
        const { otaBusy, otaUpdates, otaReady } = this.state;

        if (!UpdateService.isEnabled()) {
            return (
                <SettingsSection title={Localize.t('settings.otaTitle')}>
                    <SettingsRow
                        label={Localize.t('settings.otaRunning')}
                        value={Localize.t('settings.otaNotAvailable')}
                    />
                </SettingsSection>
            );
        }

        const running = UpdateService.getRunningUpdate();
        const rows = [
            <SettingsRow
                key="running"
                testID="ota-running"
                label={Localize.t('settings.otaRunning')}
                value={this.otaRunningLabel(running)}
            />,
            <SettingsRow
                key="runtime"
                label={Localize.t('settings.otaStoreBuild')}
                value={running.runtimeVersion ?? '—'}
                selectableValue
            />,
        ];

        if (running.isEmergencyLaunch) {
            rows.push(<SettingsRow key="emergency" label={Localize.t('settings.otaFailedToStart')} />);
        }

        rows.push(
            <SettingsRow
                key="check"
                testID="ota-check"
                label={Localize.t('settings.otaCheckForUpdates')}
                value={otaBusy ? Localize.t('global.loading') : undefined}
                onPress={this.checkOtaUpdates}
            />,
        );

        if (otaUpdates?.length === 0) {
            rows.push(<SettingsRow key="none" label={Localize.t('settings.otaNoUpdates')} />);
        }

        otaUpdates?.slice(0, 10).forEach((update) => {
            rows.push(
                <SettingsRow
                    key={`update-${update.otaId}`}
                    label={this.otaUpdateLabel(update, running)}
                    onPress={() => this.installOtaUpdate(update)}
                />,
            );
        });

        if (otaReady) {
            rows.push(
                <SettingsRow
                    key="restart"
                    label={Localize.t('settings.otaRestartNow')}
                    onPress={this.restartIntoUpdate}
                />,
            );
        }

        if (running.channel === UpdateChannel.Developer) {
            rows.push(
                <SettingsRow
                    key="public"
                    label={Localize.t('settings.otaBackToPublic')}
                    onPress={this.leaveTestUpdate}
                />,
            );
        }

        if (running.otaId > 0) {
            rows.push(
                <SettingsRow
                    key="revert"
                    label={Localize.t('settings.otaRevertToStore')}
                    onPress={this.revertToStoreVersion}
                />,
            );
        }

        return <SettingsSection title={Localize.t('settings.otaTitle')}>{rows}</SettingsSection>;
    };

    showDeveloperSettings = () => {
        const { coreSettings } = this.state;

        if (coreSettings.developerMode) {
            Navigator.push<DeveloperSettingViewProps>(AppScreens.Settings.DeveloperSettings, {});
        }
    };

    render() {
        const { coreSettings, profile } = this.state;
        return (
            <View testID="advanced-settings-screen" style={styles.container}>
                <Header
                    leftComponent={{ testID: 'back-button', icon: 'IconChevronLeft', onPress: Navigator.pop }}
                    centerComponent={{ text: Localize.t('global.advanced') }}
                />
                <ScrollView contentContainerStyle={sectionStyles.content}>
                    <SettingsSection title={Localize.t('global.networks')}>
                        <SettingsRow
                            testID="network-settings-button"
                            label={Localize.t('settings.networkSettings')}
                            onPress={this.showNetworkSettings}
                        />
                    </SettingsSection>
                    <SettingsSection title={Localize.t('settings.pushNotifications')}>
                        <SettingsRow
                            label={Localize.t('settings.reRegisterForPushNotifications')}
                            onPress={this.reRegisterPushToken}
                        />
                    </SettingsSection>
                    <SettingsSection title={Localize.t('settings.releaseInformation')}>
                        <SettingsRow label={Localize.t('global.version')}>
                            <MultiPressDetector pressThreshold={3} onMultiPress={this.showDeveloperSettings}>
                                <Text selectable style={styles.value}>
                                    {UpdateService.getAppFullVersion()}
                                </Text>
                            </MultiPressDetector>
                        </SettingsRow>
                        <SettingsRow
                            label={Localize.t('settings.viewChangeLog')}
                            onPress={this.showChangeLog}
                        />
                    </SettingsSection>
                    <SettingsSection title={Localize.t('global.debug')}>
                        <SettingsRow
                            label={Localize.t('global.deviceUUID')}
                            value={profile?.deviceUUID ? profile.deviceUUID.toUpperCase() : '—'}
                            valueStyle={styles.identifier}
                            selectableValue
                        />
                        <SettingsRow label={Localize.t('settings.developerMode')}>
                            <Switch
                                testID="developer-mode-switch"
                                checked={coreSettings.developerMode}
                                onChange={this.onDeveloperModeChangeRequest}
                            />
                        </SettingsRow>
                        <SettingsRow
                            label={Localize.t('settings.sessionLog')}
                            onPress={this.showSessionLogs}
                        />
                    </SettingsSection>
                    {coreSettings.developerMode && this.renderHotUpdates()}
                </ScrollView>
            </View>
        );
    }
}

export default AdvancedSettingsView;
