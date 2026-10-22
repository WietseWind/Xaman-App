/**
 * Import Account/secretType Step
 */

import React, { Component } from 'react';
import { SafeAreaView, View, Text, ScrollView } from 'react-native';

import RNTangemSdk from 'tangem-sdk-react-native';

import { Button, RadioButton, Footer } from '@components/General';

import Localize from '@locale';

// style
import { AppStyles } from '@theme';
// import styles from './styles';

import { StepsContext } from '../../Context';
import { SecretTypes } from '../../types';

/* types ==================================================================== */
export interface Props {}

export interface State {
    nfcSupported: boolean;
}

/* Component ==================================================================== */
class SecretTypeStep extends Component<Props, State> {
    static contextType = StepsContext;
    declare context: React.ContextType<typeof StepsContext>;

    constructor(props: Props) {
        super(props);

        this.state = {
            nfcSupported: false,
        };
    }

    componentDidMount() {
        RNTangemSdk.getNFCStatus()
            .then(({ support }) => {
                const { nfcSupported } = this.state;
                if (nfcSupported === support) {
                    return;
                }
                this.setState({ nfcSupported: support });
            })
            .catch(() => {
                // Tangem is unavailable on this device.
            });
    }

    onRadioButtonPress = (type: SecretTypes) => {
        const { setSecretType } = this.context;

        setSecretType(type);
    };

    goNext = () => {
        const { goNext, secretType, beginTangemUpgrade } = this.context;

        switch (secretType) {
            case SecretTypes.SecretNumbers:
                goNext('EnterSecretNumbers');
                break;
            case SecretTypes.FamilySeed:
                goNext('EnterSeed');
                break;
            case SecretTypes.Mnemonic:
                goNext('MnemonicAlert');
                break;
            case SecretTypes.Tangem:
                beginTangemUpgrade();
                break;
            default:
                break;
        }
    };
    render() {
        const { goBack, secretType, upgradeAccount } = this.context;
        const { nfcSupported } = this.state;

        return (
            <SafeAreaView testID="account-import-secret-type-view" style={AppStyles.contentContainer}>
                <Text style={[AppStyles.p, AppStyles.bold, AppStyles.textCenterAligned, AppStyles.paddingHorizontal]}>
                    {Localize.t('account.pleaseSelectAccountSecretType')}
                </Text>

                <ScrollView
                    style={AppStyles.flex1}
                    contentContainerStyle={[AppStyles.centerContent, AppStyles.paddingSml]}
                >
                    <RadioButton
                        testID="secret-numbers-radio-button"
                        onPress={this.onRadioButtonPress}
                        label={Localize.t('account.secretNumbers')}
                        value={SecretTypes.SecretNumbers}
                        description={Localize.t('account.secretNumbersDesc')}
                        checked={secretType === SecretTypes.SecretNumbers}
                    />

                    <RadioButton
                        testID="family-seed-radio-button"
                        onPress={this.onRadioButtonPress}
                        label={Localize.t('account.familySeed')}
                        value={SecretTypes.FamilySeed}
                        description={Localize.t('account.familySeedDesc')}
                        checked={secretType === SecretTypes.FamilySeed}
                    />

                    <RadioButton
                        testID="mnemonic-radio-button"
                        onPress={this.onRadioButtonPress}
                        value={SecretTypes.Mnemonic}
                        label={Localize.t('account.mnemonic')}
                        description={Localize.t('account.mnemonicDesc')}
                        checked={secretType === SecretTypes.Mnemonic}
                    />
                    {!!upgradeAccount && nfcSupported && (
                        <RadioButton
                            testID="tangem-radio-button"
                            onPress={this.onRadioButtonPress}
                            value={SecretTypes.Tangem}
                            label={Localize.t('account.tangemCard')}
                            description={Localize.t('account.tangemCardBelongsToAccount')}
                            icon="IconTangem"
                            iconStyle={AppStyles.imgColorContrast}
                            checked={secretType === SecretTypes.Tangem}
                        />
                    )}
                </ScrollView>

                <Footer style={[AppStyles.row, AppStyles.centerAligned]}>
                    <View style={[AppStyles.flex3, AppStyles.paddingRightSml]}>
                        <Button
                            testID="back-button"
                            light
                            label={Localize.t('global.back')}
                            icon="IconChevronLeft"
                            onPress={goBack}
                        />
                    </View>
                    <View style={AppStyles.flex5}>
                        <Button
                            testID="next-button"
                            textStyle={AppStyles.strong}
                            label={Localize.t('global.next')}
                            onPress={this.goNext}
                        />
                    </View>
                </Footer>
            </SafeAreaView>
        );
    }
}

/* Export Component ==================================================================== */
export default SecretTypeStep;
