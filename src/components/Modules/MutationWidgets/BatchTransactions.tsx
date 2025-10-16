import React, { PureComponent } from 'react';
import { View, Text, InteractionManager, SectionList, ActivityIndicator } from 'react-native';

import { Account } from '@common/libs/ledger/parser/types';

import { Icon } from '@components/General';
import AccountElement from '@components/Modules/AccountElement/AccountElement';

import Localize from '@locale';

import { AppStyles } from '@theme';
import styles from './styles';

/* Types ==================================================================== */
import { Props } from './types';
import StyleService from '@services/StyleService';
import { AccountModel } from '@store/models';
import { Transactions } from '@common/libs/ledger/transactions/types';
import { MixingTypes, MutationsMixinType } from '@common/libs/ledger/mixin/types';

// eslint-disable-next-line import/no-cycle
import { Transaction } from '@components/Modules/EventsList/EventListItems';

// import { sha512Half } from 'xrpl-binary-codec-prerelease/dist/hashes';
// import { encode } from 'xrpl-binary-codec-prerelease';
import { utils } from 'xrpl-accountlib';

import { TransactionFactory } from '@common/libs/ledger/factory';
import LedgerFactoryTx from '@common/libs/ledger/factory/transaction';
import LedgerService from '@services/LedgerService';
import NavigationService from '@services/NavigationService';
import { AppScreens } from '@common/constants';
import { Navigator } from '@common/helpers/navigator';
import { TransactionLoaderModalProps } from '@screens/Modal/TransactionLoader';
import { TransactionJson } from '@common/libs/ledger/types/transaction';
import { Batch } from '@common/libs/ledger/transactions';
import NetworkService from '@services/NetworkService';
import { AccountTxTransaction, ErrorResponse, TxResponse } from '@common/libs/ledger/types/methods';
import { TransactionDetailsViewProps } from '@screens/Events/Details';

interface State {
    // participants?: any;
    // dataSource: any[];
    parentTransaction?: Batch;
    innerTransactions?: InnerTransaction[];
    loadingParent?: boolean;
    loadingInner?: boolean;
}

interface ChildTransaction {
    childTransaction: Transactions & MutationsMixinType;
    hash: string;
    index: number;
    account: AccountModel;
}

interface InnerTransaction {
    transaction: Transactions & MutationsMixinType;
    hash: string;
    index: number;
    found: boolean;
    resp: TxResponse | ErrorResponse;
}

interface ParentTransaction {
    parentTransaction: Transactions & MutationsMixinType;
    hash: string;
    account: AccountModel;
}

/* Component ==================================================================== */
class BatchTransactions extends PureComponent<Props, State> {
    constructor(props: Props) {
        super(props);

        // console.log(Object.keys(props));
        
        this.state = {
            parentTransaction: undefined,
            innerTransactions: undefined,
            loadingParent: false,
            loadingInner: false,
        };
    }

    componentDidMount() {
        InteractionManager.runAfterInteractions(() => {
            this.loadData();
        });
    }

    loadData = async () => {
        const { item } = this.props;

        const parentBatch = (item as any || {})?.MetaData?.ParentBatchID;
        const innerBatch = ((item as any || {}).RawTransactions || []).length;

        if (parentBatch) {
            // TODO: set loading
            this.setState({
                loadingParent: true,
            });
            LedgerService.getTransaction(parentBatch).then((r: TxResponse | ErrorResponse) => {
                if (!r.error) {
                    const t = LedgerFactoryTx.fromLedger({
                        tx: r,
                        meta: (r as any).meta,
                    } as unknown as AccountTxTransaction, ['Mutation' as MixingTypes]);
                    this.setState({ parentTransaction: t, loadingParent: false });
                }
            });
        }

        if (innerBatch) {
            this.setState({
                loadingInner: true,
            });

            // TODO: set loading
            this.fetchInnerTransactions();
        }
    };

    ifUint8ToHex(data: string) {
        if (typeof data === 'string' && data.match(',')) {
            data = Buffer.from(data.split(',').map(n => Number(n)))
                .toString('hex')
                .toUpperCase();
        }
      
        return data;
    }

