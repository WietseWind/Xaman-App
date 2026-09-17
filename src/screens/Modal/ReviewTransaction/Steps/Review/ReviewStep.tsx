/**
 * Review Step
 */

import { get } from 'lodash';
import React, { Component } from 'react';
import { ImageBackground, Text, View } from 'react-native';
import { OptionsModalPresentationStyle } from 'react-native-navigation';

import { BackendService, LedgerService, PushNotificationsService, ResolverService, StyleService } from '@services';

import { AppScreens } from '@common/constants';
import { Navigator } from '@common/helpers/navigator';
import { Payload } from '@common/libs/payload';
import { TransactionJson } from '@common/libs/ledger/types/transaction';

// components
import { Button, InfoMessage, JsonTree, KeyboardAwareScrollView, Spacer, SwipeButton } from '@components/General';
import { AccountPicker } from '@components/Modules';

import { InstanceTypes } from '@common/libs/ledger/types/enums';

import { AppInfo, SignerLabel, SignForAccount } from '@components/Modules/ReviewTransaction';
import { ReviewHeader } from '@screens/Modal/ReviewTransaction/Shared';

import Localize from '@locale';

import { AppStyles } from '@theme';
import styles from './styles';
import { CancelCraft, resolveScamSignRequest } from '../../scamRejectAction';

// transaction templates
import * as GenuineTransactionTemplates from './Templates/genuine';
import * as PseudoTransactionTemplates from './Templates/pseudo';
import { FallbackTemplate } from './Templates/fallback';

import { StepsContext } from '../../Context';
/* types ==================================================================== */
export interface Props {
}

export interface State {
    canScroll: boolean;
    timestamp?: number;
    canSendFee: boolean;
    riskMustWarnUser: boolean;
    riskUserWarnedAccepted?: boolean;
    riskQuestionStage?: number;
    isScamCounterpart: boolean;
    cancelCraft?: CancelCraft;
}

/* Component ==================================================================== */
class ReviewStep extends Component<Props, State> {
    static contextType = StepsContext;
    declare context: React.ContextType<typeof StepsContext>;

    private mounted = false;

    constructor(props: Props) {
        super(props);

        // console.log('Reviewstep')

        this.state = {
            canScroll: true,
            canSendFee: true,
            riskMustWarnUser: false,
            isScamCounterpart: false,
        };
    }

    componentDidMount(): void {
        const { payload, coreSettings } = this.context;
        const { riskUserWarnedAccepted } = this.state;

        this.mounted = true;

        try {
            const isDevBuildingMode = String(process?.env?.NODE_ENV || '').toLowerCase() === 'development';
            if (!coreSettings?.developerMode || isDevBuildingMode) {
            // if (!coreSettings?.developerMode) {
                // ^^ do not warn appdevs
                if (payload?.risk?.__warn_user && typeof riskUserWarnedAccepted === 'undefined') {
                    this.setState({
                        riskMustWarnUser: true,
                        riskUserWarnedAccepted: false,
                        riskQuestionStage: 0,
                    });
                }
            }
        } catch (error) {
            // ignore
        }

        this.detectScamAndCancel();
    }

    componentWillUnmount(): void {
        this.mounted = false;
    }

    detectScamAndCancel = async () => {
        const { transaction, source, payload } = this.context;

        if (!transaction) {
            return;
        }

        const { isScam, cancelCraft } = await resolveScamSignRequest(
            transaction,
            source?.address,
            !!payload?.risk?.__warn_user,
            {
                getLedgerEntry: async (index) => LedgerService.getLedgerEntry({ index }),
                getNFTDetails: BackendService.getNFTDetails,
                getAccountAdvisory: BackendService.getAccountAdvisory,
                getAccountName: ResolverService.getAccountName,
            },
        );

        if (!this.mounted) {
            return;
        }

        this.setState({
            isScamCounterpart: isScam,
            cancelCraft,
        });
    };

    onScamAcceptSwipe = () => {
        const { onAccept } = this.context;

        Navigator.showAlertModal({
            type: 'warning',
            title: Localize.t('global.alertDanger'),
            text: Localize.t('payload.scamAcceptConfirm'),
            buttons: [
                {
                    text: Localize.t('global.cancel'),
                    type: 'dismiss',
                    light: true,
                },
                {
                    text: Localize.t('global.continue'),
                    onPress: onAccept,
                    light: false,
                },
            ],
        });
    };

