/**
 * Change Passcode Screen
 */

import React, { Component } from 'react';
import { View, Text, Alert, InteractionManager } from 'react-native';

import { CoreRepository } from '@store/repositories';

import { CoreModel } from '@store/models';

import { changePasscode } from '@common/libs/passcodeChange';
import { Navigator } from '@common/helpers/navigator';
import { Prompt, Toast } from '@common/helpers/interface';

import { AuthenticationService } from '@services';

import { AppScreens } from '@common/constants';

import { Header, SecurePinInput } from '@components/General';
import { isStrong } from '@components/General/PinInput/PinInput';

import Localize from '@locale';

// style
import { AppStyles } from '@theme';
import styles from './styles';
import { CriticalProcessingOverlayProps } from '@screens/Overlay/CriticalProcessing';

/* types ==================================================================== */
enum Steps {
    ENTER_OLD_PASSCODE = 'ENTER_OLD_PASSCODE',
    ENTER_NEW_PASSCODE = 'ENTER_NEW_PASSCODE',
    CONFIRM_NEW_PASSCODE = 'CONFIRM_NEW_PASSCODE',
}

export interface Props {}

export interface State {
    coreSettings: CoreModel;
    newPasscode: string;
    currentStep: Steps;
    stepDescription: string;
}
/* Component ==================================================================== */
class ChangePasscodeView extends Component<Props, State> {
    static screenName = AppScreens.Settings.ChangePasscode;
    private readonly pinInput: React.RefObject<SecurePinInput>;

    static options() {
        return {
            bottomTabs: { visible: false },
        };
    }

    constructor(props: Props) {
        super(props);

        this.state = {
            coreSettings: CoreRepository.getSettings(),
            newPasscode: '',
            currentStep: Steps.ENTER_OLD_PASSCODE,
            stepDescription: Localize.t('settings.enterOldPasscode'),
        };

        this.pinInput = React.createRef();
    }

    componentDidMount() {
        InteractionManager.runAfterInteractions(this.focusPinInput);
    }

    cleanPinInput = () => {
        requestAnimationFrame(() => {
            if (this.pinInput.current) {
                this.pinInput.current?.setState({
                    digits: '',
                });
            }
        });
    };

    focusPinInput = () => {
        requestAnimationFrame(() => {
            if (this.pinInput.current) {
                this.pinInput.current.focus();
            }
        });
    };

    changeStep = (step: Steps) => {
        let stepDescription;
        switch (step) {
            case Steps.ENTER_OLD_PASSCODE:
                stepDescription = Localize.t('settings.enterOldPasscode');
                break;
            case Steps.ENTER_NEW_PASSCODE:
                stepDescription = Localize.t('settings.enterNewPasscode');
                break;
            case Steps.CONFIRM_NEW_PASSCODE:
                stepDescription = Localize.t('settings.enterNewPasscodeAgain');
                break;
            default:
                break;
        }

        this.setState(
            {
                currentStep: step,
                stepDescription,
            },
            () => {
                this.cleanPinInput();
                this.focusPinInput();
            },
        );
    };

    onChangePasscodeSuccess = async () => {
        // everything went well
        await Navigator.pop();

        Toast(Localize.t('settings.passcodeChangedSuccess'));
    };

    onChangePasscodeError = () => {
        Alert.alert(Localize.t('global.error'), Localize.t('global.unexpectedErrorOccurred'));
    };

    processChangePasscode = async (): Promise<void> => {
        const { newPasscode } = this.state;
        await changePasscode(newPasscode);
    };

    changePasscode = async () => {
        Navigator.showOverlay<CriticalProcessingOverlayProps>(AppScreens.Overlay.CriticalProcessing, {
            title: Localize.t('global.encrypting'),
            task: this.processChangePasscode,
            onSuccess: this.onChangePasscodeSuccess,
            onError: this.onChangePasscodeError,
        });
    };

    checkOldPasscode = (oldPasscode: string) => {
        AuthenticationService.authenticatePasscode(oldPasscode)
            .then(() => {
                this.changeStep(Steps.ENTER_NEW_PASSCODE);
            })
            .catch((e) => {
                this.cleanPinInput();
                Alert.alert(Localize.t('global.error'), e.toString(), [{ text: 'OK', onPress: this.focusPinInput }], {
                    cancelable: false,
                });
            });
    };

    checkNewPasscode = (newPasscode: string) => {
        if (isStrong(newPasscode)) {
            this.setState({
                newPasscode,
            });
            this.changeStep(Steps.CONFIRM_NEW_PASSCODE);
        } else {
            Prompt(
                Localize.t('setupPasscode.weakPasscode'),
                Localize.t('setupPasscode.weakPasscodeDescription'),
                [
                    {
                        text: Localize.t('setupPasscode.useAnyway'),
                        onPress: () => {
                            this.setState({
                                newPasscode,
                            });
                            this.changeStep(Steps.CONFIRM_NEW_PASSCODE);
                        },
                        style: 'destructive',
                    },
                    {
                        text: Localize.t('setupPasscode.changePasscode'),
                        onPress: () => {
                            this.cleanPinInput();
                            this.focusPinInput();
                        },
                    },
                ],
                { type: 'default' },
            );
        }
    };

    checkConfirmPasscode = async (newPasscodeConfirm: string) => {
        const { newPasscode } = this.state;

        if (newPasscode !== newPasscodeConfirm) {
            this.changeStep(Steps.ENTER_NEW_PASSCODE);
            Alert.alert(
                Localize.t('global.error'),
                Localize.t('settings.newOldPasscodeNotMatch'),
                [{ text: 'OK', onPress: this.focusPinInput }],
                { cancelable: false },
            );
            return;
        }

        // change passcode if everything looks good
        await this.changePasscode();
    };

    onPasscodeEntered = (passcode: string) => {
        const { currentStep } = this.state;

        switch (currentStep) {
            case Steps.ENTER_OLD_PASSCODE:
                this.checkOldPasscode(passcode);
                break;
            case Steps.ENTER_NEW_PASSCODE:
                this.checkNewPasscode(passcode);
                break;
            case Steps.CONFIRM_NEW_PASSCODE:
                this.checkConfirmPasscode(passcode);
                break;
            default:
                break;
        }
    };

    render() {
        const { stepDescription, coreSettings } = this.state;

        return (
            <View testID="change-passcode-screen" style={styles.container}>
                <Header
                    leftComponent={{
                        icon: 'IconChevronLeft',
                        onPress: Navigator.pop,
                    }}
                    centerComponent={{ text: Localize.t('settings.changePasscode') }}
                />

                <View style={[AppStyles.flex1, AppStyles.flexStart, AppStyles.paddingTop]}>
                    <Text style={[AppStyles.p, AppStyles.textCenterAligned]}>{stepDescription}</Text>
                </View>
                <View style={[AppStyles.flex8, AppStyles.paddingSml, AppStyles.centerAligned]}>
                    <SecurePinInput
                        ref={this.pinInput}
                        virtualKeyboard
                        onInputFinish={this.onPasscodeEntered}
                        supportBiometric={false}
                        enableHapticFeedback={coreSettings.hapticFeedback}
                        length={6}
                    />
                    {/* <PinInput
                        ref={this.pinInput}
                        autoFocus={false}
                        codeLength={6}
                        checkStrength={currentStep === Steps.ENTER_NEW_PASSCODE}
                        onFinish={this.onPasscodeEntered}
                    /> */}
                </View>
            </View>
        );
    }
}

/* Export Component ==================================================================== */
export default ChangePasscodeView;
