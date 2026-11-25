/**
 * Transaction Loader modal
 * A Modal to load transaction base on the transaction hash and redirect to details screen
 */

import React, { Component } from 'react';
import { ImageBackground, InteractionManager, Text, View } from 'react-native';
import { Navigation, EventSubscription } from 'react-native-navigation';

import NetworkService from '@services/NetworkService';
import LedgerService from '@services/LedgerService';
import StyleService from '@services/StyleService';

import { AppScreens } from '@common/constants';

import { TransactionFactory } from '@common/libs/ledger/factory';
import { MixingTypes, MutationsMixinType } from '@common/libs/ledger/mixin/types';
import { Transactions } from '@common/libs/ledger/transactions/types';

import { CoreRepository } from '@store/repositories';
import { AccountModel, NetworkModel } from '@store/models';
import { NetworkType } from '@store/types';

import { Button, Footer, Icon, InfoMessage, LoadingIndicator, Spacer } from '@components/General';

import Localize from '@locale';

// eslint-disable-next-line import/no-cycle
import TransactionDetailsView from '@screens/Events/Details';

import { AppStyles } from '@theme';
import styles from './styles';
import { ErrorResponse } from '@common/libs/ledger/types/methods';
import { ComponentTypes } from '@services/NavigationService';
import { transactionLoaderView } from './loaderView';

/* types ==================================================================== */
export interface Props {
    componentId?: string;
    hash: string;
    account: AccountModel;
    network: NetworkModel;
}

export interface State {
    isLoading: boolean;
    requiresSwitchNetwork: boolean;
    error: boolean;
    errorMessage?: string;
    transactionInstance?: Transactions & MutationsMixinType;
    account?: AccountModel;
}

const CANCELLED_LOAD = Symbol('cancelled-transaction-load');

/* Component ==================================================================== */
class TransactionLoaderModal extends Component<Props, State> {
    static screenName = AppScreens.Modal.TransactionLoader;

    private mounted = false;
    private closing = false;
    private nativeDismissStarted = false;
    private initialLoadStarted = false;
    private appeared = false;
    private presentationReady: Promise<void>;
    private resolvePresentation?: () => void;
    private loadPhase?: 'switch' | 'request';
    private pendingNetworkNotice?: { attempt: number; phase: 'switch' | 'request' };
    private navigationListener?: EventSubscription;
    private initialLoadTask?: ReturnType<typeof InteractionManager.runAfterInteractions>;
    private loadAttempt = 0;
    private requestTimeout?: ReturnType<typeof setTimeout>;
    private cancelLoad?: () => void;

    static options() {
        return {
            topBar: {
                visible: false,
            },
            animations: {
                showModal: {
                    enter: { waitForRender: true },
                },
            },
        };
    }

    constructor(props: Props) {
        super(props);
        this.presentationReady = new Promise((resolve) => { this.resolvePresentation = resolve; });

        this.state = {
            isLoading: true,
            requiresSwitchNetwork: false,
            error: false,
            transactionInstance: undefined,
            account: undefined,
        };
    }

    componentDidMount() {
        this.mounted = true;
        this.navigationListener = Navigation.events().bindComponent(this);
        NetworkService.on('networkChange', this.onNetworkChange);
        // Network I/O can overlap presentation; applying its result must wait for native appearance.
        this.initialLoadTask = InteractionManager.runAfterInteractions(() => {
            this.initialLoadTask = undefined;
            if (!this.mounted || this.closing || this.initialLoadStarted) return;
            this.initialLoadStarted = true;
            this.loadTransaction();
        });
    }

    componentDidAppear() {
        if (!this.mounted || this.appeared) return;
        this.appeared = true;
        this.resolvePresentation?.();
        this.resolvePresentation = undefined;
        if (this.closing) this.dismissNative();
    }

    componentWillUnmount() {
        this.mounted = false;
        this.initialLoadTask?.cancel();
        this.initialLoadTask = undefined;
        this.navigationListener?.remove();
        NetworkService.off('networkChange', this.onNetworkChange);
        this.invalidateLoad();
        this.resolvePresentation?.();
        this.resolvePresentation = undefined;
    }

    private invalidateLoad = () => {
        this.loadAttempt++;
        this.loadPhase = undefined;
        this.pendingNetworkNotice = undefined;
        const cancel = this.cancelLoad;
        this.cancelLoad = undefined;
        cancel?.();
        clearTimeout(this.requestTimeout);
        this.requestTimeout = undefined;
        return this.loadAttempt;
    };

    private waitForPresentation = async (cancelled: Promise<typeof CANCELLED_LOAD>) => {
        if (!this.appeared) await Promise.race([this.presentationReady, cancelled]);
    };

    private canApplyLoad = (attempt: number) => {
        return this.mounted && !this.closing && this.appeared && attempt === this.loadAttempt;
    };

