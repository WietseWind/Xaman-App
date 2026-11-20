import { isUndefined } from 'lodash';

import React, { Component } from 'react';
import { View, Text } from 'react-native';

import { Remit } from '@common/libs/ledger/transactions';
import { AmountType } from '@common/libs/ledger/parser/types';

import { Clipboard } from '@common/helpers/clipboard';
import { Toast } from '@common/helpers/interface';

import { AmountText, Icon, InfoMessage, ReadMore, TouchableDebounce } from '@components/General';
import { AccountElement, CurrencyElement, URITokenElement } from '@components/Modules';

import Localize from '@locale';

import styles from '../styles';

import { TemplateProps } from '../types';
import { remitContents, RemitContent } from './remitContents';
import { AppStyles } from '@theme';

/* types ==================================================================== */
export interface Props extends Omit<TemplateProps, 'transaction'> {
    transaction: Remit;
}

export interface State {}

/* Component ==================================================================== */
class RemitTemplate extends Component<Props, State> {
    constructor(props: Props) {
        super(props);

        this.state = {};
    }

    renderAmount = (amount: AmountType) => {
        const value = <AmountText value={amount.value} currency={amount.currency} style={styles.amount} immutable />;

        if (!amount.issuer) {
            // the native asset has no issuer to show: icon and name left, the amount right, on one line
            return (
                <View testID="remit-native-amount" style={[styles.contentBox, styles.remitNativeAmount]}>
                    <CurrencyElement currency={amount.currency} containerStyle={styles.remitNativeCurrency} />
                    {value}
                </View>
            );
        }

        return (
            <>
                <View style={styles.contentBox}>
                    <CurrencyElement issuer={amount.issuer} currency={amount.currency} />
                </View>
                <View testID="remit-issued-amount" style={[styles.contentBox, AppStyles.centerAligned]}>
                    {value}
                </View>
            </>
        );
    };

    renderURIToken = (id: string) => {
        return (
            <View style={styles.contentBox}>
                <URITokenElement
                    uriTokenId={id}
                    showBurnableStatus
                    truncate={false}
                    containerStyle={styles.uriTokenContainer}
                />
            </View>
        );
    };

    renderMint = (mint: Extract<RemitContent, { kind: 'mint' }>) => {
        return (
            <>
                {!isUndefined(mint.uri) && (
                    <>
                        <Text style={styles.label}>{Localize.t('global.uri')}</Text>
                        <View style={styles.contentBox}>
                            <Text selectable style={styles.value}>
                                {mint.uriText ?? mint.uri}
                            </Text>
                            {/* the bytes that are signed, next to the text they stand for */}
                            {!isUndefined(mint.uriText) && (
                                <Text selectable style={styles.valueSubtext}>
                                    {mint.uri}
                                </Text>
                            )}
                        </View>
                    </>
                )}

                {!isUndefined(mint.digest) && (
                    <>
                        <Text style={styles.label}>{Localize.t('global.digest')}</Text>
                        <View style={styles.contentBox}>
                            <Text selectable style={styles.valueSubtext}>
                                {mint.digest}
                            </Text>
                        </View>
                    </>
                )}

                {mint.burnable && (
                    <View style={styles.contentBox}>
                        <InfoMessage type="warning" flat label={Localize.t('payload.theIssuerCanBurnThisToken')} />
                    </View>
                )}

                {!isUndefined(mint.otherFlags) && (
                    <>
                        <Text style={styles.label}>{Localize.t('global.flags')}</Text>
                        <View style={styles.contentBox}>
                            <Text style={styles.valueSubtext}>{mint.otherFlags}</Text>
                        </View>
                    </>
                )}
            </>
        );
    };

    /**
     * Every amount, every URIToken and the URIToken to mint as a block of its own, in the way a
     * Batch shows its transactions: the signer sees how many things this one Remit does.
     */
    renderContents = () => {
        const { transaction } = this.props;
        const contents = remitContents(transaction);

        if (!contents.length) {
            return (
                <View style={styles.contentBox}>
                    <Text style={styles.value}>{Localize.t('global.empty')}</Text>
                </View>
            );
        }

        const title = {
            amount: Localize.t('global.amount'),
            uritoken: Localize.t('global.uritoken'),
            mint: Localize.t('events.mintURIToken'),
        };

        return contents.map((content, index) => (
            <View key={content.key} testID={`remit-content-${content.key}`} style={styles.transactionContainer}>
                <View style={styles.innerTransactionHeader}>
                    <Text style={styles.headerDesc}>{title[content.kind]}</Text>
                    <View style={styles.headerCountContainer}>
                        <Text style={styles.headerCount}>
                            ({index + 1}/{contents.length})
                        </Text>
                    </View>
                </View>
                <View style={styles.innerTransactionContainerBorder}>
                    {content.kind === 'amount' && this.renderAmount(content.amount)}
                    {content.kind === 'uritoken' && this.renderURIToken(content.id)}
                    {content.kind === 'mint' && this.renderMint(content)}
                </View>
            </View>
        ));
    };

    copyBlob = () => {
        const { transaction } = this.props;

        Clipboard.setString(transaction.Blob);
        Toast(Localize.t('payload.blobCopiedToClipboard'));
    };

    render() {
        const { transaction } = this.props;

        return (
            <>
                {!isUndefined(transaction.Destination) && (
                    <>
                        <View style={styles.label}>
                            <Text style={[AppStyles.subtext, AppStyles.bold, AppStyles.colorGrey]}>
                                {Localize.t('global.destination')}
                            </Text>
                        </View>

                        <AccountElement
                            address={transaction.Destination}
                            tag={transaction.DestinationTag}
                            containerStyle={[styles.contentBox, styles.addressContainer]}
                        />
                    </>
                )}

                {/* what this Remit sends, transfers and mints: one block each */}
                <Text style={styles.label}>{Localize.t('events.remitContents')}</Text>
                <View style={AppStyles.marginBottomSml}>{this.renderContents()}</View>

                {!isUndefined(transaction.Blob) && (
                    <>
                        <View style={AppStyles.row}>
                            <Text style={styles.label}>{Localize.t('global.blob')}</Text>
                            <View style={[AppStyles.flex1, AppStyles.rightAligned]}>
                                <TouchableDebounce style={styles.copyButton} onPress={this.copyBlob}>
                                    <Text style={styles.copyText}>{Localize.t('global.copy')}</Text>
                                    <Icon size={18} name="IconClipboard" style={AppStyles.imgColorGrey} />
                                </TouchableDebounce>
                            </View>
                        </View>
                        <View style={styles.contentBox}>
                            <ReadMore numberOfLines={3} textStyle={styles.value}>
                                {transaction.Blob}
                            </ReadMore>
                        </View>
                    </>
                )}

                {!isUndefined(transaction.Inform) && (
                    <>
                        <View style={styles.label}>
                            <Text style={[AppStyles.subtext, AppStyles.bold, AppStyles.colorGrey]}>
                                {Localize.t('global.inform')}
                            </Text>
                        </View>
                        <AccountElement
                            address={transaction.Inform}
                            containerStyle={[styles.contentBox, styles.addressContainer]}
                        />
                    </>
                )}

                {!isUndefined(transaction.InvoiceID) && (
                    <>
                        <Text style={styles.label}>{Localize.t('global.invoiceID')}</Text>
                        <View style={styles.contentBox}>
                            <Text style={styles.value}>{transaction.InvoiceID}</Text>
                        </View>
                    </>
                )}
            </>
        );
    }
}

export default RemitTemplate;
