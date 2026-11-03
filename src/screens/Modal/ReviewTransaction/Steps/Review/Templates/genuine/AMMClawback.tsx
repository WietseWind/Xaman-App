import { isUndefined } from 'lodash';

import React, { Component } from 'react';
import { View, Text } from 'react-native';

import { AMMClawback } from '@common/libs/ledger/transactions';

import { AmountText } from '@components/General';
import { AccountElement, CurrencyElement } from '@components/Modules';

import Localize from '@locale';

import { AppStyles } from '@theme';
import styles from '../styles';

import { TemplateProps } from '../types';
/* types ==================================================================== */
export interface Props extends Omit<TemplateProps, 'transaction'> {
    transaction: AMMClawback;
}

export interface State {}

/* Component ==================================================================== */
class AMMClawbackTemplate extends Component<Props, State> {
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
                        <View style={styles.label}>
                            <Text style={[AppStyles.subtext, AppStyles.bold, AppStyles.colorGrey]}>
                                {Localize.t('global.holder')}
                            </Text>
                        </View>
                        <AccountElement
                            address={transaction.Holder}
                            containerStyle={[styles.contentBox, styles.addressContainer]}
                        />
                    </>
                )}

                {!isUndefined(transaction.Asset) && (
                    <>
                        <Text style={styles.label}>{Localize.t('events.asset')}</Text>
                        <View style={styles.contentBox}>
                            <CurrencyElement issuer={transaction.Asset.issuer} currency={transaction.Asset.currency} />
                        </View>
                    </>
                )}

                {!isUndefined(transaction.Asset2) && (
                    <>
                        <Text style={styles.label}>{Localize.t('events.asset2')}</Text>
                        <View style={styles.contentBox}>
                            <CurrencyElement
                                issuer={transaction.Asset2.issuer}
                                currency={transaction.Asset2.currency}
                            />
                        </View>
                    </>
                )}

                {!isUndefined(transaction.Amount) && (
                    <>
                        <Text style={styles.label}>{Localize.t('global.amount')}</Text>
                        <View style={styles.contentBox}>
                            <AmountText
                                value={transaction.Amount.value}
                                currency={transaction.Amount.currency}
                                style={styles.amount}
                                immutable
                            />
                        </View>
                    </>
                )}
            </>
        );
    }
}

export default AMMClawbackTemplate;
