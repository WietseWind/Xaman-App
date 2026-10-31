/**
 * Accounts Edit Screen
 */

import { first, filter } from 'lodash';
import React, { Component } from 'react';
import { Alert, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import PushNotificationsService from '@services/PushNotificationsService';

import { Prompt } from '@common/helpers/interface';
import { Navigator } from '@common/helpers/navigator';

import { GetCardEnforcedSecurity, GetCardId, TangemSecurity } from '@common/utils/tangem';
import { AppConfig, AppScreens } from '@common/constants';

import { AccountRepository, CoreRepository } from '@store/repositories';
import { AccountModel } from '@store/models';
import { AccessLevels, AccountTypes, EncryptionLevels } from '@store/types';

import { Button, Header, Switch, LoadingIndicator } from '@components/General';

import Localize from '@locale';

import { PickerModalProps } from '@screens/Global/Picker';
import { AccountImportViewProps } from '@screens/Account/Add/Import';
import { ChangePassphraseViewProps } from '@screens/Account/Edit/ChangePassphrase';
import { ChangeTangemSecurityViewProps } from '@screens/Account/Edit/ChangeTangemSecurity';
import { IdentifyTangemCardViewProps } from '@screens/Account/Edit/IdentifyTangemCard';
import { AuthenticateOverlayProps } from '@screens/Overlay/Authenticate';
import { PassphraseAuthenticationOverlayProps } from '@screens/Overlay/PassphraseAuthentication';

import styles from './styles';
import sectionStyles from '@screens/Settings/sectionStyles';
import { SettingsRow, SettingsSection } from '@screens/Settings/SettingsSection';
import { accountListLabel } from '@common/helpers/accountListLabel';
import BackendService from '@services/BackendService';

/* types ==================================================================== */
export interface Props {
    account: AccountModel;
    nativeAccountInfo?: XamanBackend.MultiAddressNativeInfoItem;
}

export interface State {
    account: AccountModel;
    fetchingPushState: boolean;
    pushAvailable: boolean;
    pushEnabled: boolean;
    accountCanSign: boolean;
}

const CardDetails = ({ cardId, onIdentify }: { cardId: string; onIdentify: () => void }) => {
    const { fontScale } = useWindowDimensions();
    return (
        <View style={styles.cardRow}>
            <Text style={styles.cardIdLabel} testID="tangem-card-id">{Localize.t('account.cardId')}</Text>
            <View style={[styles.cardControls, fontScale > 1.2 && styles.cardControlsStacked]}>
                <Text selectable textBreakStrategy="simple"
                    style={[styles.cardDetailValue, fontScale > 1.2 && styles.cardDetailValueStacked]}>
                    {cardId}
                </Text>
                <Button testID="identify-tangem-button" label={Localize.t('account.identify')}
                    icon="IconScanCard" onPress={onIdentify} roundedMini nonBlock allowFontScaling
                    style={styles.identifyButton} />
            </View>
        </View>
    );
};

/* Component ==================================================================== */
class AccountSettingsView extends Component<Props, State> {
    static screenName = AppScreens.Account.Edit.Settings;

    static options() {
        return {
            bottomTabs: { visible: false },
        };
    }

    constructor(props: Props) {
        super(props);
        const { nativeAccountInfo } = props;

        this.state = {
            account: props.account,
            fetchingPushState: true,
            pushAvailable: false,
            pushEnabled: !!nativeAccountInfo?.hasPush,
            accountCanSign: false,
        };
    }

    componentDidMount() {
        const { account } = this.state;

        AccountRepository.on('accountUpdate', this.onAccountUpdate);

        const accountCanSign = this.canAccountSign(account);
        this.setState({ accountCanSign });

        if (accountCanSign) {
            Promise.all([
                PushNotificationsService.checkPermission(),
                BackendService.privateAccountInfo(account.address, account.label),
            ]).then(pushState => {
                this.setState({
                    fetchingPushState: false,
                    pushAvailable: pushState[0],
                    pushEnabled: !!pushState[1]?.push,
                });
            });
        }
    }

    componentWillUnmount() {
        AccountRepository.off('accountUpdate', this.onAccountUpdate);
    }

    onAccountUpdate = (updateAccount: AccountModel) => {
        const { account } = this.state;

        if (account?.isValid() && updateAccount?.address === account.address) {           
            this.setState({
                account: updateAccount,
            });
        }
    };

    accountLabelPressed = () => {
        const { account } = this.state;

        Prompt(
            Localize.t('account.accountLabel'),
            Localize.t('account.pleaseEnterLabel'),
            [
                { text: Localize.t('global.cancel') },
                {
                    text: Localize.t('global.save'),
                    onPress: this.changeAccountLabel,
                },
            ],
            { type: 'plain-text', defaultValue: account.label },
        );
    };

    changeAccountLabel = (label: string) => {
        const { account } = this.state;

        if (!label || label === account.label) return;

        if (label.length > AppConfig.accountLabelLimit) {
            Alert.alert(Localize.t('global.error'), Localize.t('account.accountLabelCannotBeMoreThan'));
            return;
        }

        const labelClean = label.replace(/\n/g, '');

        AccountRepository.update({
            address: account.address,
            label: labelClean,
        });

        // Update name.
        BackendService.privateAccountInfo(account.address, labelClean);
    };

    showAccessLevelPicker = () => {
        const { account } = this.state;

        Navigator.push<PickerModalProps>(AppScreens.Global.Picker, {
            title: Localize.t('account.accessLevel'),
            description: Localize.t('account.accessLevelChangeAlert'),
            items: [
                { title: Localize.t('account.readOnly'), value: AccessLevels.Readonly },
                { title: Localize.t('account.fullAccess'), value: AccessLevels.Full },
            ],
            selected: account.accessLevel,
            onSelect: this.onAccessLevelSelected,
        });
    };

    onAccountDowngradeRequest = () => {
        const { account } = this.state;

        // auth with passcode for accounts with Passcode as encryption level
        if (account.encryptionLevel === EncryptionLevels.Passcode) {
            Navigator.showOverlay<AuthenticateOverlayProps>(AppScreens.Overlay.Auth, {
                canAuthorizeBiometrics: false,
                onSuccess: this.downgradeAccountAccessLevel,
            });
            // for accounts with passphrase auth with passphrase
        } else if (account.encryptionLevel === EncryptionLevels.Passphrase) {
            Navigator.showOverlay<PassphraseAuthenticationOverlayProps>(AppScreens.Overlay.PassphraseAuthentication, {
                account,
                onSuccess: this.downgradeAccountAccessLevel,
            });
        }
    };

    downgradeAccountAccessLevel = () => {
        const { account } = this.state;

        // downgrade the access level
        AccountRepository.downgrade(account).catch(() => {
            Alert.alert('Error', 'Unexpected error happened');
        });
    };

    onAccessLevelSelected = (item: any) => {
        const { account } = this.state;

        const accessLevel = item.value;

        // nothing changed
        if (accessLevel === account.accessLevel) return;

        // downgrading
        if (accessLevel === AccessLevels.Readonly && account.accessLevel === AccessLevels.Full) {
            Prompt(
                Localize.t('global.pleaseNote'),
                account.type === AccountTypes.Regular
                    ? Localize.t('account.downgradingAccessLevelWarning')
                    : Localize.t('account.downgradingAccessLevelWarningPhysical'),
                [
                    { text: Localize.t('global.cancel') },
                    {
                        text: Localize.t('global.doIt'),
                        onPress: this.onAccountDowngradeRequest,
                        style: 'destructive',
                    },
                ],
                { type: 'default' },
            );
            return;
        }

        // upgrading
        Prompt(
            Localize.t('global.notice'),
            Localize.t('account.upgradingAccessLevelWarning'),
            [
                { text: Localize.t('global.cancel') },
                {
                    text: Localize.t('global.doIt'),
                    testID: 'yes-iam-sure-button',
                    onPress: () => {
                        Navigator.push<AccountImportViewProps>(AppScreens.Account.Import, { upgradeAccount: account });
                    },
                },
            ],
            { type: 'default' },
        );
    };

    showChangePassphrase = () => {
        const { account } = this.props;
        Navigator.push<ChangePassphraseViewProps>(AppScreens.Account.Edit.ChangePassphrase, { account });
    };

    showIdentifyTangemCard = () => {
        const { account } = this.state;

        Navigator.push<IdentifyTangemCardViewProps>(AppScreens.Account.Edit.IdentifyTangemCard, { account });
    };

    showChangeTangemSecurity = () => {
        const { account } = this.props;
        Navigator.push<ChangeTangemSecurityViewProps>(AppScreens.Account.Edit.ChangeTangemSecurityEnforce, { account });
    };

    selectNextAccount = (skipAddress?: string) => {
        // check if we are removing default account, then we need to select another account as default
        const accounts = AccountRepository.getAccounts();
        const newAccount = first(filter(accounts, (a: any) => a.address !== skipAddress && !a?.hidden));
        CoreRepository.saveSettings({ account: newAccount });

        setTimeout(() => {
            this.reEnableFirstAccountIfNeeded(skipAddress);
        }, 100);
    };

    removeAccount = () => {
        const { account } = this.state;

        // Disable push
        BackendService.privateAccountInfo(account.address, '[REMOVED]', false);

        // get current core settings
        // const coreSettings = CoreRepository.getSettings();
        // check if we are removing default account, then we need to select another account as default
        // if (account.address === coreSettings.account?.address) {
        // }

        // remove account
        const skipAddress = account?.address;
        this.selectNextAccount(skipAddress);
        AccountRepository.purge(account);

        // pop the screen
        Navigator.pop();
    };

    onAccountRemoveRequest = () => {
        const { account } = this.state;

        // for readonly accounts just remove without any auth
        if (account.accessLevel === AccessLevels.Readonly) {
            this.removeAccount();
            return;
        }

        // auth with passcode for full access accounts
        Navigator.showOverlay<AuthenticateOverlayProps>(AppScreens.Overlay.Auth, {
            canAuthorizeBiometrics: false,
            onSuccess: this.removeAccount,
        });
    };

    onRemovePress = () => {
        const { account } = this.state;
        const tangemCard = account.type === AccountTypes.Tangem;

        Prompt(
            Localize.t('global.warning'),
            Localize.t(tangemCard ? 'account.accountRemoveTangemWarning' : 'account.accountRemoveWarning'),
            [
                { text: Localize.t('global.cancel') },
                {
                    text: Localize.t(tangemCard ? 'global.ok' : 'global.doIt'),
                    onPress: this.onAccountRemoveRequest,
                    style: 'destructive',
                },
            ],
            { type: 'default' },
        );
    };

    onTxPushChange = (value: boolean) => {
        const { account } = this.props;

        this.setState({
            pushEnabled: value,
            fetchingPushState: true,
        });

        BackendService.privateAccountInfo(account.address, account.label, value).then(() => {
            this.setState({
                fetchingPushState: false,
            });    
        });
    };

    reEnableFirstAccountIfNeeded = (skipAddress?: string) => {
        // If everything is hidden now, then re-enable the first one.
        setTimeout(() => {
            const visibleAccounts = AccountRepository
                .getAccounts({ hidden: false })
                .filter(a => a.address !== skipAddress);

            if (visibleAccounts.length === 0) {
                const allAccounts = AccountRepository
                    .getAccounts()
                    .filter(a => a.address !== skipAddress);

                if (allAccounts.length > 0) {
                    const firstAccount = first(allAccounts);
                    if (firstAccount) {
                        AccountRepository.update({ address: firstAccount.address, hidden: false });
                        CoreRepository.saveSettings({ account: firstAccount });
                    }
                }
            }
        }, 100);
    };

    onHiddenChange = (value: boolean) => {
        const { account } = this.props;

        // const coreSettings = CoreRepository.getSettings();

        if (value) {
            // const allAccounts = AccountRepository.getAccounts();
            // const hiddenAccounts = AccountRepository.getAccounts({ hidden: true });
            const visibleAccounts = AccountRepository.getAccounts({ hidden: false });

            // check if we are hiding all accounts
            if (visibleAccounts.filter(a => a.address !== account.address).length === 0) {
                Alert.alert(Localize.t('global.error'), Localize.t('account.unableToHideAllAccountsError'));
                return;
            }

            // // check if we are hiding the default account
            // if (coreSettings.account?.address === account.address) {
            //     // Alert.alert(Localize.t('global.error'), Localize.t('account.unableToHideDefaultAccountError'));
            //     // return;
            //     this.selectNextAccount(account);
            // }
        }

        // update account hidden value
        AccountRepository.update({
            address: account.address,
            hidden: value,
        });

        this.reEnableFirstAccountIfNeeded();
    };

    canAccountSign = (account: AccountModel) => {
        if (account.accessLevel === AccessLevels.Full) {
            return true;
        };
        
        if (account.accessLevel === AccessLevels.Readonly && account.regularKey) {
            const regularKeyAccount = AccountRepository.findOne({ address: account.regularKey });
            if (regularKeyAccount && regularKeyAccount.accessLevel === AccessLevels.Full) {
                return true;
            }
        };

        return false;
    };

    render() {
        const { account, fetchingPushState, pushAvailable, pushEnabled, accountCanSign } = this.state;
        if (!account?.isValid()) return null;
        const cardSecurity = {
            [TangemSecurity.Passcode]: Localize.t('global.passcode'),
            [TangemSecurity.AccessCode]: Localize.t('global.accessCode'),
            [TangemSecurity.LongTap]: Localize.t('global.longTap'),
        };
        return (
            <View testID="account-settings-screen" style={styles.container}>
                <Header
                    leftComponent={{ testID: 'back-button', icon: 'IconChevronLeft', onPress: Navigator.pop }}
                    centerComponent={{ text: Localize.t('account.accountSettings') }}
                />
                <ScrollView contentContainerStyle={sectionStyles.content}>
                    <View style={styles.identity}>
                        <Text accessibilityRole="header" style={styles.accountName}>
                            {accountListLabel(account)}
                        </Text>
                        <Text testID="address-label" style={styles.addressLabel}>
                            {Localize.t('global.address')}
                        </Text>
                        <Text selectable textBreakStrategy="simple" style={styles.address}>
                            {account.address}
                        </Text>
                    </View>
                    <SettingsSection title={Localize.t('global.general')}>
                        <SettingsRow
                            testID="account-label-button"
                            label={Localize.t('account.accountLabel')}
                            value={account.label}
                            onPress={this.accountLabelPressed}
                        />
                        {account.type === AccountTypes.Tangem && (
                            <CardDetails cardId={GetCardId(account.additionalInfo!)}
                                onIdentify={this.showIdentifyTangemCard} />
                        )}
                    </SettingsSection>
                    <SettingsSection title={Localize.t('global.security')}>
                        {account.type === AccountTypes.Regular && (
                            <SettingsRow
                                testID="account-access-level-button"
                                label={Localize.t('account.accessLevel')}
                                valueTestID="account-access-level-value"
                                onPress={this.showAccessLevelPicker}
                                value={Localize.t(
                                    account.accessLevel === AccessLevels.Full
                                        ? 'account.fullAccess'
                                        : 'account.readOnly',
                                )}
                            />
                        )}
                        {account.accessLevel === AccessLevels.Full &&
                            account.type !== AccountTypes.Tangem && (
                                <SettingsRow
                                    label={Localize.t('account.securityLevel')}
                                    value={
                                        account.encryptionLevel === EncryptionLevels.Passphrase
                                            ? 'Password'
                                            : account.encryptionLevel
                                    }
                                />
                            )}
                        {account.accessLevel === AccessLevels.Full &&
                            account.type !== AccountTypes.Tangem &&
                            account.encryptionLevel === EncryptionLevels.Passphrase && (
                                <SettingsRow
                                    testID="change-password-button"
                                    label={Localize.t('account.changePassword')}
                                    onPress={this.showChangePassphrase}
                                />
                            )}
                        {account.type === AccountTypes.Tangem && (
                            <SettingsRow
                                label={Localize.t('account.cardEnforcedSecurity')}
                                onPress={this.showChangeTangemSecurity}
                                value={
                                    cardSecurity[
                                        GetCardEnforcedSecurity(
                                            account.additionalInfo!,
                                        ) as keyof typeof cardSecurity
                                    ]
                                }
                            />
                        )}
                    </SettingsSection>
                    <SettingsSection title={Localize.t('global.settings')}>
                        {accountCanSign && (
                            <SettingsRow label={Localize.t('global.accounttxpush')}>
                                {fetchingPushState && <LoadingIndicator style={styles.inlineLoader} />}
                                <Switch
                                    checked={pushEnabled}
                                    isDisabled={fetchingPushState || !pushAvailable}
                                    onChange={this.onTxPushChange}
                                />
                            </SettingsRow>
                        )}
                        <SettingsRow label={Localize.t('global.hidden')}>
                            <Switch checked={account.hidden} onChange={this.onHiddenChange} />
                        </SettingsRow>
                    </SettingsSection>
                    <Button
                        label={Localize.t('account.removeFromXaman')}
                        icon="IconTrash"
                        light
                        allowFontScaling
                        iconStyle={styles.removeIcon}
                        textStyle={styles.removeText}
                        style={styles.removeButton}
                        onPress={this.onRemovePress}
                    />
                </ScrollView>
            </View>
        );
    }
}

export default AccountSettingsView;
