import React, { Component } from 'react';
import {
    BackHandler,
    Dimensions,
    Image,
    LayoutChangeEvent,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Platform,
    SafeAreaView,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { get } from 'lodash';
import { Navigation } from 'react-native-navigation';
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
import { Navigator } from '@common/helpers/navigator';
import { Button } from '@components/General/Button';
import { Footer } from '@components/General/Footer';
import { Header } from '@components/General/Header';
import { Icon } from '@components/General/Icon';
import { LoadingIndicator } from '@components/General/LoadingIndicator';
import { Spacer } from '@components/General/Spacer';
import Localize from '@locale';
import AppSizes from '@theme/sizes';
import styles from './styles';

export interface Props {
    account: AccountModel;
    componentId?: string;
    removeKey?: string;
}
interface State extends BackupState {
    androidBottomInset: number;
    moreBelow: boolean;
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
    private readonly scroll = React.createRef<ScrollView>();
    private viewportHeight = 0;
    private contentHeight = 0;
    private scrollOffset = 0;

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
            props.removeKey,
        );
        this.state = { ...this.flow.state, androidBottomInset: 0, moreBelow: false };
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
        const { removeKey } = this.props;
        if (removeKey) this.flow.start();
    }
    componentDidUpdate(_props: Props, previous: State) {
        const { step, busy, error } = this.state;
        if (previous.step !== step) {
            this.scrollOffset = 0;
            this.scroll.current?.scrollTo({ y: 0, animated: false });
            this.updateOverflow();
        }
        if (previous.step !== 'checking' && step === 'checking') this.statusChecks = 0;
        if (previous.busy && !busy && error && !this.isConfirming() && !this.exiting) {
            this.showStepError();
        }
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
        this.requestExit().catch((error) => LoggerService.recordError('Unable to close Tangem back-up', error));
    };
    onLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
        if (Platform.OS !== 'android') return;
        const excluded = Math.max(0, Dimensions.get('screen').height - layout.height);
        const bottom = Math.max(0, AppSizes.safeAreaBottomInset - excluded);
        const { androidBottomInset } = this.state;
        if (bottom !== androidBottomInset) this.setState({ androidBottomInset: bottom });
    };
    updateOverflow = () => {
        const moreBelow = this.contentHeight - this.viewportHeight - this.scrollOffset > 8;
        const { moreBelow: previous } = this.state;
        if (this.mounted && moreBelow !== previous) this.setState({ moreBelow });
    };
    onScrollLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
        this.viewportHeight = layout.height;
        this.updateOverflow();
    };
    onContentSizeChange = (_width: number, height: number) => {
        this.contentHeight = height;
        this.updateOverflow();
    };
    onScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
        this.scrollOffset = nativeEvent.contentOffset.y;
        this.updateOverflow();
    };
    showMore = () => {
        this.scroll.current?.scrollTo({
            y: Math.min(this.contentHeight - this.viewportHeight, this.scrollOffset + this.viewportHeight * 0.75),
            animated: true,
        });
    };
    isConfirming = () => {
        const { step, busy, error } = this.state;
        return (
            step === 'checking' &&
            (busy || this.statusChecks < 30) &&
            !['contextChanged', 'accountChanged', 'masterDisabled'].includes(error || '')
        );
    };
    retryConfirmation = () => {
        this.statusChecks = 0;
        this.flow.checkStatus();
    };
    showStepError = () => {
        const { error } = this.state;
        if (!error) return;
        const name = this.flow.source.label?.trim();
        const message =
            error === 'wrongSource'
                ? name
                    ? Localize.t('tangemBackup.wrongSource', { name })
                    : Localize.t('tangemBackup.sourceTitle')
                : Localize.t(`tangemBackup.${errorKey(error)}`);
        const warning = ['cancelled', 'feeChanged'].includes(error);
        Navigator.showAlertModal({
            testID: 'backup-error-alert',
            type: warning ? 'warning' : 'error',
            title: Localize.t(
                error === 'wrongSource' ? 'account.tangemDifferentCard' : warning ? 'global.warning' : 'global.error',
            ),
            text: message,
            buttons: [{ text: Localize.t('global.ok'), testID: 'backup-error-ok' }],
        }).catch((failure) => LoggerService.recordError('Unable to show Tangem back-up alert', failure));
    };
    renderCard = (account: TangemBackupAccount, heading: string, serial?: string, chip?: string) => (
        <View
            testID={account.address === this.flow.source.address ? 'backup-source-card' : 'backup-destination-card'}
            style={styles.accountSection}
        >
            <Text style={[styles.sectionLabel, styles.centeredSectionLabel]}>{heading}</Text>
            <Spacer size={6} />
            <View style={[styles.accountCard, styles.compactCard]}>
                <View style={styles.cardHeading}>
                    <Text style={[styles.accountName, styles.cardName]}>{accountListLabel(account)}</Text>
                    {!!chip && (
                        <Text style={[styles.chip, chip === Localize.t('tangemBackup.newCard') && styles.newChip]}>
                            {chip}
                        </Text>
                    )}
                </View>
                {!!account.address && (
                    <Text selectable style={styles.address}>
                        {account.address}
                    </Text>
                )}
                {!!serial && (
                    <View style={[styles.serialSection, styles.compactSerial]}>
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
            <View style={[styles.artwork, step !== 'intro' && styles.smallArtwork]} accessible={false}>
                <Image
                    source={StyleService.getImage('ImageIdentifyTangem')}
                    resizeMode="contain"
                    style={[
                        styles.blueCard,
                        step !== 'intro' && styles.smallBlueCard,
                        step === 'source' && styles.front,
                        ['backup', 'ready'].includes(step) && styles.faded,
                    ]}
                />
                <Image
                    source={StyleService.getImage('ImageBackupTangem')}
                    resizeMode="contain"
                    style={[
                        styles.goldCard,
                        step !== 'intro' && styles.smallGoldCard,
                        step === 'source' && styles.faded,
                    ]}
                />
            </View>
        );
    };
    renderBody = () => {
        const { step, backup, sourceVerified } = this.state;
        const { removeKey } = this.props;
        const source = { type: 'Tangem', address: this.flow.source.address, label: this.flow.source.label };
        if (removeKey) {
            const phase = step === 'done' ? 'removeDone' : step === 'checking' ? 'removeChecking' : 'remove';
            return <>
                <Text testID="backup-step-title" accessibilityRole="header" style={[styles.title, styles.compactTitle]}>
                    {Localize.t(phase === 'remove' ? 'tangemBackup.remove' : `tangemBackup.${phase}Title`)}
                </Text>
                <Spacer size={8} />
                <Text style={styles.explain}>{Localize.t(`tangemBackup.${phase}Body`)}</Text>
                <Spacer size={16} />
                {this.renderCard(source, Localize.t('account.tangemSelectedAccount'))}
                {step !== 'done' && <>
                    <Text style={[styles.sectionLabel, styles.centeredSectionLabel]}>
                        {Localize.t('tangemBackup.title')}
                    </Text>
                    <Text selectable style={styles.address}>{removeKey}</Text>
                </>}
            </>;
        }
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
                    <View
                        style={styles.progress}
                        accessible
                        accessibilityRole="progressbar"
                        accessibilityLabel={Localize.t('tangemBackup.step', { number })}
                        accessibilityValue={{ min: 0, max: 3, now: number }}
                    >
                        <Text style={styles.stepText}>{Localize.t('tangemBackup.step', { number })}</Text>
                        <View style={styles.progressSegments}>
                            {[1, 2, 3].map((part) => (
                                <View
                                    key={part}
                                    style={[styles.progressTrack, part <= number && styles.progressFill]}
                                />
                            ))}
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
                <Spacer size={8} />
                <Text
                    testID="backup-step-title"
                    accessibilityRole="header"
                    style={[styles.title, step !== 'intro' && styles.compactTitle]}
                >
                    {Localize.t(`tangemBackup.${titleKey}`)}
                </Text>
                <Spacer size={6} />
                <Text style={styles.explain}>{Localize.t(`tangemBackup.${bodyKey}`)}</Text>
                {step === 'intro' && <Text style={styles.instruction}>{Localize.t('tangemBackup.steps')}</Text>}
                <Spacer size={12} />
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
            </>
        );
    };
    renderFooter = () => {
        const { step, busy, error } = this.state;
        const { removeKey } = this.props;
        const removing = !!removeKey;
        const terminal = error === 'contextChanged' || error === 'accountChanged' || error === 'masterDisabled';
        const label =
            step === 'intro'
                ? Localize.t('global.start')
                : step === 'source'
                  ? Localize.t('tangemBackup.scanOriginal')
                  : step === 'backup'
                    ? Localize.t('tangemBackup.scanBackup')
                    : step === 'ready'
                      ? Localize.t('global.continue')
                      : step === 'review'
                        ? Localize.t('global.confirm')
                        : step === 'checking'
                          ? Localize.t('global.tryAgain')
                          : Localize.t('global.done');
        const action = {
            intro: this.flow.start,
            source: this.flow.scanSource,
            backup: this.flow.scanBackup,
            ready: this.flow.review,
            review: this.flow.sign,
            checking: this.retryConfirmation,
            done: this.leave,
        }[step];
        return (
            <>
                {this.isConfirming() ? (
                    <View testID="backup-confirming" accessibilityLiveRegion="polite" style={styles.confirming}>
                        <LoadingIndicator />
                        <Text style={styles.confirmingText}>
                            {Localize.t(removing ? 'tangemBackup.removeCheckingTitle' : 'tangemBackup.checkingTitle')}
                        </Text>
                    </View>
                ) : (
                    <Button
                        testID="backup-next"
                        label={terminal ? Localize.t('global.close') : removing && step === 'review'
                            ? Localize.t('tangemBackup.scanOriginal') : label}
                        icon={!terminal && (['source', 'backup'].includes(step) || (removing && step === 'review'))
                            ? 'IconScanCard' : undefined}
                        iconStyle={styles.buttonIcon}
                        onPress={terminal ? this.leave : action}
                        isLoading={busy}
                        isDisabled={busy}
                        style={styles.button}
                        textStyle={styles.primaryButtonText}
                        loadingIndicatorStyle="light"
                    />
                )}
                {step !== 'done' && (
                    <>
                        <Spacer size={4} />
                        <Button
                            testID="backup-back"
                            label={Localize.t(
                                removing ? 'global.close' : step === 'intro'
                                    ? 'global.notNow'
                                    : ['ready', 'review'].includes(step)
                                      ? 'global.back'
                                      : 'global.close',
                            )}
                            onPress={!removing && ['ready', 'review'].includes(step) && !terminal
                                ? this.flow.back : this.leave}
                            isDisabled={busy && step !== 'checking'}
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
        const { androidBottomInset, moreBelow } = this.state;
        const { removeKey } = this.props;
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
                        text: Localize.t(removeKey ? 'tangemBackup.remove' : 'tangemBackup.title'),
                        textStyle: styles.headerTitle,
                    }}
                />
                <View style={styles.scroll}>
                    <ScrollView
                        ref={this.scroll}
                        testID="backup-scroll"
                        style={styles.scroll}
                        contentContainerStyle={[styles.body, styles.compactBody]}
                        onLayout={this.onScrollLayout}
                        onContentSizeChange={this.onContentSizeChange}
                        onScroll={this.onScroll}
                        scrollEventThrottle={16}
                        bounces={false}
                    >
                        {this.renderBody()}
                    </ScrollView>
                    {moreBelow && (
                        <TouchableOpacity
                            testID="backup-more"
                            accessibilityRole="button"
                            accessibilityLabel={Localize.t('global.readMore')}
                            style={styles.moreCue}
                            onPress={this.showMore}
                        >
                            <Text style={styles.moreCueText}>{Localize.t('global.readMore')}</Text>
                            <Icon name="IconChevronDown" size={14} style={styles.moreCueIcon} />
                        </TouchableOpacity>
                    )}
                </View>
                <Footer style={styles.footer}>{this.renderFooter()}</Footer>
            </SafeAreaView>
        );
    }
}
export default BackupTangemCardView;