    onPress = async (txData: ChildTransaction | ParentTransaction) => {
        // TODO: We may want to show a loader here
        // TODO: We may want to consider switching accounts here if it involves another of our accounts
        // Although: we may as well just view everything from the perspectiv eof the account we're at?
        try {
            const resp = await LedgerService.getTransaction(txData.hash);
            // eslint-disable-next-line no-underscore-dangle
            // @ts-expect-error
            delete resp.__replyMs;
            // eslint-disable-next-line no-underscore-dangle
            delete resp.__command;
            delete resp.inLedger;

            const tx = ((resp as any)?.ctid && resp) ||
                (txData as any)?.childTransaction ||
                (txData as any)?.parentTransaction;
            const meta = (resp as any)?.meta || (txData as any)?.meta || undefined;
            const ledger_index = (resp as any)?.ledger_index || (txData as any)?.ledger_index || undefined;
            const validated = (resp as any)?.validated || (txData as any)?.validated || true;

            const transactionInstance = TransactionFactory.fromLedger({ tx, meta, ledger_index, validated }, [
                MixingTypes.Mutation,
            ]) as Transactions & MutationsMixinType;

            await Navigator.dismissModal();
                
            // // redirect to details screen with a little-bit delay
            setTimeout(() => {
                Navigator.showModal<TransactionDetailsViewProps>(AppScreens.Transaction.Details, {
                    item: transactionInstance,
                    account: txData.account,
                });
            }, 75);
        } catch (error) {
            // console.log('error', error)
        }
    };
    
    encodeInnerTransaction = (transaction: TransactionJson) => {
        return {
            transaction: TransactionFactory.fromJson(transaction, [MixingTypes.Mutation]),
            hash: utils.hashBatchInnerTxn(transaction, NetworkService.getNetworkDefinitions()),
        };
    };

    fetchInnerTransactions = async () => {
        try {
            const { item } = this.props;

            const txData = await Promise.all((item as any || {}).RawTransactions
                ?.map((innerTx: TransactionJson, index: number) => {
                const { transaction, hash } = this.encodeInnerTransaction(innerTx);
                return LedgerService.getTransaction(hash).then((resp) => {
                    if ('error' in resp) {
                        // console.log('Cannot fetch inner transaction', hash, resp.error === 'txnNotFound');
                        return {
                            transaction,
                            hash,
                            index,
                            found: false,
                            resp,
                        };
                    }

                    // console.log('Fetched inner transaction', hash, resp);
                    return {
                        transaction,
                        hash,
                        index,
                        found: true,
                        resp,
                    };
                });
            }));
            
            this.setState({
                innerTransactions: txData,
                loadingInner: false,
            });

            return txData;
        } catch (error) {
            //
        }

        return [];
    };

    render() {
        const { item, account } = this.props;
        const { parentTransaction, innerTransactions, loadingParent, loadingInner } = this.state;

        const parentBatch = (item as any || {})?.MetaData?.ParentBatchID;
        const innerBatch = ((item as any || {}).RawTransactions || []).length;

        if (parentBatch && loadingParent) {
            return (
                <View style={styles.detailContainer}>
                    <Text style={styles.detailsLabelText}>{Localize.t('txBatch.parentTransaction')}</Text>
                    <View style={[
                        styles.parentBatchContainer,
                    ]}>
                        <ActivityIndicator size="large" />
                    </View>
                </View>
            );
        }

        if (parentBatch && !loadingParent && parentTransaction) {
            return (
                <View style={[
                    styles.detailContainer,
                ]}>
                    <Text style={styles.detailsLabelText}>{Localize.t('txBatch.parentTransaction')}</Text>
                    <View key={`tx-${parentBatch}`} style={[
                        styles.parentBatchContainer,
                    ]}>
                        <Transaction
                            showDespiteThirdParty
                            onPress={() => this.onPress({
                                parentTransaction: parentTransaction as Transactions & MutationsMixinType,
                                hash: (parentTransaction.hash || ''),
                                account,
                            })}
                            item={parentTransaction as Transactions & MutationsMixinType}
                            account={account}
                            timestamp={0}
                        />
                    </View>
                </View>
            );
    
        }

        if (innerBatch) {
            // Todo: all has to be loaded fist
            return (
                <View style={styles.detailContainer}>
                    <Text style={styles.detailsLabelText}>
                        {Localize.t('txBatch.innerTransactions')}
                        {' '}({innerBatch})
                    </Text>
                    {
                        loadingInner && <ActivityIndicator style={AppStyles.marginTopSml} size="large" />
                    }
                    { 
                        !loadingInner && innerTransactions && innerTransactions
                            .map((innerTx: InnerTransaction, index: number) => {
                                const { transaction, hash } = innerTx;

                                return (
                                    <View key={`tx-${index}`}>
                                        <Transaction
                                            showDespiteThirdParty
                                            notFound={!innerTx.found}
                                            onPress={() => {
                                                if (!innerTx.found) {
                                                    return;
                                                }
                                                this.onPress({
                                                    childTransaction: transaction,
                                                    hash,
                                                    index,
                                                    account: { address: transaction.Account } as AccountModel,
                                                });
                                            }}
                                            item={transaction}
                                            account={
                                                { address: transaction.Account } as AccountModel
                                            }
                                            timestamp={0}
                                        />
                                    </View>
                                );
                        })
                    }
                </View>
            );
        }

        return null;
    }
}

export default BatchTransactions;
