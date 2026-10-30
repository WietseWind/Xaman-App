import React, { Component } from 'react';
import {
    Alert,
    Dimensions,
    Image,
    LayoutChangeEvent,
    Platform,
    SafeAreaView,
    ScrollView,
    Text,
    View,
} from 'react-native';

import * as AccountLib from 'xrpl-accountlib';

import RNTangemSdk from 'tangem-sdk-react-native';

import LoggerService from '@services/LoggerService';
import StyleService from '@services/StyleService';

import { AccountRepository } from '@store/repositories';
import { AccountModel } from '@store/models';

import { accountListLabel } from '@common/helpers/accountListLabel';
import { AppScreens } from '@common/constants';
import { WebLinks } from '@common/constants/endpoints';
import { DefaultDerivationPaths, GetCardId, GetWalletDerivedPublicKey } from '@common/utils/tangem';
import { startTangemOfflineSession } from '@common/utils/tangemSession';
import { registerTangemIdentifyExit, waitForTangemIdentifyCleanup } from '@common/utils/tangemIdentifyNavigation';
import {
    identifyScannedTangemSerial,
    tangemCardSerial,
    tangemIdentifySessionLog,
    TangemAccountRef,
    TangemIdentifyOutcome,
} from '@common/utils/tangemIdentify';

import { Button } from '@components/General/Button';
import { Avatar } from '@components/General/Avatar';
import { Footer } from '@components/General/Footer';
import { Header } from '@components/General/Header';
import { Icon } from '@components/General/Icon';
import { Spacer } from '@components/General/Spacer';

import Localize from '@locale';

import AppSizes from '@theme/sizes';
import styles from './styles';

/* Types ==================================================================== */
export interface Props {
    account: AccountModel;
    componentId?: string;
}

interface State {
    phase: 'explain' | 'result';
    scanning: boolean;
    outcome?: TangemIdentifyOutcome;
    scannedSerial?: string;
    scannedAddress?: string;
    bodyHeight?: number;
    androidBottomInset: number;
}

const TANGEM_CANCELLED = 'The user cancelled the operation';

/* Component ==================================================================== */
class IdentifyTangemCardView extends Component<Props, State> {
    static screenName = AppScreens.Account.Edit.IdentifyTangemCard;

    static options() {
        return {
            bottomTabs: { visible: false },
            layout: { componentBackgroundColor: styles.container.backgroundColor },
            navigationBar: { backgroundColor: styles.container.backgroundColor },
        };
    }

    private readonly serial: string;

    private mounted = false;

    private scanningCard = false;

    private exiting = false;

    private resourceDone: Promise<void> = Promise.resolve();

    private completeResource: () => void = () => undefined;

    private exitPromise?: Promise<void>;

