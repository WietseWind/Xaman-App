/**
 * Settings Screen
 */

import React, { Component } from 'react';
import { View, Text, ScrollView, Linking } from 'react-native';
import { OptionsModalPresentationStyle, OptionsModalTransitionStyle } from 'react-native-navigation';

import { XAppOrigin } from '@common/libs/payload';

import { glassTabScrollPadding } from '@common/helpers/glassTabBar';
import { AppScreenKeys, Navigator } from '@common/helpers/navigator';
import { AppConfig, AppScreens } from '@common/constants';

import { TouchableDebounce, Header, Icon } from '@components/General';
import { MonetizationElement } from '@components/Modules';

import Localize from '@locale';

import { XAppBrowserModalProps } from '@screens/Modal/XAppBrowser';

import { AppStyles } from '@theme';
import styles from './styles';
import { SettingsSection } from './SettingsSection';

/* types ==================================================================== */
export interface Props {}

export interface State {}

/* Component ==================================================================== */
class SettingsView extends Component<Props, State> {
    static screenName = AppScreens.TabBar.Settings;

    static options() {
        return {
            topBar: {
                visible: false,
            },
        };
    }

    onRowPress = (route: AppScreenKeys | 'xumm.support' | 'https://help.xaman.app') => {
        if (route === 'https://help.xaman.app') {
            Linking.openURL(route);
        } else if (route === 'xumm.support') {
            Navigator.showModal<XAppBrowserModalProps>(
                AppScreens.Modal.XAppBrowser,
                {
                    identifier: AppConfig.xappIdentifiers.support,
                    origin: XAppOrigin.XUMM,
                },
                {
                    modalTransitionStyle: OptionsModalTransitionStyle.coverVertical,
                    modalPresentationStyle: OptionsModalPresentationStyle.overFullScreen,
                },
            );
        } else {
            Navigator.push(route, {});
        }
    };

    renderRow = (
        icon: any,
        label: string,
        screen: AppScreenKeys | 'xumm.support' | 'https://help.xaman.app',
        testID: string,
    ) => {
        return (
            <TouchableDebounce
                testID={testID}
                onPress={() => {
                    this.onRowPress(screen);
                }}
            >
                <View style={styles.rowContainer}>
                    <Icon size={24} name={icon} style={styles.rowIcon} />
                    <Text style={styles.rowLabel}>{label}</Text>
                    <Icon size={18} name="IconChevronRight" style={styles.chevron} />
                </View>
            </TouchableDebounce>
        );
    };

    render() {
        return (
            <View testID="settings-tab-screen" style={AppStyles.tabContainer}>
                <Header
                    placement="left"
                    containerStyle={AppStyles.headerContainer}
                    leftComponent={{
                        text: Localize.t('global.settings'),
                        textStyle: AppStyles.h3,
                    }}
                />

                <MonetizationElement canSuppressWarnings={false} style={styles.monetizationContainer} />

                <View style={AppStyles.contentContainer}>
                    <ScrollView
                        style={AppStyles.flex1}
                        contentContainerStyle={[
                            styles.content,
                            glassTabScrollPadding > 0 && { paddingBottom: glassTabScrollPadding + 16 },
                        ]}
                    >
                        <SettingsSection>
                            {this.renderRow(
                                'IconSlider',
                                Localize.t('global.general'),
                                AppScreens.Settings.General,
                                'general-button',
                            )}
                            {this.renderRow(
                                'IconAccount',
                                Localize.t('global.accounts'),
                                AppScreens.Account.List,
                                'accounts-button',
                            )}
                            {this.renderRow(
                                'IconBook',
                                Localize.t('global.addressBook'),
                                AppScreens.Settings.AddressBook.List,
                                'address-book-button',
                            )}
                        </SettingsSection>
                        <SettingsSection>
                            {this.renderRow(
                                'IconActivity',
                                Localize.t('global.advanced'),
                                AppScreens.Settings.Advanced,
                                'advanced-button',
                            )}
                            {this.renderRow(
                                'IconShield',
                                Localize.t('global.security'),
                                AppScreens.Settings.Security,
                                'security-button',
                            )}
                            {this.renderRow(
                                'IconToggleRight',
                                Localize.t('settings.thirdPartyApps'),
                                AppScreens.Settings.ThirdPartyApps.List,
                                'third_party-apps-button',
                            )}
                        </SettingsSection>
                        <SettingsSection>
                            {this.renderRow(
                                'IconBook',
                                Localize.t('global.helpCenter'),
                                'https://help.xaman.app',
                                'helpcenter-button',
                            )}
                            {this.renderRow(
                                'IconHelpCircle',
                                Localize.t('setupTermOfService.questionsAndSupport'),
                                'xumm.support',
                                'support-button',
                            )}
                            {this.renderRow(
                                'IconInfo',
                                Localize.t('settings.termsAndConditions'),
                                AppScreens.Settings.TermOfUse,
                                'tos-button',
                            )}
                        </SettingsSection>
                    </ScrollView>
                </View>
            </View>
        );
    }
}

/* Export Component ==================================================================== */
export default SettingsView;
