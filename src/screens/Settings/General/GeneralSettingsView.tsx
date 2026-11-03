/**
 * General Settings Screen
 */

import { uniqBy, sortBy, toLower } from 'lodash';

import React, { Component } from 'react';
import { View, Text, ScrollView, Appearance } from 'react-native';

import { Navigator } from '@common/helpers/navigator';
import { GetDeviceLocaleSettings } from '@common/helpers/device';

import { AppScreens } from '@common/constants';

import { CoreRepository } from '@store/repositories';
import { CoreModel } from '@store/models';
import { Themes } from '@store/types';

import { TouchableDebounce, Header, Switch } from '@components/General';

import Localize from '@locale';

import { PickerModalProps } from '@screens/Global/Picker';
import { CurrencyPickerModalProps } from '@screens/Modal/CurrencyPicker';

import styles from './styles';
import sectionStyles from '../sectionStyles';
import { SettingsRow, SettingsSection } from '../SettingsSection';
import StyleService from '@services/StyleService';
import { Prompt } from '@common/helpers/interface';

/* types ==================================================================== */
export interface Props {}

export interface State {
    coreSettings: CoreModel;
    locales: any;
}

/* Component ==================================================================== */
class GeneralSettingsView extends Component<Props, State> {
    static screenName = AppScreens.Settings.General;

    static options() {
        return {
            bottomTabs: { visible: false },
        };
    }

    constructor(props: Props) {
        super(props);

        this.state = {
            coreSettings: CoreRepository.getSettings(),
            locales: Localize.getLocales(),
        };
    }

    componentDidMount() {
        CoreRepository.on('updateSettings', this.updateUI);
    }

    componentWillUnmount() {
        CoreRepository.off('updateSettings', this.updateUI);
    }

    updateUI = (coreSettings: CoreModel) => {
        this.setState({ coreSettings });
    };

    showLanguagePicker = () => {
        const { coreSettings, locales } = this.state;

        let normalizedLocales = [];

        for (const locale of locales) {
            normalizedLocales.push({
                value: locale.code,
                title: locale.nameLocal,
            });
        }

        normalizedLocales = sortBy(uniqBy(normalizedLocales, 'title'), 'title');

        Navigator.push<PickerModalProps>(AppScreens.Global.Picker, {
            title: Localize.t('global.language'),
            description: Localize.t('settings.selectLanguage'),
            items: normalizedLocales,
            selected: coreSettings.language,
            onSelect: this.onLanguageSelected,
        });
    };

    showCurrencyPicker = () => {
        const { coreSettings } = this.state;

        Navigator.push<CurrencyPickerModalProps>(AppScreens.Modal.CurrencyPicker, {
            selected: coreSettings.currency,
            onSelect: this.onCurrencySelected,
        });
    };

    onCurrencySelected = (currencyCode: string) => {
        // save in store
        CoreRepository.saveSettings({ currency: currencyCode });
    };

    onLanguageSelected = ({ value }: { value: string }) => {
        // save in store
        CoreRepository.saveSettings({ language: value });

        // change it from local instance
        Localize.setLocale(value);

        // re-render the app
        Navigator.reRender();
    };

    onSystemSeparatorChange = async (value: boolean) => {
        CoreRepository.saveSettings({
            useSystemSeparators: value,
        });

        if (value) {
            const localeSettings = await GetDeviceLocaleSettings();
            Localize.setSettings(localeSettings);
        } else {
            Localize.setSettings(undefined);
        }

        // re-render the app
        Navigator.reRender();
    };

    hideAdvisoryTransactionsChange = (value: boolean) => {
        CoreRepository.saveSettings({
            hideAdvisoryTransactions: value,
        });
    };

    onAccountWorthActiveChange = (value: boolean) => {
        CoreRepository.saveSettings({
            accountWorthActive: value,
        });
    };

    onShowPerAssetWorthChange = (value: boolean) => {
        CoreRepository.saveSettings({
            showPerAssetWorth: value,
        });
    };