    private applyNetworkNotice = () => {
        const notice = this.pendingNetworkNotice;
        if (!this.mounted || this.closing || !this.appeared || notice?.attempt !== this.loadAttempt) return;
        this.pendingNetworkNotice = undefined;
        const { network } = this.props;
        const requiresSwitchNetwork = notice.phase === 'switch' || Boolean(network &&
            network.key !== NetworkService.getConnectionDetails().networkKey);
        this.setState({ isLoading: false, requiresSwitchNetwork, error: !requiresSwitchNetwork });
    };

    private onNetworkChange = () => {
        const phase = this.loadPhase || this.pendingNetworkNotice?.phase;
        const attempt = this.invalidateLoad();
        // An idle switch prompt is resumed by its button, not by a network event.
        if (!this.mounted || this.closing || !phase) return;
        this.pendingNetworkNotice = { attempt, phase };
        if (this.appeared) this.applyNetworkNotice();
        else this.presentationReady.then(this.applyNetworkNotice);
    };

    loadTransaction = async () => {
        if (!this.mounted || this.closing || !this.initialLoadStarted) return;
        const { hash, account, network } = this.props;
        if (!hash) return;
        const attempt = this.invalidateLoad();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const clearRequestTimeout = () => {
            clearTimeout(timeout);
            if (this.requestTimeout === timeout) this.requestTimeout = undefined;
        };
        const cancelled = new Promise<typeof CANCELLED_LOAD>((resolve) => {
            this.cancelLoad = () => resolve(CANCELLED_LOAD);
        });
        try {
            const { networkKey } = NetworkService.getConnectionDetails();
            if (network && network.key !== networkKey) {
                this.loadPhase = 'switch';
                await this.waitForPresentation(cancelled);
                if (this.canApplyLoad(attempt)) {
                    this.setState({ isLoading: false, requiresSwitchNetwork: true, error: false });
                }
                return;
            }

            this.loadPhase = 'request';
            if (this.appeared) {
                this.setState({ isLoading: true, error: false, requiresSwitchNetwork: false });
            }
            // The client queues during reconnect. Do not delay this read-only request for presentation.
            const resp = await Promise.race([
                cancelled,
                new Promise<ErrorResponse>((resolve) => {
                    timeout = setTimeout(() => {
                        resolve({
                            error: 'timeout',
                            error_message: Localize.t('global.timeoutFetchingTx'),
                        } as ErrorResponse);
                    }, 10_000);
                    this.requestTimeout = timeout;
                }),
                LedgerService.getTransaction(hash),
            ]).finally(clearRequestTimeout);

            if (resp === CANCELLED_LOAD) return;
            await this.waitForPresentation(cancelled);
            if (!this.canApplyLoad(attempt)) return;

            if ('error' in resp) {
                this.setState({
                    error: true,
                    isLoading: false,
                    errorMessage: String(resp?.error_message || resp?.error || ''),
                    requiresSwitchNetwork: false,
                });
                return;
            }

            // eslint-disable-next-line no-underscore-dangle
            // @ts-expect-error
            delete resp.__replyMs;
            // eslint-disable-next-line no-underscore-dangle
            delete resp.__command;
            delete resp.inLedger;

            // pick meta from resp and anything else put it in the tx key
            const { meta, ledger_index, validated, ...tx } = resp;

            // build transaction instance
            const transactionInstance = TransactionFactory.fromLedger({ tx, meta, ledger_index, validated }, [
                MixingTypes.Mutation,
            ]) as Transactions & MutationsMixinType;

            // switch to the right account if necessary
            const coreSettings = CoreRepository.getSettings();

            if (coreSettings.account.address !== account.address) {
                CoreRepository.saveSettings({
                    account,
                });
            }

            // Keep the details in this modal; no second navigation transition is needed.
            this.setState({
                transactionInstance,
                account,
            });
        } catch (error) {
            clearRequestTimeout();
            await this.waitForPresentation(cancelled);
            if (!this.canApplyLoad(attempt)) return;
            this.setState({
                isLoading: false,
                error: true,
                requiresSwitchNetwork: false,
            });
        } finally {
            clearRequestTimeout();
            if (attempt === this.loadAttempt) {
                this.cancelLoad = undefined;
                this.loadPhase = undefined;
            }
        }
    };

    onSwitchNetworkPress = async () => {
        const { network } = this.props;
        const { requiresSwitchNetwork } = this.state;

        // double check
        if (!requiresSwitchNetwork) {
            return;
        }

        // switch to the desired network
        await NetworkService.switchNetwork(network);

        // re-run the preFlight
        await this.loadTransaction();
    };

    dismiss = () => {
        if (this.closing) return undefined;
        this.closing = true;
        this.initialLoadTask?.cancel();
        this.initialLoadTask = undefined;
        this.invalidateLoad();
        return this.appeared ? this.dismissNative() : undefined;
    };

