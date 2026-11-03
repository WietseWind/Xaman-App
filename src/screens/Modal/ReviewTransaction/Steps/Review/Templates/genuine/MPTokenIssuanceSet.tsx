import { isUndefined } from 'lodash';
import React, { Component } from 'react';
import { View, Text } from 'react-native';

import { MPTokenIssuanceSet } from '@common/libs/ledger/transactions';

import { ReadMore } from '@components/General';
import { AccountElement } from '@components/Modules';

import Localize from '@locale';

import styles from '../styles';

import { TemplateProps } from '../types';

/* types ==================================================================== */
export interface Props extends Omit<TemplateProps, 'transaction'> {
    transaction: MPTokenIssuanceSet;
}

export interface State {}

/* Component ==================================================================== */
class MPTokenIssuanceSetTemplate extends Component<Props, State> {
    constructor(props: Props) {
        super(props);

        this.state = {};
    }

    render() {
        const { transaction } = this.props;

        return (
            <>
                {!isUndefined(transaction.Holder) && (
                    <>
                        <Text style={styles.label}>{Localize.t('global.holder')}</Text>
                        <AccountElement
                            address={transaction.Holder}
                            containerStyle={[styles.contentBox, styles.addressContainer]}
                        />
                    </>
                )}

                {!isUndefined(transaction.MPTokenIssuanceID) && (
                    <>
                        <Text style={styles.label}>{Localize.t('global.mpTokenIssuanceID')}</Text>
                        <View style={styles.contentBox}>
                            <Text style={styles.value}>
                                {transaction.MPTokenIssuanceID || Localize.t('global.empty')}
                            </Text>
                        </View>
                    </>
                )}
                {!isUndefined(transaction.DomainID) && (
                    <>
                        <Text style={styles.label}>{Localize.t('global.domainID')}</Text>
                        <View style={styles.contentBox}>
                            <Text style={styles.value}>{transaction.DomainID}</Text>
                        </View>
                    </>
                )}

                {!isUndefined(transaction.TransferFee) && (
                    <>
                        <Text style={styles.label}>{Localize.t('global.transferFee')}</Text>
                        <View style={styles.contentBox}>
                            <Text style={styles.value}>{transaction.TransferFee}%</Text>
                        </View>
                    </>
                )}

                {!isUndefined(transaction.MPTokenMetadata) && (
                    <>
                        <Text style={styles.label}>{Localize.t('global.mpTokenMetadata')}</Text>
                        <View style={styles.contentBox}>
                            <ReadMore numberOfLines={3} textStyle={styles.value}>
                                {transaction.MPTokenMetadata || Localize.t('global.empty')}
                            </ReadMore>
                        </View>
                    </>
                )}

                {!isUndefined(transaction.ImmutableFlags) && (
                    <>
                        <Text style={styles.label}>{Localize.t('global.immutableFlags')}</Text>
                        <View style={styles.contentBox}>
                            <Text style={styles.value}>{transaction.ImmutableFlags}</Text>
                        </View>
                    </>
                )}

                {!isUndefined(transaction.IssuerEncryptionKey) && (
                    <>
                        <Text style={styles.label}>{Localize.t('global.issuerEncryptionKey')}</Text>
                        <View style={styles.contentBox}>
                            <Text style={styles.valueSubtext}>{transaction.IssuerEncryptionKey}</Text>
                        </View>
                    </>
                )}

                {!isUndefined(transaction.AuditorEncryptionKey) && (
                    <>
                        <Text style={styles.label}>{Localize.t('global.auditorEncryptionKey')}</Text>
                        <View style={styles.contentBox}>
                            <Text style={styles.valueSubtext}>{transaction.AuditorEncryptionKey}</Text>
                        </View>
                    </>
                )}
            </>
        );
    }
}

export default MPTokenIssuanceSetTemplate;
