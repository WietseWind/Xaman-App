import React, { PureComponent } from 'react';
import { View, Text } from 'react-native';

import Localize from '@locale';
import { mptAssetScale, mptRawToDisplay } from '@common/utils/mptAmount';

import styles from './styles';

/* Types ==================================================================== */
import { Props } from './types';

interface State {
    // description?: string;
}

/* Component ==================================================================== */
class MPTWidget extends PureComponent<Props, State> {
    constructor(props: Props) {
        super(props);

        // this.state = {
        //     description: undefined,
        // };
    }

    componentDidMount() {
        // InteractionManager.runAfterInteractions(this.setDescription);
    }

    // setDescription = () => {
    //     const { explainer } = this.props;

    //     this.setState({
    //         description: explainer?.generateDescription(),
    //     });
    // };

    render() {
        const {
            item,
            isPaymentScreen,
            labelStyle,
            contentStyle,
            noIssuanceId,
        } = this.props;

        const txType = (item as any)?.TransactionType || (item as any)?.LedgerEntryType || '';
        const amount = (item as any)?.Amount && typeof (item as any).Amount !== 'string'
            ? (item as any).Amount
            : undefined;

        if (!txType.match(/mpt|clawback/i) && !(amount && amount?.mpt_issuance_id)) {
            return undefined;
        }

        let mpTokenIssuance = txType === 'MPTokenIssuanceCreate'
            ? (item as any)
            : (item as any)?._meta &&
                (item as any)?._meta?._attachments &&
                (item as any)?._meta?._attachments?.MPTokenIssuance
                ? (item as any)?._meta?._attachments?.MPTokenIssuance
                : ((item as any)?.LedgerEntryType || '').match(/mpt/i)
                    ? (item as any)
                    : undefined;

        if (!mpTokenIssuance) {
            return undefined;
        }

        const mptIssuanceId = mpTokenIssuance?.mpt_issuance_id || mpTokenIssuance?.MPTokenIssuanceID;

        if (!mptIssuanceId) {
            return undefined;
        }

        try {
            if (mpTokenIssuance?._object?._MPTokenIssuanceID) {
                mpTokenIssuance = mpTokenIssuance?._object?._MPTokenIssuanceID;
            }
        } catch {
            //
        }

        let assetScale: number;
        try {
            assetScale = mptAssetScale(mpTokenIssuance?.AssetScale);
        } catch {
            return undefined;
        }
        const scale = (value: string | number) => mptRawToDisplay(value, assetScale);

        return (
            <View style={isPaymentScreen ? styles.detailContainerPS : styles.detailContainer}>
                {!isPaymentScreen && (
                    <Text style={styles.detailsLabelText}>{Localize.t('mptokenIssuance.explainerTitle')}</Text>
                )}

                {mptIssuanceId && !noIssuanceId && (
                    <>
                        <Text style={labelStyle || styles.detailsLabelSubText}>Issuance ID</Text>
                        <Text selectable style={contentStyle || [styles.hashText, styles.marginBottom]}>
                            {mptIssuanceId}
                        </Text>
                    </>
                )}

                {!!mpTokenIssuance?.TransferFee && mpTokenIssuance.TransferFee > 0 && (
                    <>
                        <Text style={labelStyle || styles.detailsLabelSubText}>Transfer Fee</Text>
                        <Text selectable style={contentStyle || [styles.hashText, styles.marginBottom]}>
                            {mpTokenIssuance.TransferFee / 100}%
                        </Text>
                    </>
                )}

                {assetScale > 0 && (
                    <>
                        <Text style={labelStyle || styles.detailsLabelSubText}>Asset Scale</Text>
                        <Text selectable style={contentStyle || [styles.hashText, styles.marginBottom]}>
                            {assetScale} {assetScale > 0 && `(/ 1${'0'.repeat(assetScale)})`}
                        </Text>
                    </>
                )}

                {mpTokenIssuance?.MaximumAmount && mpTokenIssuance.MaximumAmount > 0 && (
                    <>
                        <Text style={labelStyle || styles.detailsLabelSubText}>Maximum Amount</Text>
                        <Text selectable style={contentStyle || [styles.hashText, styles.marginBottom]}>
                            {scale(mpTokenIssuance.MaximumAmount)} {assetScale > 0 && `(${mpTokenIssuance.MaximumAmount})`}
                        </Text>
                    </>
                )}

                {mpTokenIssuance?.OutstandingAmount && mpTokenIssuance.OutstandingAmount > 0 && (
                    <>
                        <Text style={labelStyle || styles.detailsLabelSubText}>Outstanding Amount</Text>
                        <Text selectable style={contentStyle || [styles.hashText, styles.marginBottom]}>
                            {scale(mpTokenIssuance.OutstandingAmount)} {assetScale > 0 && `(${mpTokenIssuance.OutstandingAmount})`}
                        </Text>
                    </>
                )}

                {mpTokenIssuance?.MPTokenMetadata && (
                    <>
                        <Text style={labelStyle || styles.detailsLabelSubText}>Meta Data</Text>
                        <Text selectable style={contentStyle || styles.hashText}>
                            {mpTokenIssuance.MPTokenMetadata}
                        </Text>
                    </>
                )}

            </View>
        );
    }
}

export default MPTWidget;