    themeAutoSwitch = (value: boolean) => {
        const { coreSettings } = this.state;
        if (value) {
            // Auto switch
            if (
                (coreSettings.theme === 'light' && Appearance.getColorScheme() !== 'light') ||
                (coreSettings.theme !== 'light' && Appearance.getColorScheme() === 'light')
            ) {
                // Mismatch, we switch
                this.changeTheme(Appearance.getColorScheme() as Themes);
            }
        }

        CoreRepository.saveSettings({ themeAutoSwitch: value });
    };

    hideServiceFeeTransactionsChange = (value: boolean) => {
        CoreRepository.saveSettings({
            hideServiceFeeTransactions: value,
        });
    };

    hapticFeedbackChange = (value: boolean) => {
        CoreRepository.saveSettings({
            hapticFeedback: value,
        });
    };

    onShowReservePanelChange = (value: boolean) => {
        CoreRepository.saveSettings({
            showReservePanel: value,
        });
    };

    getLanguageTitle = (): string => {
        const { coreSettings, locales } = this.state;

        const locale = locales.find((x: any) => x.code === coreSettings.language);

        return locale.nameLocal;
    };

    changeTheme = (theme: Themes) => {
        const {coreSettings} = this.state;

        if (
            (coreSettings.themeAutoSwitch && theme !== 'light') || 
            !coreSettings.themeAutoSwitch
         ) {
            CoreRepository.saveSettings({theme});
        }

        if (coreSettings.themeAutoSwitch && theme !== 'light') {
            if (Appearance.getColorScheme() === 'light') {
                Prompt(
                    Localize.t('global.info'),
                    Localize.t('settings.notChangingYetBecauseLightMode'),
                    [
                        { text: Localize.t('global.ok') },
                    ],
                    { type: 'default' },
                );
                return; // We do not switch because it's light time
            }
        }

        StyleService.initialize(CoreRepository.getSettings())
            .then(() => {
                requestAnimationFrame(() => {
                    Navigator.switchTheme();
                });
            });
    };

    onThemeSelect = (selected: Themes) => {
        this.changeTheme(selected);
        // Prompt(
        //     Localize.t('global.warning'),
        //     Localize.t('settings.changingThemeNeedsRestartToTakeEffect'),
        //     [
        //         { text: Localize.t('global.cancel') },
        //         {
        //             text: Localize.t('global.quitApp'),
        //             onPress: () => {
        //                 this.changeTheme(selected);
        //             },
        //             style: 'destructive',
        //         },
        //     ],
        //     { type: 'default' },
        // );
    };

