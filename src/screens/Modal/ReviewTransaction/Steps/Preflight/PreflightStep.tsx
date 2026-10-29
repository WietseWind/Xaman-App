/**
 * Review transaction preflight Screen
 */
/* eslint-disable max-classes-per-file */
import { filter, find, first, isEmpty } from 'lodash';
import React, { Component } from 'react';
import { Image, InteractionManager, Text, View } from 'react-native';

import NetworkService from '@services/NetworkService';

import { AccountRepository, CoreRepository, NetworkRepository } from '@store/repositories';
import { NetworkType } from '@store/types';
import { AccountModel, NetworkModel } from '@store/models';

import { AppScreens } from '@common/constants';

import { Navigator } from '@common/helpers/navigator';
import { Prompt } from '@common/helpers/interface';
import { Images } from '@common/helpers/images';

import { Button, Icon, InfoMessage, Spacer } from '@components/General';
import { ReviewHeader } from '@screens/Modal/ReviewTransaction/Shared';

import Localize from '@locale';

import { AccountAddViewProps } from '@screens/Account/Add';

import { AppStyles } from '@theme';
import styles from './styles';

import { StepsContext } from '../../Context';
import { TransactionTypes } from '@common/libs/ledger/types/enums';
import { Payload } from '@common/libs/payload';
/* types ==================================================================== */
enum RequiredActionsType {
    SWITCH_NETWORK = 'SWITCH_NETWORK',
    FORCED_SIGNER = 'FORCED_SIGNER',
    ADD_ACCOUNT = 'ADD_ACCOUNTS',
}

export interface Props {}

export interface State {
    requiredAction?: RequiredActionsType;
    requiredActionData: any;
    networkSwitchStatus: 'idle' | 'confirming' | 'switching';
}

interface NetworkSwitchRequest {
    network: NetworkModel;
    payload: Payload;
    started: boolean;
}

/* Error ==================================================================== */
class PreflightError extends Error {
    public action: RequiredActionsType;
    public data: any;
    public recoverable = true;

    constructor(action: RequiredActionsType, data?: any) {
        super();

        this.action = action;
        this.data = data;

        if (!this.action && !this.data) {
            this.recoverable = false;
        }
    }
}

/* Component ==================================================================== */
class PreflightStep extends Component<Props, State> {
    static contextType = StepsContext;
    declare context: React.ContextType<typeof StepsContext>;
    private mounted = false;
    private closing = false;
    private mountTask?: ReturnType<typeof InteractionManager.runAfterInteractions>;
    private preflightAttempt = 0;
    private networkSwitchRequest?: NetworkSwitchRequest;

    constructor(props: Props) {
        super(props);

        this.state = {
            requiredAction: undefined,
            requiredActionData: undefined,
            networkSwitchStatus: 'idle',
        };
    }

    componentDidMount() {
        this.mounted = true;
        this.closing = false;
        this.mountTask = InteractionManager.runAfterInteractions(this.runPreFlight);
    }

    componentWillUnmount() {
        this.mounted = false;
        this.closing = true;
        this.preflightAttempt++;
        this.networkSwitchRequest = undefined;
        this.mountTask?.cancel();
    }

    /*
    Run all preflight checks and tasks
     */
    runPreFlight = () => {
        const attempt = ++this.preflightAttempt;
        const { payload } = this.context;
        const isActive = () => {
            const { payload: currentPayload } = this.context;
            return this.mounted && !this.closing && attempt === this.preflightAttempt && currentPayload === payload;
        };
        // necessary jobs in order
        const jobs = [this.checkForcedNetwork, () => this.setTransaction(isActive), this.loadSingingAccount];

        // run them in waterfall
        return jobs.reduce((accumulator: Promise<void>, callback) => {
            return accumulator.then(() => (isActive() ? callback() : undefined));
        }, Promise.resolve())
            .then(() => { if (isActive()) this.onPreflightPass(); })
            .catch((error) => { if (isActive()) this.onPreflightReject(error); });
    };

    /*
    Callback for when all test flight tasks are resolved
     */
    onPreflightPass = () => {
        const { onPreflightPass } = this.context;

        // callback
        if (typeof onPreflightPass === 'function') {
            onPreflightPass();
        }
    };

    /*
    Callback for when there is at least one error in one of preflight tasks
    */
    onPreflightReject = (error: PreflightError) => {
        const { setError } = this.context;

        // hard error
        if (!error.recoverable) {
            setError(error);
            return;
        }

        this.setState({
            requiredAction: error.action,
            requiredActionData: error.data,
        });
    };

