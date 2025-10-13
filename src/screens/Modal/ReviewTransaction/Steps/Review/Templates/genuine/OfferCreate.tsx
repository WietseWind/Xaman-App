import { isUndefined } from 'lodash';

import React, { Component } from 'react';
import { View, Text, InteractionManager } from 'react-native';

import LedgerService from '@services/LedgerService';
import NetworkService from '@services/NetworkService';

import { AccountModel, TrustLineModel } from '@store/models';

import { OfferCreate } from '@common/libs/ledger/transactions';

import { AmountText, InfoMessage } from '@components/General';
import { AccountElement } from '@components/Modules';

import { FormatDate } from '@common/utils/date';
import { NormalizeCurrencyCode } from '@common/utils/monetary';
import { CalculateAvailableBalance } from '@common/utils/balance';

import Localize from '@locale';

import { AppStyles } from '@theme';
import styles from '../styles';

import { TemplateProps } from '../types';
/* types ==================================================================== */
export interface Props extends Omit<TemplateProps, 'transaction'> {
    transaction: OfferCreate;
    source: AccountModel;
}

export interface State {
    isLoadingIssuerFee: boolean;
    issuerFee: number;
    warning?: string;
}

/* Component ==================================================================== */
class OfferCreateTemplate extends Component<Props, State> {
    constructor(props: Props) {
        super(props);

        this.state = {
            isLoadingIssuerFee: true,
            issuerFee: 0,
            warning: undefined,
        };
    }

    componentDidMount() {
        InteractionManager.runAfterInteractions(() => {
            this.setIssuerTransferFee();
            this.setWarnings();
        });
    }

    setIssuerTransferFee = () => {
        const { transaction } = this.props;

        const issuerAddress = transaction.TakerGets?.issuer || transaction.TakerPays?.issuer;

        // get transfer rate from issuer account
        LedgerService.getAccountTransferRate(issuerAddress!)
            .then((issuerFee) => {
                if (issuerFee) {
                    this.setState({
                        issuerFee,
                    });
                }
            })
            .catch(() => {
                // ignore
            })
            .finally(() => {
                this.setState({
                    isLoadingIssuerFee: false,
                });
            });
    };

    setWarnings = () => {
        const { transaction, source } = this.props;

        let showFullBalanceLiquidWarning: boolean = false;

        // Warn users if they are about to trade their entire token worth
        const { issuer, currency, value } = transaction.TakerGets!;

        if (currency === NetworkService.getNativeAsset()) {
            // selling native currency
            showFullBalanceLiquidWarning = Number(value) >= CalculateAvailableBalance(source);
        } else {
            // sell IOU
            const line = source.lines?.find(
                (l: TrustLineModel) => l.currency.issuer === issuer && l.currency.currencyCode === currency,
            );

            if (line) {
                showFullBalanceLiquidWarning = Number(value) >= Number(line.balance);
            }
        }

        if (showFullBalanceLiquidWarning) {
            this.setState({
                warning: Localize.t('payload.tradeEntireTokenWorthWarning', {
                    currency: NormalizeCurrencyCode(currency),
                }),
            });
        }
    };

    render() {
        const { transaction } = this.props;
        const { isLoadingIssuerFee, issuerFee, warning } = this.state;

        return (
            <>
                <Text style={styles.label}>{Localize.t('global.issuer')}</Text>
                <AccountElement
                    address={transaction.TakerGets!.issuer || transaction.TakerPays!.issuer}
                    containerStyle={[styles.contentBox, styles.addressContainer]}
                />

                {warning && (
                    <View style={AppStyles.paddingBottomSml}>
                        <InfoMessage type="error" label={warning} />
                    </View>
                )}

                <Text style={styles.label}>{Localize.t('global.selling')}</Text>
                <View style={styles.contentBox}>
                    <AmountText
                        value={transaction.TakerGets!.value}
                        currency={transaction.TakerGets!.currency}
                        style={styles.amount}
                        immutable
                    />
                </View>

                <Text style={styles.label}>
                    {transaction.Flags?.tfSell
                        ? Localize.t('global.inExchangeForAtLeastReceive')
                        : Localize.t('global.inExchangeForReceive')}
                </Text>
                <View style={styles.contentBox}>
                    <AmountText
                        value={transaction.TakerPays!.value}
                        currency={transaction.TakerPays!.currency}
                        style={styles.amount}
                        immutable
                    />
                </View>

                <Text style={styles.label}>{Localize.t('global.issuerFee')}</Text>
                <View style={styles.contentBox}>
                    <Text style={styles.value}>{isLoadingIssuerFee ? 'Loading...' : `${issuerFee}%`}</Text>
                </View>

                {!isUndefined(transaction.Expiration) && (
                    <>
                        <Text style={styles.label}>{Localize.t('global.expireAfter')}</Text>
                        <View style={styles.contentBox}>
                            <Text style={styles.value}>{FormatDate(transaction.Expiration)}</Text>
                        </View>
                    </>
                )}

                {!isUndefined(transaction.OfferID) && (
                    <>
                        <Text style={styles.label}>{Localize.t('global.offerID')}</Text>
                        <View style={styles.contentBox}>
                            <Text style={styles.value}>{transaction.OfferID}</Text>
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

                {!isUndefined(transaction.OfferSequence) && (
                    <>
                        <Text style={styles.label}>{Localize.t('global.offerSequence')}</Text>
                        <View style={styles.contentBox}>
                            <Text style={styles.value}>{transaction.OfferSequence}</Text>
                        </View>
                    </>
                )}
            </>
        );
    }
}

export default OfferCreateTemplate;
