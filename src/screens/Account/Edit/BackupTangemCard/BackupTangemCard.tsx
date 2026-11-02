import React, { Component } from 'react';
import {
    BackHandler,
    Dimensions,
    Image,
    LayoutChangeEvent,
    Platform,
    SafeAreaView,
    ScrollView,
    Text,
    View,
} from 'react-native';
import { get } from 'lodash';
import { Navigation } from 'react-native-navigation';
import BigNumber from 'bignumber.js';

import NetworkService from '@services/NetworkService';
import AppService, { AppStateStatus } from '@services/AppService';
import NavigationService from '@services/NavigationService';
import StyleService from '@services/StyleService';
import LoggerService from '@services/LoggerService';
import { AccountModel } from '@store/models';
import { AppScreens } from '@common/constants';
import { TangemBackupFlow, BackupState } from '@common/libs/tangemBackup/flow';
import { nativeBackupDependencies } from '@common/libs/tangemBackup/native';
import {
    backupCardSerial,
    savedBackupCard,
    TangemBackupAccount,
    TangemBackupErrorCode,
} from '@common/utils/tangemBackup';
import { registerTangemIdentifyExit } from '@common/utils/tangemIdentifyNavigation';
import { accountListLabel } from '@common/helpers/accountListLabel';
import { Button } from '@components/General/Button';
import { Footer } from '@components/General/Footer';
import { Header } from '@components/General/Header';
import { Icon } from '@components/General/Icon';
import { Spacer } from '@components/General/Spacer';
import Localize from '@locale';
import AppSizes from '@theme/sizes';
import styles from './styles';

export interface Props {
    account: AccountModel;
    componentId?: string;
}
interface State extends BackupState {
    androidBottomInset: number;
}

const errorKey = (error: TangemBackupErrorCode) => {
    if (['sourceUnavailable', 'cardChanged', 'softwareAccount', 'invalidCard'].includes(error)) {
        return 'invalidCard';
    }
    if (['contextChanged', 'accountChanged'].includes(error)) return 'contextChanged';
    if (['unavailable', 'failed', 'expired'].includes(error)) return 'retry';
    return error;
};

class BackupTangemCardView extends Component<Props, State> {
    static screenName = AppScreens.Account.Edit.BackupTangemCard;
    static options() {
        return {
            bottomTabs: { visible: false },
            popGesture: false,
            layout: { componentBackgroundColor: styles.container.backgroundColor },
            navigationBar: { backgroundColor: styles.container.backgroundColor },
        };
    }
    private mounted = false;
    private interrupted = false;
    private exiting = false;
    private exitPromise?: Promise<void>;
    private statusTimer?: ReturnType<typeof setTimeout>;
    private statusChecks = 0;
    private disposers: (() => void)[] = [];
    readonly flow: TangemBackupFlow;
    private readonly asset = NetworkService.getNativeAsset();
    private readonly networkName = NetworkService.getNetwork().name;

