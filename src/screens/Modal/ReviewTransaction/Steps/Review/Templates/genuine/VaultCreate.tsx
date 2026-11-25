import { isUndefined } from 'lodash';

import React, { Component } from 'react';
import { View, Text } from 'react-native';

import { VaultCreate } from '@common/libs/ledger/transactions';

import { AmountText, InfoMessage } from '@components/General';
import { CurrencyElement } from '@components/Modules';

import { FormatDate } from '@common/utils/date';

import Localize from '@locale';

import { AppStyles } from '@theme';
import styles from '../styles';

import { TemplateProps } from '../types';

/* types ==================================================================== */
export interface Props extends Omit<TemplateProps, 'transaction'> {
    transaction: VaultCreate;
}

export interface State {}

/* Component ==================================================================== */
class VaultCreateTemplate extends Component<Props, State> {
    constructor(props: Props) {
        super(props);

        this.state = {};
    }

    render() {
        const { transaction } = this.props;

        return (
            <>
                {transaction.isPrivate && (
                    <InfoMessage
                        type="info"
                        label={Localize.t('vault.isPrivateExplain')}
                        containerStyle={AppStyles.marginBottomSml}
                    />
                )}

                {transaction.isShareNonTransferable && (
                    <InfoMessage
                        type="warning"
                        label={Localize.t('vault.sharesNonTransferableExplain')}
                        containerStyle={AppStyles.marginBottomSml}
                    />
                )}

                {!isUndefined(transaction.Asset) && (
                    <>
                        <Text style={styles.label}>{Localize.t('vault.asset')}</Text>
                        <View style={styles.contentBox}>
                            <CurrencyElement
                                issuer={transaction.Asset.issuer}
                                currency={transaction.Asset.currency}
                            />
                        </View>
                    </>
                )}

                {!isUndefined(transaction.Scale) && (
                    <>
                        <Text style={styles.label}>{Localize.t('vault.scale')}</Text>
                        <View style={styles.contentBox}>
                            <Text style={styles.value}>{transaction.Scale}</Text>
                        </View>
                    </>
                )}

                {!isUndefined(transaction.WithdrawalPolicy) && (
                    <>
                        <Text style={styles.label}>{Localize.t('vault.withdrawalPolicy')}</Text>
                        <View style={styles.contentBox}>
                            <Text style={styles.value}>{transaction.WithdrawalPolicy}</Text>
                        </View>
                    </>
                )}

                {!isUndefined(transaction.AssetsMaximum) && (
                    <>
                        <Text style={styles.label}>{Localize.t('vault.assetsMaximum')}</Text>
                        <View style={styles.contentBox}>
                            <AmountText
                                value={transaction.AssetsMaximum.value}
                                currency={transaction.AssetsMaximum.currency}
                                style={styles.amount}
                                immutable
                            />
                        </View>
                    </>
                )}

                {!isUndefined(transaction.DomainID) && (
                    <>
                        <Text style={styles.label}>{Localize.t('vault.domainId')}</Text>
                        <View style={styles.contentBox}>
                            <Text style={styles.value}>{transaction.DomainID}</Text>
                        </View>
                    </>
                )}

                {!isUndefined(transaction.Data) && (
                    <>
                        <Text style={styles.label}>{Localize.t('vault.data')}</Text>
                        <View style={styles.contentBox}>
                            <Text style={styles.value}>{transaction.Data}</Text>
                        </View>
                    </>
                )}

                {!isUndefined(transaction.MPTokenMetadata) && (
                    <>
                        <Text style={styles.label}>{Localize.t('vault.mpTokenMetadata')}</Text>
                        <View style={styles.contentBox}>
                            <Text style={styles.value}>{transaction.MPTokenMetadata}</Text>
                        </View>
                    </>
                )}
                {!isUndefined(transaction.VaultKind) && (
                    <>
                        <Text style={styles.label}>{Localize.t('vault.vaultKind')}</Text>
                        <View style={styles.contentBox}>
                            <Text style={styles.value}>
                                {transaction.VaultKind === 0
                                    ? Localize.t('vault.vaultKindOpenEnded')
                                    : transaction.VaultKind === 1
                                      ? Localize.t('vault.vaultKindClosedEnded')
                                      : transaction.VaultKind}
                            </Text>
                        </View>
                    </>
                )}

                {!isUndefined(transaction.SubscriptionDate) && (
                    <>
                        <Text style={styles.label}>{Localize.t('vault.subscriptionDate')}</Text>
                        <View style={styles.contentBox}>
                            <Text style={styles.value}>{FormatDate(transaction.SubscriptionDate!)}</Text>
                        </View>
                    </>
                )}

                {!isUndefined(transaction.RedemptionDate) && (
                    <>
                        <Text style={styles.label}>{Localize.t('vault.redemptionDate')}</Text>
                        <View style={styles.contentBox}>
                            <Text style={styles.value}>{FormatDate(transaction.RedemptionDate!)}</Text>
                        </View>
                    </>
                )}
            </>
        );
    }
}

export default VaultCreateTemplate;