    private dismissNative = () => {
        // iOS can report a dismissal before presentation starts, then present the modal anyway.
        if (!this.mounted || !this.appeared || this.nativeDismissStarted) return undefined;
        this.nativeDismissStarted = true;
        const { componentId } = this.props;
        // The global currentModal may still refer to this modal's parent.
        return Navigation.dismissModal(componentId || TransactionLoaderModal.screenName);
    };

    renderNetworkSwitch = () => {
        const { network } = this.props;

        const coreSettings = CoreRepository.getSettings();

        // only enable network switch if developer mode is on
        let ShouldShowSwitchButton = true;
        if (network?.type !== NetworkType.Main && !coreSettings.developerMode) {
            ShouldShowSwitchButton = false;
        }

        let switchNetworkWarning;

        // only show switch warning text when we allow user to switch from this modal
        if (ShouldShowSwitchButton) {
            const connectedNetwork = NetworkService.getNetwork();
            switchNetworkWarning = Localize.t('settings.networkChangeAccountDetailsWarning', {
                from: `"${connectedNetwork.name}"`,
                to: `"${network?.name}`,
            });
        }

        return (
            <>
                <Icon name="IconInfo" style={styles.infoIcon} size={80} />
                <Spacer size={18} />
                <InfoMessage
                    type="neutral"
                    label={`${Localize.t('events.transactionDetailsDifferentNetworkError', {
                        network: `"${network?.name}"`,
                    })}\n\n${switchNetworkWarning}\n`}
                    hideActionButton={!ShouldShowSwitchButton}
                    actionButtonLabel={Localize.t('global.switchNetwork')}
                    actionButtonIcon="IconSwitchAccount"
                    actionButtonIconSize={17}
                    onActionButtonPress={this.onSwitchNetworkPress}
                    containerStyle={styles.messageContainer}
                />
            </>
        );
    };

    renderLoading = () => {
        return (
            <>
                <LoadingIndicator size="large" />
                <Spacer size={30} />
                <Text style={[
                    AppStyles.p,
                    AppStyles.textCenterAligned,
                    AppStyles.baseText,
                    AppStyles.colorPrimary,
                ]}>
                    {Localize.t('events.fetchingTransactionFromNetwork')}
                </Text>
                <Text style={[AppStyles.subtext, AppStyles.textCenterAligned, AppStyles.colorGrey]}>
                    {Localize.t('global.pleaseWait')}
                </Text>
            </>
        );
    };

    renderError = () => {
        const { errorMessage } = this.state;
        return (
            <>
                <Icon size={50} name="IconAlertTriangle" style={AppStyles.imgColorOrange} />
                <Spacer size={40} />
                <InfoMessage
                    type="neutral"
                    actionButtonLabel={Localize.t('global.tryAgain')}
                    actionButtonIcon="IconRefresh"
                    onActionButtonPress={this.loadTransaction}
                    containerStyle={styles.messageContainer}
                >
                    <Text style={[AppStyles.subtext, AppStyles.textCenterAligned, AppStyles.colorGrey]}>
                        {Localize.t('events.unableToLoadTheTransaction')}
                    </Text>
                    {errorMessage && errorMessage !== '' && (
                        <View style={[
                            AppStyles.paddingTopSml,
                            AppStyles.paddingBottomExtraSml,
                            AppStyles.centerSelf,
                            AppStyles.centerContent,
                        ]}>
                            <Text style={[
                                AppStyles.baseText,
                                AppStyles.colorRed,
                                AppStyles.bold,
                            ]}>{errorMessage}</Text>
                        </View>
                    )}
                </InfoMessage>
            </>
        );
    };

    renderContent = () => {
        const {
            isLoading,
            requiresSwitchNetwork,
            error,
        } = this.state;

        switch (transactionLoaderView({ isLoading, requiresSwitchNetwork, error })) {
            case 'loading':
                return this.renderLoading();
            case 'switch':
                return this.renderNetworkSwitch();
            case 'error':
                return this.renderError();
            default:
                return null;
        }
    };

    render() {
        const {
            isLoading,
            transactionInstance,
            account,
        } = this.state;

        if (transactionInstance && account) {
            return (
                <TransactionDetailsView
                    componentType={ComponentTypes.Modal}
                    item={transactionInstance}
                    account={account}
                    embeddedInsteadOfModal
                />
            );
        }

        return (
            <ImageBackground
                resizeMode="cover"
                source={
                    StyleService.getImageIfLightModeIfDarkMode('BackgroundShapesLight', 'BackgroundShapes')
                }
                style={styles.container}
            >
                <View style={styles.contentContainer}>{this.renderContent()}</View>
                <Footer>
                    <Button
                        light
                        textStyle={AppStyles.strong}
                        label={isLoading ? Localize.t('global.cancel') : Localize.t('global.close')}
                        onPress={this.dismiss}
                    />
                </Footer>
            </ImageBackground>
        );
    }
}

/* Export Component ==================================================================== */
export default TransactionLoaderModal;