    renderThemeButton = (theme: Themes, { title, description }: { title: string; description: string }) => {
        const { coreSettings } = this.state;
        const selected = toLower(coreSettings.theme) === theme;
        const previewStyle = {
            light: styles.themePreviewLight,
            dark: styles.themePreviewDark,
            moonlight: styles.themePreviewMoonlight,
            royal: styles.themePreviewRoyal,
        }[theme];
        return (
            <TouchableDebounce
                key={theme}
                testID={`theme-${theme}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => {
                    if (!selected) this.onThemeSelect(theme);
                }}
                style={[styles.themeItem, selected && styles.themeItemSelected]}
            >
                <View style={[styles.themeItemDot, selected && styles.themeItemDotSelected]}>
                    {selected && <View style={styles.themeItemFilled} />}
                </View>
                <View style={styles.themeLabel}>
                    <Text style={styles.themeItemLabelText}>{title}</Text>
                    <Text style={styles.themeItemLabelSmall}>{description}</Text>
                </View>
                <View style={[styles.themePreview, previewStyle]}>
                    <Text style={[styles.themePreviewText, previewStyle]}>Aa</Text>
                </View>
            </TouchableDebounce>
        );
    };

    render() {
        const { coreSettings } = this.state;
        const accountWorthInfo = coreSettings.accountWorthInfo.split('|');
        const themeItems = {
            light: {
                title: Localize.t('global.default'),
                description: Localize.t('settings.lightThemeDescription'),
            },
            dark: {
                title: Localize.t('global.dark'),
                description: Localize.t('settings.darkThemeDescription'),
            },
            moonlight: {
                title: Localize.t('global.moonlight'),
                description: Localize.t('settings.moonlightThemeDescription'),
            },
            royal: {
                title: Localize.t('global.royal'),
                description: Localize.t('settings.royalThemeDescription'),
            },
        };
        return (
            <View testID="general-settings-view" style={styles.container}>
                <Header
                    leftComponent={{ icon: 'IconChevronLeft', onPress: Navigator.pop }}
                    centerComponent={{ text: Localize.t('settings.generalSettings') }}
                />
                <ScrollView contentContainerStyle={sectionStyles.content}>
                    <SettingsSection title={Localize.t('global.languageAndCurrency')}>
                        <SettingsRow
                            label={Localize.t('global.language')}
                            value={this.getLanguageTitle()}
                            onPress={this.showLanguagePicker}
                        />
                        <SettingsRow
                            label={Localize.t('global.currency')}
                            value={coreSettings.currency}
                            onPress={this.showCurrencyPicker}
                        />
                        <SettingsRow label={Localize.t('settings.useSystemSeparators')}>
                            <Switch
                                checked={coreSettings.useSystemSeparators}
                                onChange={this.onSystemSeparatorChange}
                            />
                        </SettingsRow>
                    </SettingsSection>
                    <SettingsSection title={Localize.t('global.homeScreen')}>
                        {accountWorthInfo.length > 1 && (
                            <SettingsRow
                                label={Localize.t('settings.accountWorthActive', {
                                    name: accountWorthInfo[1],
                                })}
                            >
                                <Switch
                                    checked={coreSettings.accountWorthActive}
                                    onChange={this.onAccountWorthActiveChange}
                                />
                            </SettingsRow>
                        )}
                        {accountWorthInfo.length > 1 && (
                            <SettingsRow label={Localize.t('settings.showPerAssetWorth')}>
                                <Switch
                                    checked={coreSettings.showPerAssetWorth}
                                    onChange={this.onShowPerAssetWorthChange}
                                />
                            </SettingsRow>
                        )}
                        <SettingsRow label={Localize.t('settings.showReserveValue')}>
                            <Switch
                                checked={coreSettings.showReservePanel}
                                onChange={this.onShowReservePanelChange}
                            />
                        </SettingsRow>
                    </SettingsSection>
                    <SettingsSection title={Localize.t('global.theme')}>
                        <SettingsRow label={Localize.t('settings.themeAutoSwitch')}>
                            <Switch checked={coreSettings.themeAutoSwitch} onChange={this.themeAutoSwitch} />
                        </SettingsRow>
                        {(Object.keys(themeItems) as Themes[])
                            .filter((theme) => !coreSettings.themeAutoSwitch || theme !== 'light')
                            .map((theme) => this.renderThemeButton(theme, themeItems[theme]))}
                    </SettingsSection>
                    <SettingsSection title={Localize.t('global.transactionsAndEvents')}>
                        <SettingsRow label={Localize.t('settings.hideAdvisoryTransactions')}>
                            <Switch
                                checked={coreSettings.hideAdvisoryTransactions}
                                onChange={this.hideAdvisoryTransactionsChange}
                            />
                        </SettingsRow>
                        <SettingsRow label={Localize.t('settings.hideServiceFeeTransactions')}>
                            <Switch
                                checked={coreSettings.hideServiceFeeTransactions}
                                onChange={this.hideServiceFeeTransactionsChange}
                            />
                        </SettingsRow>
                    </SettingsSection>
                    <SettingsSection title={Localize.t('global.miscellaneous')}>
                        <SettingsRow label={Localize.t('settings.hapticFeedback')}>
                            <Switch
                                checked={coreSettings.hapticFeedback}
                                onChange={this.hapticFeedbackChange}
                            />
                        </SettingsRow>
                    </SettingsSection>
                </ScrollView>
            </View>
        );
    }
}

export default GeneralSettingsView;