    onScamCancelPress = () => {
        const { payload, source } = this.context;
        const { cancelCraft } = this.state;

        if (!cancelCraft || !source) {
            return;
        }

        payload.reject('USER');
        setTimeout(() => {
            PushNotificationsService.emit('signRequestUpdate');
        }, 1000);

        Navigator.dismissModal().then(() => {
            const craftedTxJson = {
                ...cancelCraft.txJson,
                Account: source.address,
            } as TransactionJson;

            Navigator.showModal(
                AppScreens.Modal.ReviewTransaction,
                {
                    payload: Payload.build(craftedTxJson),
                },
                { modalPresentationStyle: OptionsModalPresentationStyle.fullScreen },
            );
        });
    };

    toggleCanScroll = () => {
        this.setState({ canScroll: true });
    };

    toggleCannotScroll = () => {
        this.setState({ canScroll: false });
    };

    getSwipeButtonColor = (): string | undefined => {
        const { coreSettings } = this.context;
        const { isScamCounterpart } = this.state;

        if (isScamCounterpart) {
            return StyleService.value('$red');
        }

        if (coreSettings?.developerMode && coreSettings?.network) {
            return coreSettings.network.color;
        }

        return undefined;
    };

    forceRender = () => {
        this.setState({
            // eslint-disable-next-line react/no-unused-state
            timestamp: +new Date(),
        });
    };

    renderDetails = () => {
        const {
            payload,
            transaction,
            source,
            setLoading,
            setReady,
            setServiceFee,
            serviceFee,
            setTransaction,
        } = this.context;

        if (!transaction) {
            return null;
        }

        const Components = [];
        const Props = {
            source,
            transaction,
            payload,
            forceRender: this.forceRender,
            setLoading,
            setReady,
            setServiceFee,
        } as any;

        // TODO: add logic for checking if template is exist before calling React.createElement

        switch (transaction.InstanceType) {
            case InstanceTypes.PseudoTransaction:
                Components.push(
                    React.createElement(get(PseudoTransactionTemplates, String(transaction.Type)), {
                        ...Props,
                        key: `${transaction.Type}Template`,
                    }),
                );
                break;
            case InstanceTypes.GenuineTransaction:
                Components.push(
                    React.createElement(get(GenuineTransactionTemplates, String(transaction.Type)), {
                        ...Props,
                        key: `${transaction!.Type}Template`,
                    }),
                    React.createElement(get(GenuineTransactionTemplates, 'Global'), {
                        ...Props,
                        serviceFee,
                        setTransaction,
                        canSendFee: (canSend: boolean) => {
                            const { canSendFee } = this.state;
                            if (canSend !== canSendFee) {
                                requestAnimationFrame(() => {
                                    this.setState({
                                        canSendFee: canSend,
                                    });
                                });
                            }
                        },
                        key: 'GlobalTemplate',
                    }),
                );
                break;
            case InstanceTypes.FallbackTransaction:
                Components.push(
                    React.createElement(FallbackTemplate, {
                        ...Props,
                        key: `${transaction!.Type}Template`,
                    }),
                );
                break;
            default:
                break;
        }

        return Components;
    };

