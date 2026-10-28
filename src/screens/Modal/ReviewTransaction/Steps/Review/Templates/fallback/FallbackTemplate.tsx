import React, { Component } from 'react';
import { View, Text } from 'react-native';

import { BaseTransaction } from '@common/libs/ledger/transactions/common';
import TransactionData from '@components/Modules/TransactionData';
import UniversalTransactionWarning from '@components/Modules/TransactionData/UniversalTransactionWarning';

import { Clipboard } from '@common/helpers/clipboard';
import { Toast } from '@common/helpers/interface';

import { AmountParser } from '@common/libs/ledger/parser/common';

import { FeePicker } from '@components/Modules';
import { Button } from '@components/General';

import NetworkService from '@services/NetworkService';

import Localize from '@locale';

import { AppFonts, AppStyles } from '@theme';
import ExtraFields from '../../ExtraFields';
import styles from '../styles';

import { TemplateProps } from '../types';

/* types ==================================================================== */
export interface Props extends Omit<TemplateProps, 'transaction'> {
    transaction: BaseTransaction;
}

export interface State {
    transactionJsonData?: Record<string, any>;
    showFeePicker: boolean;
}
/* Component ==================================================================== */
class FallbackTemplate extends Component<Props, State> {
    constructor(props: Props) {
        super(props);

        this.state = {
            transactionJsonData: undefined,
            // a Batch inner transaction is signed as received, so its fee is not picked here
            showFeePicker:
                !props.innerBatch && typeof props.transaction?.Fee === 'undefined' && !props.payload.isMultiSign(),
        };
    }

    static getDerivedStateFromProps(nextProps: Props): Partial<State> | null {
        if (nextProps.transaction) {
            return {
                transactionJsonData: nextProps.transaction.JsonForSigning,
            };
        }

        return null;
    }

    onJsonCopyPress = () => {
        const { transactionJsonData } = this.state;

        Clipboard.setString(JSON.stringify(transactionJsonData, null, 2));

        Toast(Localize.t('payload.transactionJsonCopiedToClipboard'));
    };

    setTransactionFee = (fee: any) => {
        const { transaction } = this.props;

        // NOTE: setting the transaction fee require Native and not Drops
        transaction.Fee = {
            currency: NetworkService.getNativeAsset(),
            value: new AmountParser(fee.value).dropsToNative().toString(),
        };

        this.setState({
            transactionJsonData: transaction.JsonForSigning,
        });
    };

    render() {
        const { transaction, source } = this.props;
        const { transactionJsonData, showFeePicker } = this.state;

        if (!transactionJsonData) {
            return null;
        }

        return (
            <>
                <UniversalTransactionWarning />

                {/* Fields Xaman has no screen for, including nested values. */}
                <ExtraFields transaction={transaction} />

                <View style={[AppStyles.row, styles.label]}>
                    <View style={[AppStyles.flex1, AppStyles.centerContent]}>
                        <Text style={[AppStyles.subtext, AppStyles.bold, AppStyles.colorGrey]}>
                            {Localize.t('global.jsonView')}
                        </Text>
                    </View>
                    <Button
                        onPress={this.onJsonCopyPress}
                        icon="IconClipboard"
                        label={Localize.t('global.copy')}
                        textStyle={{ fontSize: AppFonts.small.size }}
                        iconSize={15}
                        roundedMini
                        light
                    />
                </View>

                {/* Raw JSON stays below the warning. It is the developer view of the same fields. */}
                <View testID="universal-transaction-json" style={styles.jsonTreeContainer}>
                    <TransactionData transaction={transaction} />
                </View>

                {/* Fee picker  */}
                {showFeePicker && (
                    <>
                        <Text style={styles.label}>{Localize.t('global.fee')}</Text>
                        <FeePicker
                            txJson={transaction.JsonForSigning}
                            onSelect={this.setTransactionFee}
                            containerStyle={styles.contentBox}
                            source={source}
                            textStyle={styles.feeText}
                        />
                    </>
                )}
            </>
        );
    }
}

export default FallbackTemplate;
