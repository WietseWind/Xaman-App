import React, { Component } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import * as AccountLib from 'xrpl-accountlib';

import RNTangemSdk from 'tangem-sdk-react-native';

import LoggerService from '@services/LoggerService';

import { AccountRepository } from '@store/repositories';
import { AccountModel } from '@store/models';

import { accountListLabel } from '@common/helpers/accountListLabel';
import { AppScreens } from '@common/constants';
import { GetCardId, GetWalletDerivedPublicKey } from '@common/utils/tangem';
import {
    identifyScannedTangemSerial,
    tangemIdentifySessionLog,
    TangemAccountRef,
    TangemIdentifyOutcome,
} from '@common/utils/tangemIdentify';

import { Button } from '@components/General/Button';
import { Footer } from '@components/General/Footer';
import { Header } from '@components/General/Header';
import { Icon } from '@components/General/Icon';
import { Spacer } from '@components/General/Spacer';
import { AccountElement } from '@components/Modules/AccountElement';

import Localize from '@locale';

import { AppStyles } from '@theme';
import styles from './styles';

/* Types ==================================================================== */
export interface Props {
    account: AccountModel;
}

interface State {
    phase: 'explain' | 'result';
    scanning: boolean;
    outcome?: TangemIdentifyOutcome;
}

const TANGEM_CANCELLED = 'The user cancelled the operation';

/* Component ==================================================================== */
class IdentifyTangemCardView extends Component<Props, State> {
    static screenName = AppScreens.Account.Edit.IdentifyTangemCard;

    static options() {
        return {
            bottomTabs: { visible: false },
        };
    }

    private readonly serial: string;

    private mounted = false;

    private scanningCard = false;

    constructor(props: Props) {
        super(props);

        this.serial = '';
        try {
            if (props.account.additionalInfo) {
                this.serial = GetCardId(props.account.additionalInfo);
            }
        } catch (error) {
            LoggerService.recordError('Unable to read Tangem card serial', error);
        }

        this.state = {
            phase: 'explain',
            scanning: false,
        };
    }

    componentDidMount() {
        this.mounted = true;
    }

    componentWillUnmount() {
        this.mounted = false;
        RNTangemSdk.stopSession().catch(() => undefined);
    }

    leave = () => {
        this.mounted = false;
        RNTangemSdk.stopSession().catch(() => undefined);
        // Resolved on press. A top-level import is still empty while this screen is loading.
        const { Navigation } = require('react-native-navigation') as typeof import('react-native-navigation');
        Navigation.pop(AppScreens.Account.Edit.IdentifyTangemCard).catch(() => undefined);
    };

    tangemErrorMessage = (error: { message?: string } | undefined): string | undefined => {
        return typeof error?.message === 'string' ? error.message : undefined;
    };

    showTangemError = (error: unknown) => {
        // Visible in the Metro log. The alert stays the normal session-log message.
        // eslint-disable-next-line no-console
        console.error('[Identify] Tangem scan failed', this.tangemErrorMessage(error as { message?: string }) || error);
        LoggerService.recordError('Unexpected error while identifying a Tangem card', error);
        Alert.alert(
            Localize.t('global.unexpectedErrorOccurred'),
            Localize.t('global.pleaseCheckSessionLogForMoreInfo'),
        );
    };

    onNext = async () => {
        if (!this.mounted || this.scanningCard) {
            return;
        }

        this.scanningCard = true;
        this.setState({ scanning: true });

        try {
            // Called on the native module directly. The shared helper is undefined here
            // because this screen is still loading when that module finishes initializing.
            RNTangemSdk.startSession({ attestationMode: 'offline' }).catch((error) => {
                LoggerService.recordError('Tangem identify session start', error);
            });

            const card = await RNTangemSdk.scanCard();
            const { account } = this.props;

            if (!this.mounted) {
                return;
            }

            let accounts: TangemAccountRef[] = [];
            try {
                accounts = Array.from(AccountRepository.getAccounts()).map((item) => ({
                    address: item.address,
                    label: item.label,
                    type: item.type,
                    additionalInfo: item.additionalInfo,
                }));
            } catch (error) {
                LoggerService.recordError('Tangem identify could not read accounts', error);
            }

            const scannedSerial = card?.cardId || GetCardId(card);
            const outcome = identifyScannedTangemSerial(scannedSerial, this.serial, accounts);
            let scannedAddress = 'unknown';

            try {
                scannedAddress = AccountLib.utils.deriveAddress(GetWalletDerivedPublicKey(card));
            } catch (error) {
                LoggerService.recordError('Tangem identify could not derive the scanned address', error);
            }

            LoggerService.createLogger('Identify').debug(
                tangemIdentifySessionLog({
                    lookingForSerial: this.serial,
                    lookingForAddress: account.address,
                    scannedSerial,
                    scannedAddress,
                    outcome,
                }),
            );

            this.setState({
                scanning: false,
                phase: 'result',
                outcome,
            });
        } catch (error: any) {
            if (!this.mounted) {
                return;
            }

            this.setState({ scanning: false });

            if (this.tangemErrorMessage(error) === TANGEM_CANCELLED) {
                this.leave();
                return;
            }

            this.showTangemError(error);
        } finally {
            this.scanningCard = false;
        }
    };