    constructor(props: Props) {
        super(props);
        const source = {
            address: props.account.address,
            label: props.account.label,
            card: JSON.parse(JSON.stringify(savedBackupCard(props.account) || {})),
        };
        this.flow = new TangemBackupFlow(
            source,
            nativeBackupDependencies(props.account, () => this.mounted && !this.interrupted && !this.exiting),
            (state) => {
                if (this.mounted && !this.exiting) this.setState(state);
            },
        );
        this.state = { ...this.flow.state, androidBottomInset: 0 };
    }
    componentDidMount() {
        this.mounted = true;
        this.disposers.push(registerTangemIdentifyExit(this.requestExit));
        NetworkService.on('networkChange', this.interrupt);
        NavigationService.on('setRoot', this.interrupt);
        const commands = Navigation.events().registerCommandListener((name, params) => {
            if (
                name === 'setRoot' ||
                (name === 'showOverlay' &&
                    [
                        get(params, 'layout.id'),
                        get(params, 'layout.data.name'),
                        get(params, 'layout.component.id'),
                        get(params, 'layout.component.name'),
                    ].includes(AppScreens.Overlay.Lock))
            ) {
                this.interrupt();
            }
        });
        const back = BackHandler.addEventListener('hardwareBackPress', () => {
            this.leave();
            return true;
        });
        this.disposers.push(
            () => commands.remove(),
            () => back.remove(),
        );
    }
    componentDidUpdate(_props: Props, previous: State) {
        const { step, busy } = this.state;
        if (previous.step !== 'checking' && step === 'checking') this.statusChecks = 0;
        if (step !== 'checking' || busy || this.exiting) {
            if (this.statusTimer) clearTimeout(this.statusTimer);
            this.statusTimer = undefined;
        } else if (!this.statusTimer && this.statusChecks < 30) {
            this.statusTimer = setTimeout(() => {
                this.statusTimer = undefined;
                if (!this.mounted || this.exiting || this.interrupted) return;
                this.statusChecks += 1;
                if (AppService.currentAppState === AppStateStatus.Active) this.flow.checkStatus();
                else this.forceUpdate();
            }, 2500);
        }
    }
    componentWillUnmount() {
        this.mounted = false;
        this.interrupted = true;
        if (this.statusTimer) clearTimeout(this.statusTimer);
        NetworkService.off('networkChange', this.interrupt);
        NavigationService.off('setRoot', this.interrupt);
        this.disposers.forEach((dispose) => dispose());
        this.flow.exit();
    }
    interrupt = () => {
        this.interrupted = true;
        this.leave();
    };
    requestExit = (): Promise<void> => {
        if (this.exitPromise) return this.exitPromise;
        this.exiting = true;
        if (this.statusTimer) clearTimeout(this.statusTimer);
        this.statusTimer = undefined;
        this.exitPromise = (async () => {
            await this.flow.exit();
            const { componentId } = this.props;
            if (this.mounted) await Navigation.pop(componentId || BackupTangemCardView.screenName);
        })().catch((error) => {
            this.exitPromise = undefined;
            throw error;
        });
        return this.exitPromise;
    };
    leave = () => {
        this.requestExit().catch((error) =>
            LoggerService.recordError('Unable to close Tangem back-up', error),
        );
    };
    onLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
        if (Platform.OS !== 'android') return;
        const excluded = Math.max(0, Dimensions.get('screen').height - layout.height);
        const bottom = Math.max(0, AppSizes.safeAreaBottomInset - excluded);
        const { androidBottomInset } = this.state;
        if (bottom !== androidBottomInset) this.setState({ androidBottomInset: bottom });
    };
    renderCard = (account: TangemBackupAccount, heading: string, serial?: string, chip?: string) => (
        <View style={styles.accountSection}>
            <Text style={styles.sectionLabel}>{heading}</Text>
            <Spacer size={8} />
            <View style={styles.accountCard}>
                {!!chip && (
                    <Text
                        style={[styles.chip, chip === Localize.t('tangemBackup.newCard') && styles.newChip]}
                    >
                        {chip}
                    </Text>
                )}
                <Text style={styles.accountName}>{accountListLabel(account)}</Text>
                {!!account.address && (
                    <Text selectable style={styles.address}>
                        {account.address}
                    </Text>
                )}
                {!!serial && (
                    <View style={styles.serialSection}>
                        <Text style={styles.serialLabel}>{Localize.t('account.cardId')}</Text>
                        <Text selectable style={styles.serial}>
                            {serial}
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );
    renderArt = () => {
        const { step } = this.state;
        return (
            <View style={styles.artwork} accessible={false}>
                <Image
                    source={StyleService.getImage('ImageIdentifyTangem')}
                    resizeMode="contain"
                    style={[
                        styles.blueCard,
                        step === 'source' && styles.front,
                        ['backup', 'ready'].includes(step) && styles.faded,
                    ]}
                />
                <Image
                    source={StyleService.getImage('ImageBackupTangem')}
                    resizeMode="contain"
                    style={[styles.goldCard, step === 'source' && styles.faded]}
                />
            </View>
        );
    };
    renderBody = () => {
        const { step, backup, sourceVerified, transaction, error, scannedSerial } = this.state;
        const source = { type: 'Tangem', address: this.flow.source.address, label: this.flow.source.label };
        const titleKey = {
            intro: 'introTitle',
            source: 'sourceTitle',
            backup: 'backupTitle',
            ready: 'readyTitle',
            review: 'reviewTitle',
            checking: 'checkingTitle',
            done: 'doneTitle',
        }[step];
        const bodyKey = {
            intro: 'introBody',
            source: 'sourceBody',
            backup: 'backupBody',
            ready: 'readyBody',
            review: 'reviewBody',
            checking: 'checkingBody',
            done: 'doneBody',
        }[step];
        const number = step === 'source' ? 1 : ['backup', 'ready'].includes(step) ? 2 : 3;
        return (
            <>
                {!['intro', 'done'].includes(step) && (
                    <View style={styles.progress}>
                        <Text style={styles.stepText}>{Localize.t('tangemBackup.step', { number })}</Text>
                        <View style={styles.progressTrack}>
                            <View style={[styles.progressFill, { width: `${(number / 3) * 100}%` }]} />
                        </View>
                    </View>
                )}
                {step === 'done' ? (
                    <View style={[styles.resultSymbol, styles.resultGreen]}>
                        <Icon name="IconCheck" size={32} style={styles.iconGreen} />
                    </View>
                ) : !['review', 'checking'].includes(step) ? (
                    this.renderArt()
                ) : null}
                <Spacer size={16} />
                <Text accessibilityRole="header" style={styles.title}>
                    {Localize.t(`tangemBackup.${titleKey}`)}
                </Text>
                <Spacer size={8} />
                <Text style={styles.explain}>{Localize.t(`tangemBackup.${bodyKey}`)}</Text>
                {step === 'intro' && (
                    <Text style={styles.instruction}>{Localize.t('tangemBackup.steps')}</Text>
                )}
                {!!error && (
                    <View
                        testID="backup-error"
                        accessibilityLiveRegion="polite"
                        style={[styles.error, error === 'sameCard' && styles.redError]}
                    >
                        <Text style={styles.errorText}>{Localize.t(`tangemBackup.${errorKey(error)}`)}</Text>
                        {error === 'wrongSource' && !!scannedSerial && (
                            <Text selectable style={styles.serial}>
                                {Localize.t('account.tangemScannedAccount')}: {scannedSerial}
                            </Text>
                        )}
                    </View>
                )}
                <Spacer size={20} />
                {this.renderCard(
                    source,
                    Localize.t('tangemBackup.sourceLabel'),
                    backupCardSerial(this.flow.source.card),
                    sourceVerified ? Localize.t('tangemBackup.verified') : undefined,
                )}
                {!!backup && step !== 'intro' && step !== 'source' && (
                    <>
                        <Text style={styles.connector}>{Localize.t('tangemBackup.connector')}</Text>
                        {this.renderCard(
                            backup.account,
                            Localize.t('tangemBackup.title'),
                            backupCardSerial(backup.card),
                            backup.newlyAdded ? Localize.t('tangemBackup.newCard') : undefined,
                        )}
                    </>
                )}
                {transaction && ['review', 'checking'].includes(step) && (
                    <View style={styles.gap}>
                        <View style={styles.fee}>
                            <Text style={styles.feeLabel}>{Localize.t('global.network')}</Text>
                            <Text style={styles.feeValue}>{this.networkName}</Text>
                        </View>
                        <View style={styles.fee}>
                            <Text style={styles.feeLabel}>{Localize.t('events.transactionType')}</Text>
                            <Text style={styles.feeValue}>SetRegularKey</Text>
                        </View>
                    </View>
                )}
            </>
        );
    };
    renderFooter = () => {
        const { step, busy, error, transaction } = this.state;
        const terminal =
            error === 'contextChanged' || error === 'accountChanged' || error === 'masterDisabled';
        const label =
            step === 'intro'
                ? Localize.t('global.start')
                : ['source', 'backup'].includes(step)
                  ? Localize.t('account.tangemScanCard')
                  : step === 'ready'
                    ? Localize.t('global.continue')
                    : step === 'review'
                      ? `${Localize.t('global.signWith')} ${this.flow.source.label || Localize.t('tangemBackup.sourceLabel')}`
                      : step === 'checking'
                        ? Localize.t('global.tryAgain')
                        : Localize.t('global.done');
        const action = {
            intro: this.flow.start,
            source: this.flow.scanSource,
            backup: this.flow.scanBackup,
            ready: this.flow.review,
            review: this.flow.sign,
            checking: this.flow.checkStatus,
            done: this.leave,
        }[step];
        return (
            <>
                {transaction && ['review', 'checking'].includes(step) && (
                    <View testID="backup-reviewed-fee" style={styles.footerFee}>
                        <Text style={styles.feeLabel}>
                            {Localize.t('global.fee')} · {this.networkName}
                        </Text>
                        <Text style={styles.feeValue}>
                            {Localize.formatNumber(
                                new BigNumber(transaction.Fee).dividedBy(1e6).toFixed(),
                                6,
                                false,
                            )}{' '}
                            {this.asset}
                        </Text>
                    </View>
                )}
                <Button
                    testID="backup-next"
                    label={terminal ? Localize.t('global.close') : label}
                    onPress={terminal ? this.leave : action}
                    isLoading={busy}
                    isDisabled={busy}
                    style={styles.button}
                    textStyle={styles.primaryButtonText}
                    loadingIndicatorStyle="light"
                />
                {step !== 'done' && (
                    <>
                        <Spacer size={4} />
                        <Button
                            testID="backup-back"
                            label={Localize.t(
                                step === 'intro'
                                    ? 'global.notNow'
                                    : ['ready', 'review'].includes(step)
                                      ? 'global.back'
                                      : 'global.close',
                            )}
                            onPress={
                                ['ready', 'review'].includes(step) && !terminal ? this.flow.back : this.leave
                            }
                            isDisabled={busy}
                            transparent
                            style={[styles.button, styles.secondaryButton]}
                            textStyle={styles.secondaryButtonText}
                        />
                    </>
                )}
            </>
        );
    };
    render() {
        const { androidBottomInset } = this.state;
        return (
            <SafeAreaView
                testID="backup-tangem-card-screen"
                onLayout={this.onLayout}
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
                        testID: 'backup-close',
                        icon: 'IconChevronLeft',
                        iconSize: 20,
                        iconStyle: styles.headerIcon,
                        onPress: this.leave,
                    }}
                    centerComponent={{
                        text: Localize.t('tangemBackup.title'),
                        textStyle: styles.headerTitle,
                    }}
                />
                <ScrollView style={styles.scroll} contentContainerStyle={styles.body} bounces={false}>
                    {this.renderBody()}
                </ScrollView>
                <Footer style={styles.footer}>{this.renderFooter()}</Footer>
            </SafeAreaView>
        );
    }
}
export default BackupTangemCardView;
