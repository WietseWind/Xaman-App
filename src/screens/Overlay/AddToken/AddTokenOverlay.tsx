/**
 * Add Token Screen
 */

import { find, first, get, isEmpty, values } from 'lodash';

import React, { Component } from 'react';
import {
    Alert, BackHandler, Image, InteractionManager, Platform, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { EventSubscription, Navigation, OptionsModalPresentationStyle } from 'react-native-navigation';

import LedgerService from '@services/LedgerService';
import NetworkService from '@services/NetworkService';
import BackendService from '@services/BackendService';
import NavigationService from '@services/NavigationService';

import { Navigator } from '@common/helpers/navigator';
import { AppScreens } from '@common/constants';

import { TrustSet } from '@common/libs/ledger/transactions';
import { TransactionTypes } from '@common/libs/ledger/types/enums';

import { Payload } from '@common/libs/payload';
import { AccountRepository, CoreRepository } from '@store/repositories';

import {
    ActionPanel,
    Button,
    Footer,
    InfoMessage,
    LoadingIndicator,
    Spacer,
    TouchableDebounce,
} from '@components/General';

import Localize from '@locale';

import { Props as ReviewTransactionModalProps } from '@screens/Modal/ReviewTransaction/types';

import { AppSizes, AppStyles } from '@theme';
import styles from './styles';

/* types ==================================================================== */
import { Props, State } from './types';

interface AddContext {
    account: string;
    networkModelId: string;
    networkKey: string;
    networkId: number;
}

interface ReviewHandoff {
    token: string;
    context: AddContext;
    appeared: boolean;
    willAppearConfirmed: boolean;
    cancelled: boolean;
    dismissStarted: boolean;
    finished: boolean;
    reservation: { token: symbol; release: () => void };
    backHandler?: EventSubscription;
    listeners: EventSubscription[];
}

interface ReviewLayout {
    data?: { name?: string; passProps?: { addTokenHandoffId?: string } };
    children?: ReviewLayout[];
}

const findReview = (layout?: ReviewLayout): ReviewLayout | undefined => {
    if (layout?.data?.name === AppScreens.Modal.ReviewTransaction) return layout;
    return layout?.children?.map(findReview).find(Boolean);
};

let handoffSequence = 0;

/* Component ==================================================================== */
class AddTokenOverlay extends Component<Props, State> {
    static screenName = AppScreens.Overlay.AddToken;

    private actionPanelRef: React.RefObject<ActionPanel>;
    private mounted = false;
    private phase: 'idle' | 'requesting' | 'closing' | 'presenting' | 'transferred' | 'cancelled' = 'idle';
    private requestAttempt = 0;
    private addContext?: AddContext;
    private pendingPayload?: Payload;
    private handoff?: ReviewHandoff;
    private panelClosed = false;
    private overlayDismissStarted = false;
    private mountTask?: ReturnType<typeof InteractionManager.runAfterInteractions>;
    private overlayWaiter?: EventSubscription;
    private waitingForOverlayShows = false;
    private panelDragWaiter?: (continueAdd: boolean) => void;

    static options() {
        return {
            statusBar: {
                style: 'light',
            },
            topBar: {
                visible: false,
            },
        };
    }

    constructor(props: Props) {
        super(props);

        this.state = {
            dataSource: undefined,
            selectedPartyId: undefined,
            selectedCurrencyId: undefined,
            isLoading: true,
            isLoadingTokenInfo: false,
            isHandoffPending: false,
            error: false,
        };

        this.actionPanelRef = React.createRef();
    }

    componentDidMount() {
        this.mounted = true;
        NetworkService.on('networkChange', this.onNetworkChange);
        CoreRepository.on('updateSettings', this.onSettingsChange);
        this.mountTask = InteractionManager.runAfterInteractions(() => {
            this.mountTask = undefined;
            if (this.mounted && this.phase === 'idle') this.loadVettedTokens();
        });
    }

    componentWillUnmount() {
        this.mounted = false;
        this.mountTask?.cancel();
        NetworkService.off('networkChange', this.onNetworkChange);
        CoreRepository.off('updateSettings', this.onSettingsChange);
        this.overlayWaiter?.remove();
        this.overlayWaiter = undefined;
        this.handoff?.backHandler?.remove();
        if (this.handoff) this.handoff.backHandler = undefined;
        this.cancelAdd();
    }

    private captureContext = (): AddContext | undefined => {
        try {
            const { account } = this.props;
            const connection = NetworkService.getConnectionDetails();
            const networkModelId = NetworkService.getNetwork()?.id?.toString();
            if (!networkModelId || !account.address || !connection.networkKey ||
                !Number.isFinite(connection.networkId)) return undefined;
            return {
                account: account.address, networkModelId, networkKey: connection.networkKey,
                networkId: connection.networkId,
            };
        } catch {
            // Account/network deletion can invalidate Realm objects while a reply is pending.
            return undefined;
        }
    };

    private contextMatches = (context: AddContext) => {
        try {
            const current = this.captureContext();
            return Boolean(current && CoreRepository.getSettings()?.account?.address === context.account &&
                current.account === context.account && current.networkModelId === context.networkModelId &&
                current.networkKey === context.networkKey && current.networkId === context.networkId);
        } catch {
            return false;
        }
    };

    private onNetworkChange = () => {
        if (this.addContext && !this.contextMatches(this.addContext)) this.cancelAndClose();
    };

    private onSettingsChange = () => {
        if (this.addContext && !this.contextMatches(this.addContext)) this.cancelAndClose();
    };

    private finishPanelDrag = (continueAdd: boolean) => {
        const waiter = this.panelDragWaiter;
        this.panelDragWaiter = undefined;
        waiter?.(continueAdd);
    };

    onPanelDragEnd = () => {
        this.finishPanelDrag(this.mounted && this.phase === 'requesting');
    };

    private cancelAdd = () => {
        if (this.phase === 'transferred') return;
        this.requestAttempt++;
        this.pendingPayload = undefined;
        this.phase = 'cancelled';
        this.finishPanelDrag(false);
        if (this.handoff) {
            this.handoff.cancelled = true;
            if (this.handoff.appeared) this.dismissCancelledReview(this.handoff);
        }
    };

    private cancelAndClose = () => {
        this.cancelAdd();
        if (!this.mounted) return;
        if (this.panelClosed && !this.handoff) this.dismissOwnOverlay();
        else if (!this.panelClosed) this.actionPanelRef.current?.slideDown();
    };

    private dismissOwnOverlay = () => {
        if (this.overlayDismissStarted || !this.mounted) return;
        const pending = Navigator.pendingOverlayShows();
        if (pending.length) {
            if (!this.waitingForOverlayShows) {
                this.waitingForOverlayShows = true;
                Promise.allSettled(pending).then(() => {
                    this.waitingForOverlayShows = false;
                    this.dismissOwnOverlay();
                });
            }
            return;
        }
        const { componentId } = this.props;
        const currentOverlay = NavigationService.getCurrentOverlay();
        if (currentOverlay && currentOverlay !== AddTokenOverlay.screenName && currentOverlay !== componentId) {
            // iOS restores an overlay's previous key window. Remove us only after a newer overlay has closed.
            if (!this.overlayWaiter) {
                this.overlayWaiter = Navigation.events().registerCommandCompletedListener((event) => {
                    if (event.commandName === 'dismissOverlay') this.dismissOwnOverlay();
                });
            }
            return;
        }
        this.overlayWaiter?.remove();
        this.overlayWaiter = undefined;
        this.overlayDismissStarted = true;
        // Another overlay may have appeared during this asynchronous handoff.
        Navigation.dismissOverlay(componentId || AddTokenOverlay.screenName).catch(() => undefined);
    };

    private removeHandoffListeners = (handoff: ReviewHandoff) => {
        handoff.backHandler?.remove();
        handoff.backHandler = undefined;
        handoff.listeners.forEach((listener) => listener.remove());
        handoff.listeners = [];
    };

    private finishHandoff = (handoff: ReviewHandoff) => {
        if (handoff.finished) return;
        handoff.finished = true;
        this.removeHandoffListeners(handoff);
        handoff.reservation.release();
        if (this.handoff !== handoff) return;
        this.handoff = undefined;
        this.dismissOwnOverlay();
    };

    private dismissCancelledReview = (handoff: ReviewHandoff) => {
        if (handoff.finished || handoff.dismissStarted) return;
        handoff.dismissStarted = true;
        Navigation.dismissModal(AppScreens.Modal.ReviewTransaction)
            .catch(() => undefined)
            .finally(() => this.finishHandoff(handoff));
    };

    onPanelCloseRequest = () => {
        // Only the prepared Add operation may turn a close into a Review handoff.
        if (this.phase !== 'closing') this.cancelAdd();
    };

    onPanelSlideDown = () => {
        if (this.panelClosed) return;
        this.panelClosed = true;
        const payload = this.pendingPayload;
        const context = this.addContext;
        this.pendingPayload = undefined;
        if (!this.mounted || this.phase !== 'closing' || !payload || !context || !this.contextMatches(context)) {
            this.cancelAdd();
            this.dismissOwnOverlay();
            return;
        }

        const reservation = Navigator.reserveModal(AppScreens.Modal.ReviewTransaction);
        if (!reservation) {
            this.cancelAdd();
            this.dismissOwnOverlay();
            return;
        }
        this.phase = 'presenting';
        const handoff: ReviewHandoff = {
            token: `add-token-${++handoffSequence}`, context, appeared: false, willAppearConfirmed: false,
            cancelled: false,
            dismissStarted: false, finished: false, listeners: [],
            reservation,
        };
        this.handoff = handoff;
        const reviewId = AppScreens.Modal.ReviewTransaction;
        const terminalCommands = new Map<string, string>();
        const matchesReview = (event: { componentId: string; passProps?: object }, allowClearedProps = false) => {
            const token = get(event.passProps, 'addTokenHandoffId');
            return event.componentId === reviewId && (token === handoff.token ||
                (allowClearedProps && token === undefined && handoff.cancelled && handoff.willAppearConfirmed));
        };
        let backHandlerInstalled = false;
        let show: Promise<string | boolean>;
        try {
            handoff.listeners.push(Navigation.events().registerComponentWillAppearListener((event) => {
                if (!matchesReview(event) || handoff.finished || handoff.appeared) return;
                handoff.willAppearConfirmed = true;
                if (backHandlerInstalled || !this.mounted) return;
                backHandlerInstalled = true;
                // Review's Preflight Back handler mounts first. Own Back only while our cover is retained.
                handoff.backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
                    if (handoff.finished) return false;
                    this.cancelAdd();
                    return true;
                });
            }));
            // Native appearance, not a fixed timeout, releases the full-screen input cover.
            handoff.listeners.push(Navigation.events().registerComponentDidAppearListener((event) => {
                if (!matchesReview(event, true) || handoff.finished || handoff.appeared) return;
                handoff.appeared = true;
                if (handoff.cancelled || !this.mounted || !this.contextMatches(context)) {
                    handoff.cancelled = true;
                    this.dismissCancelledReview(handoff);
                } else {
                    this.phase = 'transferred';
                    this.finishHandoff(handoff);
                }
            }));
            handoff.listeners.push(Navigation.events().registerModalDismissedListener((event) => {
                if (event.componentId !== reviewId) return;
                if (handoff.appeared || Platform.OS === 'android') this.finishHandoff(handoff);
                else handoff.cancelled = true;
            }));
            handoff.listeners.push(Navigation.events().registerCommandListener((name, params) => {
                if (name === 'showModal') {
                    const otherReview = findReview(params.layout);
                    if (otherReview && otherReview.data?.passProps?.addTokenHandoffId !== handoff.token) {
                        // Static Review IDs are shared. Yield before another command replaces their stored props.
                        this.finishHandoff(handoff);
                    }
                } else if (name === 'setRoot' || name === 'dismissAllModals' ||
                    (name === 'dismissModal' && params.componentId === reviewId)) {
                    terminalCommands.set(params.commandId, name);
                    this.cancelAdd();
                }
            }));
            handoff.listeners.push(Navigation.events().registerCommandCompletedListener((event) => {
                if (terminalCommands.get(event.commandId) !== event.commandName) return;
                if (Platform.OS === 'android') {
                    // These completed commands remove the accepted Android modal, even before first appearance.
                    this.finishHandoff(handoff);
                } else if ((event.commandName === 'setRoot' || event.commandName === 'dismissAllModals') &&
                    handoff.cancelled) {
                    // Keep watching for a late native entry, but do not leave its input cover behind.
                    this.dismissOwnOverlay();
                }
            }));

            show = Navigator.showModal<ReviewTransactionModalProps<TrustSet> & { addTokenHandoffId: string }>(
                reviewId,
                { payload, addTokenHandoffId: handoff.token },
                {
                    modalPresentationStyle: OptionsModalPresentationStyle.fullScreen,
                    animations: { showModal: { enter: { waitForRender: true } } },
                },
                reservation.token,
            );
        } catch {
            this.finishHandoff(handoff);
            return;
        }
        show.then((result) => {
            if (this.handoff !== handoff) return;
            if (result === false) {
                // The existing Review belongs to another request.
                this.finishHandoff(handoff);
            }
        }).catch(() => this.finishHandoff(handoff));
    };

    loadVettedTokens = async () => {
        if (!this.mounted || this.phase !== 'idle') return;
        const { isLoading } = this.state;

        try {
            if (!isLoading) {
                this.setState({
                    isLoading: true,
                    error: false,
                });
            }

            const { details } = await BackendService.getCuratedIOUs({ promoted: true });
            if (!this.mounted || this.phase !== 'idle') return;

            // set default selected party and currency to the first in the list
            const selectedParty = first(values(details));
            const selectedPartyId = get(selectedParty, 'id');
            const selectedCurrencyId = get(first(values(get(selectedParty, 'currencies'))), 'id');

            // something is not right,
            if (!selectedPartyId || !selectedCurrencyId) {
                this.setState({
                    error: true,
                });
                return;
            }

            this.setState({
                dataSource: details,
                selectedPartyId,
                selectedCurrencyId,
            });
        } catch {
            if (!this.mounted || this.phase !== 'idle') return;
            this.setState({
                error: true,
            });
        } finally {
            if (this.mounted && this.phase === 'idle') this.setState({ isLoading: false });
        }
    };

    onAddPress = async () => {
        if (!this.mounted || this.phase !== 'idle') return;
        const { account } = this.props;
        const { dataSource, selectedPartyId, selectedCurrencyId } = this.state;

        const selectedCurrency = find(values(get(find(values(dataSource), { id: selectedPartyId }), 'currencies')), {
            id: selectedCurrencyId,
        });

        if (typeof selectedCurrency === 'undefined') {
            Alert.alert(Localize.t('global.error'), Localize.t('asset.selectCurrency'));
            return;
        }

        const context = this.captureContext();
        if (!context || !this.contextMatches(context)) return;

        // if trustline is already exist return
        if (
            AccountRepository.hasCurrency(account, {
                issuer: selectedCurrency.issuer,
                currency: selectedCurrency.currency,
            })
        ) {
            Alert.alert(Localize.t('global.error'), Localize.t('asset.trustLineIsAlreadyExist'));
            return;
        }

        const attempt = ++this.requestAttempt;
        this.addContext = context;
        this.phase = 'requesting';
        this.setState({
            isLoadingTokenInfo: true,
        });

        // set the default line limit
        let lineLimit = '1000000000';

        try {
            // set the trustline limit by gateway balance if it's more than our default value
            const resp = await LedgerService.getGatewayBalances(selectedCurrency.issuer);
            const gatewayBalances = get(resp, ['obligations', selectedCurrency.currency]);

            if (gatewayBalances && Number(gatewayBalances) > Number(lineLimit)) {
                lineLimit = gatewayBalances;
            }
        } catch {
            // ignore
        }

        if (!this.mounted || attempt !== this.requestAttempt) return;
        // A reply must not override a header gesture that the user has not finished.
        while (this.mounted && attempt === this.requestAttempt && this.actionPanelRef.current?.isDragActive) {
            const continueAdd = await new Promise<boolean>((resolve) => { this.panelDragWaiter = resolve; });
            if (!continueAdd) return;
        }
        if (!this.mounted || attempt !== this.requestAttempt) return;
        if (!this.contextMatches(context)) {
            this.cancelAndClose();
            return;
        }
        this.setState({ isLoadingTokenInfo: false });

        const trustSet = new TrustSet({
            TransactionType: TransactionTypes.TrustSet,
            Account: context.account,
            Flags: 131072, // tfSetNoRipple
            LimitAmount: {
                currency: selectedCurrency.currency,
                issuer: selectedCurrency.issuer,
                value: lineLimit,
            },
        });

        const payload = Payload.build(
            trustSet.JsonForSigning,
            Localize.t('asset.addingAssetReserveDescription', {
                ownerReserve: NetworkService.getNetworkReserve().OwnerReserve,
                nativeAsset: NetworkService.getNativeAsset(),
            }),
        );

        this.pendingPayload = payload;
        this.phase = 'closing';
        this.setState({ isHandoffPending: true });
        this.actionPanelRef.current?.slideDown();
    };

    onCancelPress = () => {
        this.cancelAndClose();
    };

    renderCurrencies = () => {
        const { dataSource, selectedPartyId, selectedCurrencyId } = this.state;

        const currencies = values(get(find(values(dataSource), { id: selectedPartyId }), 'currencies'));

        if (isEmpty(currencies)) {
            return (
                <Text style={[AppStyles.subtext, AppStyles.textCenterAligned]} adjustsFontSizeToFit numberOfLines={1}>
                    No Item to show
                </Text>
            );
        }

        return currencies.map((currency, index) => {
            const selected = currency.id === selectedCurrencyId;

            return (
                <TouchableDebounce
                    testID={`currency-${currency.issuer}.${currency.currency}`}
                    key={index}
                    style={[styles.listItem, selected && styles.selectedRow]}
                    onPress={() => {
                        this.setState({
                            selectedCurrencyId: currency.id,
                        });
                    }}
                >
                    <View style={[AppStyles.flex3, AppStyles.row, AppStyles.centerAligned]}>
                        <View style={AppStyles.flex1}>
                            <Image style={styles.currencyAvatar} source={{ uri: currency.avatar }} />
                        </View>
                        <View style={AppStyles.flex3}>
                            <Text
                                style={[AppStyles.subtext, selected && styles.selectedText]}
                                adjustsFontSizeToFit
                                numberOfLines={1}
                            >
                                {currency.name}
                            </Text>
                        </View>
                    </View>
                </TouchableDebounce>
            );
        });
    };

    renderParties = () => {
        const { dataSource, selectedPartyId } = this.state;

        const parties = values(dataSource);

        if (isEmpty(parties)) {
            return (
                <Text
                    key="empty-parties"
                    style={[AppStyles.subtext, AppStyles.textCenterAligned]}
                    adjustsFontSizeToFit
                    numberOfLines={1}
                >
                    No Item to show
                </Text>
            );
        }

        return parties.map((party, index) => {
            // if selected party on the list
            const selected = selectedPartyId === party.id;

            return (
                <TouchableDebounce
                    testID={`counterParty-${party.name}`}
                    key={index}
                    style={[styles.listItem, selected && styles.selectedRow]}
                    onPress={() => {
                        this.setState({
                            selectedPartyId: party.id,
                            selectedCurrencyId: get(first(values(get(party, 'currencies'))), 'id'),
                        });
                    }}
                >
                    <View style={[AppStyles.flex3, AppStyles.row, AppStyles.centerAligned]}>
                        <View style={AppStyles.flex1}>
                            <Image style={styles.avatar} source={{ uri: party.avatar }} />
                        </View>
                        <View style={AppStyles.flex3}>
                            <Text
                                style={[AppStyles.subtext, selected && styles.selectedText]}
                                adjustsFontSizeToFit
                                numberOfLines={1}
                            >
                                {party.name}
                                {party.name && ` (${values(get(party, 'currencies')).length})`}
                            </Text>
                        </View>
                    </View>
                </TouchableDebounce>
            );
        });
    };

    renderContent = () => {
        const { isLoading, error } = this.state;

        if (isLoading) {
            return (
                <View style={[AppStyles.flex1, AppStyles.centerContent]}>
                    <LoadingIndicator size="large" />
                    <Spacer />
                    <Text style={AppStyles.p}>{Localize.t('global.loading')}</Text>
                </View>
            );
        }

        if (error) {
            return (
                <View style={styles.errorContainer}>
                    <InfoMessage
                        type="error"
                        label={Localize.t('asset.unableToLoadListOfTokens')}
                        actionButtonLabel={Localize.t('global.tryAgain')}
                        actionButtonIcon="IconRefresh"
                        onActionButtonPress={this.loadVettedTokens}
                    />
                </View>
            );
        }

        return (
            <View style={[AppStyles.flex1, AppStyles.row]}>
                <ScrollView style={AppStyles.flex1}>{this.renderParties()}</ScrollView>
                <View style={styles.separator} />
                <ScrollView style={AppStyles.flex1}>{this.renderCurrencies()}</ScrollView>
            </View>
        );
    };

    renderPanel = () => {
        const { selectedCurrencyId, isLoadingTokenInfo } = this.state;

        return (
            <ActionPanel
                height={AppSizes.heightPercentageToDP(90)}
                onCloseRequest={this.onPanelCloseRequest}
                onDragEnd={this.onPanelDragEnd}
                lockAfterCloseRequest
                onSlideDown={this.onPanelSlideDown}
                testID="add-asset-overlay"
                ref={this.actionPanelRef}
                contentStyle={AppStyles.centerAligned}
            >
                <View style={[
                    AppStyles.row,
                    AppStyles.paddingLeftExtraSml,
                    AppStyles.centerAligned,
                    AppStyles.paddingBottomSml,
                ]}>
                    <View style={[AppStyles.flex1]}>
                        <Text numberOfLines={1} style={[AppStyles.h5, AppStyles.strong]}>
                            {Localize.t('asset.addAsset')}
                        </Text>
                    </View>
                    <View style={[AppStyles.row, AppStyles.flex1, AppStyles.flexEnd]}>
                        <Button
                            light
                            roundedSmall
                            isDisabled={false}
                            onPress={this.onCancelPress}
                            textStyle={[AppStyles.subtext, AppStyles.bold]}
                            label={Localize.t('global.cancel')}
                        />
                    </View>
                </View>
                <View style={[AppStyles.row, AppStyles.centerContent, AppStyles.marginBottomSml]}>
                    <Text numberOfLines={3} style={[AppStyles.p, AppStyles.subtext, AppStyles.textCenterAligned]}>
                        {Localize.t('asset.selectAnExchangeAndSelectAsset')}
                    </Text>
                </View>

                <View style={[AppStyles.row, AppStyles.paddingExtraSml]}>
                    <View style={AppStyles.flex1}>
                        <Text
                            numberOfLines={1}
                            style={[AppStyles.subtext, AppStyles.bold, AppStyles.textCenterAligned]}
                        >
                            {Localize.t('global.exchanges')}:
                        </Text>
                    </View>
                    <View style={styles.separator} />
                    <View style={AppStyles.flex1}>
                        <Text
                            numberOfLines={1}
                            style={[AppStyles.subtext, AppStyles.bold, AppStyles.textCenterAligned]}
                        >
                            {Localize.t('global.assets')}:
                        </Text>
                    </View>
                </View>

                {this.renderContent()}

                <Footer style={styles.footer}>
                    <Button
                        isLoading={isLoadingTokenInfo}
                        numberOfLines={1}
                        testID="add-and-sign-button"
                        isDisabled={!selectedCurrencyId}
                        onPress={this.onAddPress}
                        style={AppStyles.buttonGreen}
                        label={Localize.t('asset.addAndSign')}
                    />
                </Footer>
            </ActionPanel>
        );
    };

    render() {
        const { isHandoffPending } = this.state;
        return (
            <View style={AppStyles.flex1}>
                {this.renderPanel()}
                {isHandoffPending && (
                    <View
                        testID="add-token-handoff-cover"
                        collapsable={false}
                        style={StyleSheet.absoluteFill}
                        onStartShouldSetResponder={() => true}
                        onResponderTerminationRequest={() => false}
                    />
                )}
            </View>
        );
    }
}

/* Export Component ==================================================================== */
export default AddTokenOverlay;