    renderAccount = (account: { address: string; label?: string | null; type?: string }) => {
        return (
            <View style={styles.accountCard}>
                <AccountElement
                    address={account.address}
                    avatarBackgroundColor="transparent"
                    info={{
                        address: account.address,
                        name: accountListLabel(account),
                        source: 'accounts',
                    }}
                    visibleElements={{
                        avatar: true,
                        source: false,
                        menu: false,
                        tag: false,
                    }}
                />
            </View>
        );
    };

    renderExplain = () => {
        const { account } = this.props;

        return (
            <>
                <Text style={styles.explain}>{Localize.t('account.identifyTangemExplain')}</Text>
                <Spacer size={24} />
                {this.renderAccount(account)}
            </>
        );
    };

    renderResult = () => {
        const { account } = this.props;
        const { outcome } = this.state;

        if (!outcome || outcome.outcome === 'match') {
            return (
                <>
                    <View style={[styles.resultBox, styles.resultGreen]}>
                        <Icon name="IconCheck" size={64} style={[styles.icon, styles.iconGreen]} />
                        <Spacer size={16} />
                        <Text style={[styles.resultTitle, styles.textGreen]}>
                            {Localize.t('account.tangemRightCard')}
                        </Text>
                    </View>
                    <View style={styles.knownAccount}>
                        {this.renderAccount(account)}
                    </View>
                </>
            );
        }

        if (outcome.outcome === 'known') {
            return (
                <>
                    <View style={[styles.resultBox, styles.resultOrange]}>
                        <Icon name="IconAlertTriangle" size={64} style={[styles.icon, styles.iconOrange]} />
                        <Spacer size={16} />
                        <Text style={[styles.resultTitle, styles.textOrange]}>
                            {Localize.t('account.tangemDifferentCard')}
                        </Text>
                        <Spacer size={20} />
                        <Text style={[styles.explain, styles.textOrange]}>
                            {Localize.t('account.tangemCardKnownAs')}
                        </Text>
                    </View>
                    <View style={styles.knownAccount}>
                        {this.renderAccount(outcome.account)}
                    </View>
                </>
            );
        }

        return (
            <View style={[styles.resultBox, styles.resultRed]}>
                <Icon name="IconAlertTriangle" size={64} style={[styles.icon, styles.iconRed]} />
                <Spacer size={16} />
                <Text style={[styles.resultTitle, styles.textRed]}>
                    {Localize.t('account.tangemDifferentCard')}
                </Text>
                <Spacer size={20} />
                <Text style={[styles.explain, styles.textRed]}>
                    {Localize.t('account.tangemCardNotImported')}
                </Text>
            </View>
        );
    };

    renderFooter = () => {
        const { phase, scanning } = this.state;

        if (phase === 'result') {
            return (
                <Button
                    testID="close-button"
                    label={Localize.t('global.close')}
                    onPress={this.leave}
                />
            );
        }

        return (
            <View style={[AppStyles.row, AppStyles.centerAligned]}>
                <View style={[AppStyles.flex3, AppStyles.paddingRightSml]}>
                    <Button
                        testID="back-button"
                        label={Localize.t('global.back')}
                        icon="IconChevronLeft"
                        onPress={this.leave}
                        light
                    />
                </View>
                <View style={AppStyles.flex5}>
                    <Button
                        testID="next-button"
                        label={Localize.t('global.next')}
                        onPress={this.onNext}
                        isLoading={scanning}
                        isDisabled={scanning}
                    />
                </View>
            </View>
        );
    };

    render() {
        const { phase } = this.state;

        return (
            <View testID="identify-tangem-card-screen" style={styles.container}>
                <Header
                    leftComponent={{
                        testID: 'header-back-button',
                        icon: 'IconChevronLeft',
                        onPress: this.leave,
                    }}
                    centerComponent={{ text: Localize.t('account.identifyTangemTitle') }}
                />
                <ScrollView contentContainerStyle={styles.body}>
                    {phase === 'explain' ? this.renderExplain() : this.renderResult()}
                </ScrollView>
                <Footer safeArea>{this.renderFooter()}</Footer>
            </View>
        );
    }
}

export default IdentifyTangemCardView;