    /*
    Set the transaction and check if we can sign this transaction in the selected network
     */
    setTransaction = async (isActive = () => true): Promise<void> => {
        const { payload, setTransaction } = this.context;
        // Network switches reconnect asynchronously. Learn the network's current
        // fields before taking the immutable review/signing definitions snapshot.
        await NetworkService.updateNetworkDefinitions();
        if (!isActive()) return;
        // A newly introduced type can arrive before the normal cache expires. Check once before pinning it.
        if (!payload.isPseudoTransaction() &&
            !NetworkService.getNetworkDefinitions().transactionNames.includes(payload.getTransactionType())) {
            await NetworkService.updateNetworkDefinitions(true);
        }
        if (!isActive()) return;
        await this.checkForcedNetwork();
        if (!isActive()) return;
        const transaction = payload.getTransaction();
        // Capture now, so fee estimation, review and both signers use one schema.
        transaction.assertSigningContext();
        setTransaction(transaction);
    };

    /*
    Check if payload includes forced_network and show error if user is not in desired network
     */
    checkForcedNetwork = (): Promise<void> => {
        return new Promise<void>((resolve, reject) => {
            const { payload } = this.context;

            try {
                // check if any forced network applied
                const forcedNetwork = payload.getForcedNetwork();

                // nothing to check
                if (typeof forcedNetwork !== 'string') {
                    resolve();
                    return;
                }

                // force network applied, run check
                const network = NetworkRepository.findOne({ key: forcedNetwork });

                // force network applied but user is not connected to the network
                if (network && NetworkService.getNetwork().key !== network.key) {
                    reject(
                        new PreflightError(RequiredActionsType.SWITCH_NETWORK, {
                            network,
                        }),
                    );
                    return;
                }

                // everything seems fine
                resolve();
            } catch (error: any) {
                reject(error);
            }
        });
    };

    /*
    Load the accounts which this payload can be signed with
     */
    loadSingingAccount = (): Promise<void> => {
        return new Promise((resolve, reject): void => {
            const { transaction, payload, setAccounts, setSource } = this.context;

            try {
                // get available accounts for signing
                let availableAccounts = AccountRepository.getSignableAccounts();

                // if no account for signing is available then just return
                if (isEmpty(availableAccounts)) {
                    reject(new PreflightError(RequiredActionsType.ADD_ACCOUNT));
                    return;
                }

                // choose preferred account for sign
                let preferredAccount: AccountModel | undefined;
                let source: AccountModel | undefined;

                // check for enforced signer accounts
                const forcedSigners = payload.getSigners();
                // console.log(forcedSigners)

                if (Array.isArray(forcedSigners) && forcedSigners.length > 0) {
                    // filter available accounts base on forced signers
                    availableAccounts = filter(availableAccounts, (account) => forcedSigners.includes(account.address));

                    // no available account for signing base on forced signers
                    if (isEmpty(availableAccounts)) {
                        reject(
                            new PreflightError(RequiredActionsType.FORCED_SIGNER, {
                                forcedSigners,
                            }),
                        );
                        return;
                    }
                }

                // if any account set from payload, set as preferred account
                if (transaction && transaction.Account) {
                    preferredAccount = find(availableAccounts, { address: transaction.Account });
                }

                if (
                    transaction &&
                    transaction.TransactionType === TransactionTypes.Batch &&
                    transaction.innerBatchSigners().length === 1 &&
                    (!transaction.Account || transaction.isBatchInNeedOfMultipleSigners())
                    // ^^ else the Batch Account signs (e.g. it submits for an inner account that already signed)
                ) {
                    // Batch in need of one signer, set as preferred account
                    preferredAccount = find(availableAccounts, { address: transaction.innerBatchSigners()[0] });
                }

                // remove hidden accounts but keep preferred account even if hidden
                // ignore for forced signers
                if (!forcedSigners) {
                    availableAccounts = filter(
                        availableAccounts,
                        (account) => !account.hidden || account.address === preferredAccount?.address,
                    );
                }

                // after removing the hidden accounts
                // return if empty
                if (isEmpty(availableAccounts)) {
                    reject(new PreflightError(RequiredActionsType.ADD_ACCOUNT));
                    return;
                }

                // if there is no preferred account base on transaction.Account
                // choose default || first available account
                // this will guarantee source to be set
                if (preferredAccount) {
                    source = preferredAccount;
                } else {
                    const defaultAccount = CoreRepository.getDefaultAccount();
                    source = find(availableAccounts, { address: defaultAccount.address }) || first(availableAccounts);
                }

                // double check
                if (!source) {
                    reject(new PreflightError(RequiredActionsType.ADD_ACCOUNT));
                    return;
                }

                // case & logic for below: 
                //    https://github.com/WietseWind/Xaman-App/issues/67
                if (Array.isArray(forcedSigners) && forcedSigners.length > 0) {
                    if (transaction?.Account) {
                        const fullAccessAccounts = AccountRepository.getFullAccessAccounts();
                        if (!forcedSigners.includes(transaction.Account)) {
                            const txAccountAsSigner = find(fullAccessAccounts, { address: transaction.Account });
                            if (txAccountAsSigner?.regularKey) {
                                if (forcedSigners.includes(txAccountAsSigner.regularKey)) {
                                    // transaction.Account is one of the forced signers' regular key, so we will use
                                    // the native payload's `Account` as source when the regular key account is selected
                                    source = txAccountAsSigner;
                                    availableAccounts = availableAccounts
                                        .filter((a) => a.address !== txAccountAsSigner.regularKey);
                                    availableAccounts.push(txAccountAsSigner);
                                }
                            }
                        }
                    }
                }

                // set the source
                setSource(source);

                // set available accounts
                setAccounts(availableAccounts);

                // resolve
                resolve();
            } catch (error: any) {
                reject(error);
            }
        });
    };

