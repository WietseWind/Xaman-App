import React, { Component } from 'react';
import { View, Text } from 'react-native';

import { Clawback } from '@common/libs/ledger/transactions';

import { AmountText } from '@components/General';

import Localize from '@locale';

import styles from '../styles';

import { TemplateProps } from '../types';
import { AccountElement } from '@components/Modules';
import { AppStyles } from '@theme/index';
/* types ==================================================================== */
export interface Props extends Omit<TemplateProps, 'transaction'> {
    transaction: Clawback;
}

export interface State {}

/* Component ==================================================================== */
class ClawbackTemplate extends Component<Props, State> {
    constructor(props: Props) {
        super(props);

        this.state = {};
    }

    render() {
        const { transaction } = this.props;

        return (
            <>
                {transaction.Holder && (
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

                <Text style={styles.label}>{Localize.t('global.amount')}</Text>
                <View style={styles.contentBox}>
                    <AmountText
                        value={transaction.Amount!.value}
                        currency={transaction.Amount!.currency}
                        style={styles.amount}
                        immutable
                    />
                </View>
            </>
        );
    }
}

export default ClawbackTemplate;