    private unregisterExit?: () => void;

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
            androidBottomInset: 0,
        };
    }

    componentDidMount() {
        this.mounted = true;
        this.unregisterExit = registerTangemIdentifyExit(this.requestExit);
    }

    componentWillUnmount() {
        this.mounted = false;
        this.exiting = true;
        this.unregisterExit?.();
    }

    requestExit = (): Promise<void> => {
        if (this.exitPromise) {
            return this.exitPromise;
        }

        this.exiting = true;
        this.exitPromise = (async () => {
            // stopSession resets SDK configuration; it does not cancel the native NFC prompt.
            // Keep this screen until the owned operation and its cleanup have finished.
            await this.resourceDone;
            if (!this.mounted) {
                return;
            }

            const { Navigation } = require('react-native-navigation') as typeof import('react-native-navigation');
            const { componentId } = this.props;
            await Navigation.pop(componentId || IdentifyTangemCardView.screenName);
        })().catch((error) => {
            this.exiting = false;
            this.exitPromise = undefined;
            if (this.mounted) {
                this.setState({ scanning: this.scanningCard });
            }
            throw error;
        });

        return this.exitPromise;
    };

    leave = () => {
        this.requestExit().catch((error) => {
            LoggerService.recordError('Unable to close Tangem identification', error);
            if (this.mounted) {
                this.showTangemError(error);
            }
        });
    };

    tangemErrorMessage = (error: { message?: string } | undefined): string | undefined => {
        return typeof error?.message === 'string' ? error.message : undefined;
    };

    showTangemError = (error: unknown, stage = 'navigation') => {
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown';
        const context = `Tangem ${stage} failed (${code})`;
        // Visible in the Metro log. The alert stays the normal session-log message.
        // eslint-disable-next-line no-console
        console.error(
            '[Identify] Tangem scan failed', context, this.tangemErrorMessage(error as { message?: string }) || error,
        );
        LoggerService.recordError(`Unexpected error while identifying a Tangem card: ${context}`, error);
        Alert.alert(
            Localize.t('global.unexpectedErrorOccurred'),
            Localize.t('global.pleaseCheckSessionLogForMoreInfo'),
        );
    };

    onNext = async () => {
        if (!this.mounted || this.exiting || this.scanningCard) {
            return;
        }

        this.scanningCard = true;
        this.setState({ scanning: true });
        this.resourceDone = new Promise<void>((resolve) => {
            this.completeResource = resolve;
        });
        let ownsSession = false;
        let stage = 'session start';

        try {
            await waitForTangemIdentifyCleanup();
            if (!this.mounted || this.exiting) {
                return;
            }

            await startTangemOfflineSession({ defaultDerivationPaths: DefaultDerivationPaths });
            ownsSession = true;
            if (!this.mounted || this.exiting) {
                return;
            }

            stage = 'scan';
            const card = await RNTangemSdk.scanCard({ initialMessage: Localize.t('account.tangemScanHint') });
            const { account } = this.props;

            if (!this.mounted || this.exiting) {
                return;
            }

            stage = 'card result';
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
            let scannedAddress: string | undefined;

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
                    scannedAddress: scannedAddress || 'unknown',
                    outcome,
                }),
            );

            this.setState({
                phase: 'result',
                outcome,
                scannedSerial,
                scannedAddress,
            });
        } catch (error: any) {
            if (!this.mounted || this.exiting) {
                return;
            }

            if (String(error?.code) === '50002' || this.tangemErrorMessage(error) === TANGEM_CANCELLED) {
                this.leave();
                return;
            }

            this.showTangemError(error, stage);
        } finally {
            try {
                if (ownsSession) {
                    await RNTangemSdk.stopSession();
                }
            } catch (error) {
                LoggerService.recordError('Tangem identify session cleanup', error);
            } finally {
                this.scanningCard = false;
                // Keep this callback out of generator catch/finally local-variable slots.
                this.completeResource();
                this.completeResource = () => undefined;
                if (this.mounted && !this.exiting) {
                    this.setState({ scanning: false });
                }
            }
        }
    };

    onRootLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
        if (Platform.OS !== 'android' || !this.mounted) return;
        const { androidBottomInset } = this.state;
        const excluded = Math.max(0, Dimensions.get('screen').height - layout.height);
        const bottom = Math.max(0, AppSizes.safeAreaBottomInset - excluded);
        if (bottom !== androidBottomInset) this.setState({ androidBottomInset: bottom });
    };

    onBodyLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
        const { bodyHeight } = this.state;
        if (this.mounted && layout.height !== bodyHeight) this.setState({ bodyHeight: layout.height });
    };

    isCompact = () => {
        const { bodyHeight } = this.state;
        return (bodyHeight ?? AppSizes.screen.height - 220) < 520;
    };

    renderAccount = (account: TangemAccountRef, heading: string, serial?: string) => {
        const cardSerial = serial || tangemCardSerial(account);

        return (
            <View style={styles.accountSection}>
                <Text style={styles.sectionLabel}>{heading}</Text>
                <Spacer size={8} />
                <View style={styles.accountCard}>
                    <View style={styles.accountIdentity}>
                        <Avatar
                            source={{ uri: `${WebLinks.AvatarURL}/${account.address}_180_50.png` }}
                            backgroundColor="transparent"
                            size={38}
                        />
                        <View style={styles.accountText}>
                            <Text style={styles.accountName} numberOfLines={1}>
                                {accountListLabel(account)}
                            </Text>
                            <Text
                                testID={`identify-address-${account.address}`}
                                style={styles.address}
                                textBreakStrategy="simple"
                                selectable
                            >
                                {account.address}
                            </Text>
                        </View>
                    </View>
                    {!!cardSerial && (
                        <View style={styles.serialSection}>
                            <Text style={styles.serialLabel}>{Localize.t('account.cardId')}</Text>
                            <Text style={styles.serial} textBreakStrategy="simple" selectable>
                                {cardSerial}
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        );
    };

    renderExplain = () => {
        const { account } = this.props;
        const compact = this.isCompact();

        return (
            <>
                <Image
                    source={StyleService.getImage('ImageIdentifyTangem')}
                    style={[styles.cardGraphic, compact && styles.cardGraphicCompact]}
                    resizeMode="contain"
                    accessible={false}
                />
                <Spacer size={compact ? 12 : 18} />
                <Text style={styles.title} accessibilityRole="header">
                    {Localize.t('account.identifyTangemStartTitle')}
                </Text>
                <Spacer size={8} />
                <Text style={styles.explain}>{Localize.t('account.identifyTangemExplain')}</Text>
                <Spacer size={compact ? 18 : 24} />
                {this.renderAccount(account, Localize.t('account.tangemSelectedAccount'), this.serial)}
                {!compact && (
                    <>
                        <Spacer size={18} />
                        <View style={styles.hint}>
                            <Icon name="IconScanCard" size={16} style={styles.hintIcon} />
                            <Text style={styles.hintText}>{Localize.t('account.tangemScanHint')}</Text>
                        </View>
                    </>
                )}
            </>
        );
    };

    renderResult = () => {
        const { account } = this.props;
        const { outcome, scannedSerial, scannedAddress } = this.state;

        if (!outcome) {
            return null;
        }

        if (outcome.outcome === 'match') {
            return (
                <>
                    <View style={[styles.resultSymbol, styles.resultGreen]}>
                        <Icon name="IconCheck" size={32} style={styles.iconGreen} />
                    </View>
                    <Spacer size={AppSizes.paddingSml} />
                    <Text style={styles.title} accessibilityRole="header">
                        {Localize.t('account.tangemRightCard')}
                    </Text>
                    <Spacer size={AppSizes.paddingExtraSml} />
                    <Text style={styles.explain}>{Localize.t('account.tangemMatchedExplain')}</Text>
                    <Spacer size={AppSizes.padding} />
                    {this.renderAccount(account, Localize.t('account.tangemCardSavedFor'), this.serial)}
                </>
            );
        }

        if (outcome.outcome === 'known') {
            return (
                <>
                    <View style={[styles.resultSymbol, styles.resultOrange]}>
                        <Icon name="IconV2Swap" size={28} style={[styles.iconOrange, styles.swapIcon]} />
                    </View>
                    <Spacer size={AppSizes.paddingSml} />
                    <Text style={styles.title} accessibilityRole="header">
                        {Localize.t('account.tangemDifferentCard')}
                    </Text>
                    <Spacer size={AppSizes.paddingExtraSml} />
                    <Text style={styles.explain}>{Localize.t('account.tangemCardKnownAs')}</Text>
                    <Spacer size={AppSizes.padding} />
                    {this.renderAccount(account, Localize.t('account.tangemSelectedAccount'), this.serial)}
                    <Spacer size={AppSizes.paddingSml} />
                    {this.renderAccount(outcome.account, Localize.t('account.tangemCardSavedFor'), scannedSerial)}
                </>
            );
        }

        return (
            <>
                <View style={[styles.resultSymbol, styles.resultUnknown]}>
                    <Icon name="IconScanCard" size={32} style={styles.unknownIcon} />
                </View>
                <Spacer size={AppSizes.paddingSml} />
                <Text style={styles.title} accessibilityRole="header">
                    {Localize.t('account.tangemCardNotSaved')}
                </Text>
                <Spacer size={AppSizes.paddingExtraSml} />
                <Text style={styles.explain}>{Localize.t('account.tangemCardNotImported')}</Text>
                <Spacer size={AppSizes.padding} />
                {this.renderAccount(account, Localize.t('account.tangemSelectedAccount'), this.serial)}
                {!!scannedSerial && (
                    <>
                        <Spacer size={AppSizes.paddingSml} />
                        <View style={styles.accountSection}>
                            <Text style={styles.sectionLabel}>{Localize.t('account.tangemScannedAccount')}</Text>
                            <Spacer size={8} />
                            <View style={styles.accountCard}>
                                {!!scannedAddress && (
                                    <Text
                                        testID={`identify-address-${scannedAddress}`}
                                        style={styles.address}
                                        textBreakStrategy="simple"
                                        selectable
                                    >
                                        {scannedAddress}
                                    </Text>
                                )}
                                <View style={scannedAddress ? styles.serialSection : styles.serialOnly}>
                                    <Text style={styles.serialLabel}>{Localize.t('account.cardId')}</Text>
                                    <Text style={styles.serial} textBreakStrategy="simple" selectable>
                                        {scannedSerial}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </>
                )}
            </>
        );
    };

    renderFooter = () => {
        const { phase, scanning, outcome } = this.state;

        if (phase === 'result') {
            const matched = outcome?.outcome === 'match';

            return (
                <>
                    <Button
                        testID={matched ? 'close-button' : 'scan-again-button'}
                        label={Localize.t(matched ? 'global.done' : 'account.tangemScanAgain')}
                        icon={matched ? undefined : 'IconScanCard'}
                        onPress={matched ? this.leave : this.onNext}
                        isLoading={!matched && scanning}
                        isDisabled={scanning}
                        style={styles.button}
                        textStyle={styles.primaryButtonText}
                        iconStyle={styles.buttonIcon}
                        loadingIndicatorStyle="light"
                    />
                    <Spacer size={4} />
                    <Button
                        testID={matched ? 'scan-again-button' : 'close-button'}
                        label={Localize.t(matched ? 'account.tangemScanAgain' : 'global.done')}
                        onPress={matched ? this.onNext : this.leave}
                        isLoading={matched && scanning}
                        isDisabled={scanning}
                        style={[styles.button, styles.secondaryButton]}
                        textStyle={styles.secondaryButtonText}
                        loadingIndicatorStyle="default"
                        transparent
                    />
                </>
            );
        }

        return (
            <>
                <Button
                    testID="next-button"
                    label={Localize.t('account.tangemScanCard')}
                    icon="IconScanCard"
                    onPress={this.onNext}
                    isLoading={scanning}
                    isDisabled={scanning}
                    style={styles.button}
                    textStyle={styles.primaryButtonText}
                    iconStyle={styles.buttonIcon}
                    loadingIndicatorStyle="light"
                />
                <Spacer size={4} />
                <Button
                    testID="back-button"
                    label={Localize.t('global.back')}
                    onPress={this.leave}
                    isDisabled={scanning}
                    style={[styles.button, styles.secondaryButton]}
                    textStyle={styles.secondaryButtonText}
                    transparent
                />
            </>
        );
    };

    render() {
        const { phase, androidBottomInset } = this.state;
        const compact = this.isCompact();

        return (
            <SafeAreaView
                testID="identify-tangem-card-screen"
                onLayout={this.onRootLayout}
                style={[
                    styles.container,
                    Platform.OS === 'android' && {
                        paddingTop: AppSizes.statusBarHeight,
                        paddingBottom: androidBottomInset,
                    },
                ]}
            >
                <Header
                    containerStyle={styles.header}
                    leftComponent={{
                        testID: 'header-back-button',
                        icon: 'IconChevronLeft',
                        iconSize: 20,
                        iconStyle: styles.headerIcon,
                        onPress: this.leave,
                    }}
                    centerComponent={{
                        text: Localize.t('account.identifyTangemTitle'),
                        textStyle: styles.headerTitle,
                    }}
                />
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={[styles.body, compact && styles.bodyCompact]}
                    onLayout={this.onBodyLayout}
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                >
                    {phase === 'explain' ? this.renderExplain() : this.renderResult()}
                </ScrollView>
                <Footer style={styles.footer}>{this.renderFooter()}</Footer>
            </SafeAreaView>
        );
    }
}

export default IdentifyTangemCardView;