    switchNetwork = async (request: NetworkSwitchRequest) => {
        if (!this.mounted || this.closing || this.networkSwitchRequest !== request || request.started) return;
        const { payload } = this.context;
        const { requiredAction, requiredActionData } = this.state;
        if (payload !== request.payload || requiredAction !== RequiredActionsType.SWITCH_NETWORK ||
            requiredActionData?.network !== request.network) {
            this.finishNetworkSwitch(request);
            return;
        }
        request.started = true;
        this.setState({ networkSwitchStatus: 'switching' });
        try {
            await NetworkService.switchNetwork(request.network);
            const { payload: currentPayload } = this.context;
            if (this.mounted && this.networkSwitchRequest === request && currentPayload === request.payload) {
                // Keep the button busy through reconnect/definitions and the new preflight checks.
                await this.runPreFlight();
            }
        } catch (error: any) {
            const { payload: currentPayload } = this.context;
            if (this.mounted && this.networkSwitchRequest === request && currentPayload === request.payload) {
                Prompt(Localize.t('global.error'), error?.message);
            }
        } finally {
            this.finishNetworkSwitch(request);
        }
    };

    private finishNetworkSwitch = (request: NetworkSwitchRequest) => {
        if (this.networkSwitchRequest !== request) return;
        this.networkSwitchRequest = undefined;
        if (this.mounted) this.setState({ networkSwitchStatus: 'idle' });
    };

    onSwitchNetworkPress = () => {
        if (!this.mounted || this.closing || this.networkSwitchRequest) return;
        const { requiredAction, requiredActionData } = this.state;
        const { payload, setError } = this.context;
        if (requiredAction !== RequiredActionsType.SWITCH_NETWORK || !requiredActionData?.network) return;
        const request = { network: requiredActionData.network, payload, started: false };
        this.networkSwitchRequest = request;
        this.setState({ networkSwitchStatus: 'confirming' });
        const cancel = () => {
            // Android can deliver onDismiss after a confirmation button press.
            if (!request.started) this.finishNetworkSwitch(request);
        };

        // ask user if they want to switch the network
        try {
            const connectedNetwork = NetworkService.getNetwork();
            Prompt(
                Localize.t('global.switchNetwork'),
                Localize.t('settings.nodeChangeWarning', {
                    from: `"${connectedNetwork.name}"`,
                    to: `"${requiredActionData.network.name}"`,
                }),
                [
                    { text: Localize.t('global.cancel'), onPress: cancel },
                    {
                        text: Localize.t('global.switch'),
                        onPress: () => this.switchNetwork(request),
                    },
                ],
                { type: 'default', cancelable: true, onDismiss: cancel },
            );
        } catch (error) {
            this.finishNetworkSwitch(request);
            setError(error as Error);
        }
    };

