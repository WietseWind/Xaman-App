/**
 * Advanced Settings Screen
 */

import React, { Component } from 'react';
import { View, Text, ScrollView, Alert, Platform, Linking } from 'react-native';

import PushNotificationsService from '@services/PushNotificationsService';
import NetworkService from '@services/NetworkService';
import BackendService from '@services/BackendService';

import { CoreRepository, NetworkRepository, ProfileRepository } from '@store/repositories';
import { CoreModel, ProfileModel } from '@store/models';
import { NetworkType } from '@store/types';

import { AppScreens, NetworkConfig } from '@common/constants';
import { Navigator } from '@common/helpers/navigator';

import { SetFlagSecure, GetAppVersionCode, GetAppReadableVersion } from '@common/helpers/app';

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

/* types ==================================================================== */
export interface Props {}

export interface State {
    coreSettings: CoreModel;
    profile?: ProfileModel;
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

        if (Platform.OS === 'android') {
            SetFlagSecure(true);
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
                                    {GetAppReadableVersion()}
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
                </ScrollView>
            </View>
        );
    }
}

export default AdvancedSettingsView;