    render() {
        const {
            accounts,
            payload,
            transaction,
            source,
            isReady,
            isLoading,
            setSource,
            onAccept,
            onClose,
            coreSettings,
        } = this.context;

        const {
            canScroll,
            canSendFee,
            riskMustWarnUser,
            riskUserWarnedAccepted,
            riskQuestionStage,
            isScamCounterpart,
            cancelCraft,
        } = this.state;

        // waiting for accounts / transaction to be initiated
        if (typeof accounts === 'undefined' || !source || !transaction) {
            return null;
        }

        const mustStillWarn = riskMustWarnUser && !riskUserWarnedAccepted;

        return (
            <ImageBackground
                testID="review-transaction-modal"
                source={StyleService.getImageIfLightModeIfDarkMode('BackgroundShapesLight', 'BackgroundShapes')}
                imageStyle={styles.xamanAppBackground}
                resizeMode="cover"
                style={styles.container}
            >
                <ReviewHeader transaction={transaction} onClose={onClose} />
                <KeyboardAwareScrollView
                    testID="review-content-container"
                    contentContainerStyle={styles.keyboardAvoidContainerStyle}
                    style={AppStyles.flex1}
                    scrollEnabled={canScroll}
                >
                    {mustStillWarn && (
                        <View style={[
                            AppStyles.paddingHorizontalSml,
                            AppStyles.marginTopSml,
                        ]}>
                            <AppInfo source={source} transaction={transaction} payload={payload} />
                            {Number(riskQuestionStage || 0) > -1 && (
                                <Text style={[
                                    AppStyles.baseText,
                                    AppStyles.marginTopSml,
                                ]}>{Localize.t('payloadRiskWarning.beforeTransactionSomeQuestions')}</Text>
                            )}
                            <View style={[
                                AppStyles.marginTopSml,
                            ]}>
                                {riskQuestionStage === 0 && (
                                    <Text style={[
                                        AppStyles.h5,
                                        AppStyles.bold,
                                    ]}>{Localize.t('payloadRiskWarning.isSomeonePromising')}</Text>
                                )}
                                {riskQuestionStage === 1 && (
                                    <Text style={[
                                        AppStyles.h5,
                                        AppStyles.bold,
                                    ]}>{Localize.t('payloadRiskWarning.isSomeoneSupport')}</Text>
                                )}
                                {riskQuestionStage === 2 && (
                                    <Text style={[
                                        AppStyles.h5,
                                        AppStyles.bold,
                                    ]}>{Localize.t('payloadRiskWarning.isSomeoneTeam')}</Text>
                                )}
                                {riskQuestionStage === 3 && (
                                    <Text style={[
                                        AppStyles.h5,
                                        AppStyles.bold,
                                    ]}>{Localize.t('payloadRiskWarning.areYouAwareThatNonReversible')}</Text>
                                )}
                                {Number(riskQuestionStage || 0) > -1 && (
                                    <View style={[
                                        AppStyles.row,
                                        AppStyles.marginTopSml,
                                        AppStyles.marginBottom,
                                        AppStyles.paddingBottom,
                                    ]}>
                                        <View style={[
                                            AppStyles.flex1,
                                            AppStyles.paddingRightExtraSml,
                                        ]}>
                                            <Button
                                                onPress={
                                                    () => {
                                                        this.setState({
                                                            riskQuestionStage: Number(riskQuestionStage || 0) + 1,
                                                            riskUserWarnedAccepted:
                                                                Number(riskQuestionStage || 0) + 1 === 4, // 3 questions
                                                        });
                                                        try {
                                                            BackendService.auditTrail(
                                                                source.address,
                                                                {
                                                                    riskInfo: payload?.risk,
                                                                    payload: payload.meta.uuid,
                                                                    question: Number(riskQuestionStage || 0),
                                                                    answer: 'NO',
                                                                },
                                                            );
                                                        } catch (error) {
                                                            // ignore
                                                        }
                                                    }
                                                }
                                                style={[
                                                    AppStyles.buttonGrey,
                                                ]}
                                                label={Localize.t('payloadRiskWarning.no')}
                                            />
                                        </View>
                                        <View style={[
                                            AppStyles.flex1,
                                            AppStyles.paddingLeftExtraSml,
                                        ]}>
                                            <Button
                                                onPress={
                                                    () => {
                                                        this.setState({
                                                            riskQuestionStage: -1,
                                                        });
                                                        try {
                                                            BackendService.auditTrail(
                                                                source.address,
                                                                {
                                                                    riskInfo: payload?.risk,
                                                                    payload: payload.meta.uuid,
                                                                    question: Number(riskQuestionStage || 0),
                                                                    answer: 'YES (!!!)',
                                                                },
                                                            );
                                                        } catch (error) {
                                                            // ignore
                                                        }
                                                    } 
                                                }
                                                style={[
                                                    AppStyles.buttonBlue,
                                                ]}
                                                label={Localize.t('payloadRiskWarning.yes')}
                                            />
                                        </View>
                                    </View>
                                )}
                                {riskQuestionStage === -1 && (
                                    <InfoMessage
                                        type="error"
                                    >
                                        <Text style={[
                                            AppStyles.subtext,
                                            AppStyles.colorRed,
                                        ]}>
                                            {Localize.t('payloadRiskWarning.postAcceptedHeader')}
                                        </Text>
                                        <Text style={[
                                            AppStyles.marginTopSml,
                                            AppStyles.subtext,
                                            AppStyles.bold,
                                            AppStyles.colorRed,
                                            // eslint-disable-next-line react-native/no-inline-styles
                                            { textDecorationLine: 'underline' },
                                        ]}>
                                            {Localize.t('payloadRiskWarning.ifSomeoneThenScam')}
                                        </Text>
                                        <Text style={[
                                            AppStyles.marginTopSml,
                                            AppStyles.subtext,
                                            AppStyles.bold,
                                            AppStyles.colorRed,
                                        ]}>
                                            {Localize.t('payloadRiskWarning.onlyProceedIf')}
                                        </Text>
                                    </InfoMessage>
                                )}
                            </View>
                        </View>
                    )}
                    { !mustStillWarn && (
                        <>
                            {/* App info */}
                            <AppInfo source={source} transaction={transaction} payload={payload} />

                            {/* transaction info content */}
                            <View style={styles.shadow}>
                                <View style={styles.shadow}>
                                    {/* Need more for Android shadow */}
                                    <View style={styles.transactionContent}>
                                        {riskMustWarnUser && (
                                            <View style={[
                                                AppStyles.paddingHorizontalSml,
                                                AppStyles.marginBottomSml,
                                            ]}>
                                                <InfoMessage
                                                    type="error"
                                                >
                                                    <Text style={[
                                                        AppStyles.subtext,
                                                        AppStyles.colorRed,
                                                    ]}>
                                                        {Localize.t('payloadRiskWarning.postAcceptedHeader')}
                                                    </Text>
                                                    <Text style={[
                                                        AppStyles.marginTopSml,
                                                        AppStyles.subtext,
                                                        AppStyles.bold,
                                                        AppStyles.colorRed,
                                                        // eslint-disable-next-line react-native/no-inline-styles
                                                        {textDecorationLine: 'underline'},
                                                    ]}>
                                                        {Localize.t('payloadRiskWarning.ifSomeoneThenScam')}
                                                    </Text>
                                                    <Text style={[
                                                        AppStyles.marginTopSml,
                                                        AppStyles.subtext,
                                                        AppStyles.bold,
                                                        AppStyles.colorRed,
                                                    ]}>
                                                        {Localize.t('payloadRiskWarning.onlyProceedIf')}
                                                    </Text>
                                                </InfoMessage>
                                            </View>
                                        )}
                                        <View style={AppStyles.paddingHorizontalSml}>
                                            <SignerLabel payload={payload} />
                                            <View style={styles.accountPickerPadding}>
                                                <AccountPicker
                                                    onSelect={setSource}
                                                    accounts={accounts}
                                                    selectedItem={source}
                                                />
                                            </View>
                                        </View>

                                        {/* in multi-sign transactions and in some cases in Import transaction */}
                                        {/* the Account can be different than the signing account */}
                                        <SignForAccount transaction={transaction} source={source} />

                                        {
                                            transaction.InstanceType === InstanceTypes.GenuineTransaction &&
                                            coreSettings?.developerMode && (
                                            <View style={styles.jsonContainer}>
                                                <Text style={styles.label}>Transaction JSON (Developer mode)</Text>
                                                <JsonTree noDefaultCollapse={
                                                        transaction?.JsonForSigning?.TransactionType === 'Batch'
                                                            ? 0
                                                            : 2
                                                    } data={transaction.JsonForSigning} />
                                            </View>
                                        )}

                                        {/* transaction details */}
                                        <View style={styles.detailsContainer}>{this.renderDetails()}</View>

                                        {/* accept button */}
                                        {(canSendFee || isScamCounterpart) && (
                                            <View style={styles.acceptButtonContainer}>
                                                {isScamCounterpart && (
                                                    <>
                                                        <View testID="scam-danger-warning">
                                                            <InfoMessage type="error">
                                                                <Text style={[
                                                                    AppStyles.subtext,
                                                                    AppStyles.bold,
                                                                    AppStyles.colorRed,
                                                                ]}>
                                                                    {Localize.t('payload.scamSignDanger')}
                                                                </Text>
                                                                <Text style={[
                                                                    AppStyles.marginTopSml,
                                                                    AppStyles.subtext,
                                                                    AppStyles.colorRed,
                                                                ]}>
                                                                    {cancelCraft
                                                                        ? Localize.t('payload.scamPreferCancel')
                                                                        : Localize.t('payload.scamDoNotAccept')}
                                                                </Text>
                                                            </InfoMessage>
                                                        </View>
                                                        <Spacer size={15} />
                                                    </>
                                                )}
                                                {canSendFee && isScamCounterpart && cancelCraft && (
                                                    <>
                                                        <Button
                                                            testID="scam-cancel-object-button"
                                                            label={Localize.t(`events.${cancelCraft.labelKey}`)}
                                                            onPress={this.onScamCancelPress}
                                                        />
                                                        <Spacer size={15} />
                                                    </>
                                                )}
                                                {canSendFee && (
                                                    <SwipeButton
                                                        testID="accept-button"
                                                        color={this.getSwipeButtonColor()}
                                                        isLoading={isLoading}
                                                        isDisabled={!isReady}
                                                        onSwipeSuccess={
                                                            isScamCounterpart ? this.onScamAcceptSwipe : onAccept
                                                        }
                                                        label={Localize.t('global.slideToAccept')}
                                                        accessibilityLabel={Localize.t('global.accept')}
                                                        onPanResponderGrant={this.toggleCannotScroll}
                                                        onPanResponderRelease={this.toggleCanScroll}
                                                        shouldResetAfterSuccess
                                                    />
                                                )}
                                            </View>
                                        )}
                                    </View>
                                </View>
                            </View>
                        </>
                    )}
                </KeyboardAwareScrollView>
            </ImageBackground>
        );
    }
}

/* Export Component ==================================================================== */
export default ReviewStep;