    onAddAccountPress = async () => {
        // close the ReviewModal and redirect user to add account screen
        await Navigator.dismissModal();

        // push to the screen
        Navigator.push<AccountAddViewProps>(AppScreens.Account.Add, {});
    };

    onClose = () => {
        if (this.closing) return;
        this.closing = true;
        this.preflightAttempt++;
        this.networkSwitchRequest = undefined;
        this.mountTask?.cancel();
        const { onClose } = this.context;
        onClose();
    };

    renderForcedSigners = () => {
        const { requiredActionData } = this.state;

        return (
            <View style={styles.contentContainer}>
                <Icon name="IconInfo" style={styles.infoIcon} size={80} />
                <Spacer size={18} />
                <Text style={AppStyles.h5}>{Localize.t('global.noAccountConfigured')}</Text>
                <Spacer size={18} />
                <InfoMessage
                    type="neutral"
                    labelStyle={styles.actionDescription}
                    label={Localize.t('payload.forcedSignersAccountsDoesNotExist', {
                        accounts: requiredActionData.forcedSigners.join('\n'),
                    })}
                    containerStyle={styles.actionContainer}
                    actionButtonLabel={Localize.t('account.addAccount')}
                    actionButtonIcon="IconPlus"
                    actionButtonIconSize={17}
                    onActionButtonPress={this.onAddAccountPress}
                />
            </View>
        );
    };

    renderAddAccountAction = () => {
        return (
            <View style={styles.contentContainer}>
                <Icon name="IconInfo" style={styles.infoIcon} size={80} />
                <Spacer size={18} />
                <Text style={AppStyles.h5}>{Localize.t('global.noAccountConfigured')}</Text>
                <Spacer size={18} />
                <InfoMessage
                    type="neutral"
                    labelStyle={styles.actionDescription}
                    label={Localize.t('global.pleaseAddAccountToSignTheTransaction')}
                    containerStyle={styles.actionContainer}
                    actionButtonLabel={Localize.t('account.addAccount')}
                    actionButtonIcon="IconPlus"
                    actionButtonIconSize={17}
                    onActionButtonPress={this.onAddAccountPress}
                />
            </View>
        );
    };

    renderSwitchNetworkAction = () => {
        const { requiredActionData, networkSwitchStatus } = this.state;
        const { coreSettings } = this.context;

        // if forced_network type is not "Mainnet" then we should only offer switching if developer mode is on
        let ShouldShowSwitchButton = true;
        if (requiredActionData.network.type !== NetworkType.Main && !coreSettings.developerMode) {
            ShouldShowSwitchButton = false;
        }

        return (
            <View style={styles.errorContainer}>
                <Image source={Images.ImageArrowUp} style={styles.arrowUpImage} />
                <Spacer size={18} />
                <Text style={[AppStyles.p, AppStyles.bold, AppStyles.textCenterAligned]}>
                    {Localize.t('payload.payloadForceNetworkError')}
                </Text>
                <Spacer size={18} />
                <Text style={styles.networkSwitchSubtext}>
                    {Localize.t('payload.pleaseSwitchToNetworkAndTryAgain', {
                        network: requiredActionData.network.name,
                    })}
                </Text>
                <Spacer size={30} />
                {ShouldShowSwitchButton && (
                    <Button
                        testID="preflight-switch-network"
                        secondary
                        roundedMini
                        label={Localize.t('global.switchNetwork')}
                        onPress={this.onSwitchNetworkPress}
                        isDisabled={networkSwitchStatus !== 'idle'}
                        isLoading={networkSwitchStatus === 'switching'}
                        loadingIndicatorStyle="default"
                    />
                )}
            </View>
        );
    };

    render() {
        const { transaction } = this.context;
        const { requiredAction } = this.state;

        // no action is required
        if (!requiredAction) {
            return null;
        }

        let ActionRenderer;

        switch (requiredAction) {
            case RequiredActionsType.SWITCH_NETWORK:
                ActionRenderer = this.renderSwitchNetworkAction;
                break;
            case RequiredActionsType.ADD_ACCOUNT:
                ActionRenderer = this.renderAddAccountAction;
                break;
            case RequiredActionsType.FORCED_SIGNER:
                ActionRenderer = this.renderForcedSigners;
                break;
            default:
                return null;
        }

        return (
            <View testID="preflight-error-view" style={styles.container}>
                <ReviewHeader onClose={this.onClose} transaction={transaction} />
                {ActionRenderer()}
            </View>
        );
    }
}

/* Export Component ==================================================================== */
export default PreflightStep;
