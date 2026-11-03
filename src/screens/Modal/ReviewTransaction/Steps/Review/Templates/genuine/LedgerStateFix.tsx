import { isUndefined } from 'lodash';

import React, { Component } from 'react';
import { View, Text } from 'react-native';

import { LedgerStateFix } from '@common/libs/ledger/transactions';
import { LedgerFixTypes } from '@common/libs/ledger/types/enums';

import { AccountElement } from '@components/Modules';

import Localize from '@locale';

import { AppStyles } from '@theme';
import styles from '../styles';

import { TemplateProps } from '../types';
/* types ==================================================================== */
export interface Props extends Omit<TemplateProps, 'transaction'> {
    transaction: LedgerStateFix;
}

export interface State {}

/* Component ==================================================================== */
class LedgerStateFixTemplate extends Component<Props, State> {
    constructor(props: Props) {
        super(props);

        this.state = {};
    }

    getFixTypeLabel = (): string => {
        const { transaction } = this.props;

        switch (transaction.LedgerFixType) {
            case LedgerFixTypes.NFTokenPageLink:
                return Localize.t('events.ledgerFixTypeNFTokenPageLink');
            case LedgerFixTypes.BookExchangeRate:
                return Localize.t('events.ledgerFixTypeBookExchangeRate');
            default:
                return String(transaction.LedgerFixType);
        }
    };

    render() {
        const { transaction } = this.props;

        return (
            <>
                <Text style={styles.label}>{Localize.t('events.ledgerFixType')}</Text>
                <View style={styles.contentBox}>
                    <Text style={styles.value}>{this.getFixTypeLabel()}</Text>
                </View>

                {!isUndefined(transaction.Owner) && (
                    <>
                        <View style={styles.label}>
                            <Text style={[AppStyles.subtext, AppStyles.bold, AppStyles.colorGrey]}>
                                {Localize.t('global.owner')}
                            </Text>
                        </View>
                        <AccountElement
                            address={transaction.Owner}
                            containerStyle={[styles.contentBox, styles.addressContainer]}
                        />
                    </>
                )}

                {!isUndefined(transaction.BookDirectory) && (
                    <>
                        <Text style={styles.label}>{Localize.t('events.bookDirectory')}</Text>
                        <View style={styles.contentBox}>
                            <Text style={styles.valueSubtext}>{transaction.BookDirectory}</Text>
                        </View>
                    </>
                )}
            </>
        );
    }
}

export default LedgerStateFixTemplate;
