/**
 * Vault / Passcode/Biometric Method
 */

import React, { Component } from 'react';
import {
    Alert, View, Text, Animated, LayoutAnimation, KeyboardEvent, InteractionManager,
} from 'react-native';

import { SecurePinInput, Button } from '@components/General';

import StyleService from '@services/StyleService';

import { AuthenticationService } from '@services';

import { Prompt } from '@common/helpers/interface';
import Keyboard from '@common/helpers/keyboard';
import { AdaptiveOverlayKeyboard } from '@common/helpers/adaptiveOverlayKeyboard';
import { AndroidWindowSurroundContext, AndroidWindowSurround } from '@common/helpers/androidWindowContext';
import AndroidPaneCard from '@components/General/AndroidPaneCard/AndroidPaneCard';
import { AndroidPinEntrySlot } from '@components/General/SecurePinInput/AndroidPinEntry';

import { BiometricErrors } from '@common/libs/biometric';

// import { BiometryType } from '@store/types';

import Localize from '@locale';

// style
import { AppStyles, AppSizes } from '@theme';
import styles from './styles';

import { MethodsContext } from '../../Context';
import { AuthMethods } from '../../types';
/* types ==================================================================== */
export interface Props {}

interface InternalProps extends Props {
    androidWindowSurround?: AndroidWindowSurround;
}

export interface State {
    isBiometricAvailable: boolean;
    fullBiometricsView: boolean;
    // biometricMethod: BiometryType;
    hapticFeedback: boolean;
    offsetBottom: number;
}
/* Component ==================================================================== */
class PasscodeMethod extends Component<InternalProps, State> {
    static contextType = MethodsContext;
    declare context: React.ContextType<typeof MethodsContext>;

    private containerViewRef = React.createRef<View>();
    private contentViewRef: React.RefObject<View>;
    private animatedColor: Animated.Value;
    private securePinInputRef: React.RefObject<SecurePinInput>;

    private mounted = false;
    private adaptiveOffset = 0;
    private adaptiveKeyboard = new AdaptiveOverlayKeyboard({
        getContext: () => {
            const { androidWindowSurround } = this.props;
            return androidWindowSurround;
        },
        getInput: () => this.contentViewRef.current,
        getRestingBottom: (height, scale) => this.measureRestingBottom(height, scale),
        // Store actual displacement: legacy centered margin moves only half.
        getOffset: () => this.adaptiveOffset,
        setOffset: (offset, isCurrent) => {
            if (!this.mounted || !isCurrent()) return;
            this.adaptiveOffset = offset;
            LayoutAnimation.easeInEaseOut();
            // Centered marginBottom shifts by half; keep its original units.
            this.setState({ offsetBottom: offset * 2 });
        },
    });

    constructor(props: InternalProps, context: React.ContextType<typeof MethodsContext>) {
        super(props);

        const { coreSettings } = context;

        this.state = {
            isBiometricAvailable: false,
            fullBiometricsView: true,
            hapticFeedback: coreSettings.hapticFeedback,
            // biometricMethod: coreSettings.biometricMethod,
            offsetBottom: 0,
        };

        this.animatedColor = new Animated.Value(0);
        this.securePinInputRef = React.createRef();
        this.contentViewRef = React.createRef();
    }

    private measureRestingBottom = (cardHeight: number, scale: number): Promise<number | undefined> => (
        new Promise((resolve) => {
            const container = this.containerViewRef.current;
            if (!container) { resolve(undefined); return; }
            container.measureInWindow((x, y, width, height) => {
                if (!this.mounted || ![y, height].every(Number.isFinite) || height <= 0) {
                    resolve(undefined);
                    return;
                }
                // The parent stays centered and unshifted during LayoutAnimation.
                resolve(y + (height + cardHeight) * scale / 2);
            });
        })
    );

    componentDidMount() {
        // track component mounted status
        this.mounted = true;
        this.adaptiveKeyboard.mount();

        // add listeners
        Keyboard.addListener('keyboardWillShow', this.onKeyboardShow);
        Keyboard.addListener('keyboardWillHide', this.onKeyboardHide);

        Animated.timing(this.animatedColor, {
            toValue: 150,
            duration: 350,
            useNativeDriver: false,
        }).start();

        InteractionManager.runAfterInteractions(() => {
            this.setBiometricStatus().then(() => { 
                this.startAuthentication(true);
            });
        });
    }

    componentDidUpdate() {
        this.adaptiveKeyboard.contextChanged();
    }

    componentWillUnmount() {
        // track component mounted status
        this.mounted = false;
        this.adaptiveKeyboard.unmount();

        // remove listeners
        Keyboard.removeListener('keyboardWillShow', this.onKeyboardShow);
        Keyboard.removeListener('keyboardWillHide', this.onKeyboardHide);
    }

    onKeyboardShow = (e: KeyboardEvent) => {
        if (this.adaptiveKeyboard.show((isCurrent) => this.onLegacyKeyboardShow(e, isCurrent))) return;
        this.onLegacyKeyboardShow(e);
    };

    private onLegacyKeyboardShow = (e: KeyboardEvent, isCurrent?: () => boolean) => {
        if (this.contentViewRef.current && this.mounted) {
            this.contentViewRef.current.measure((x, y, width, height) => {
                if (isCurrent && !isCurrent()) return;
                const bottomView = (AppSizes.screen.height - height) / 2;
                const KeyboardHeight = e.endCoordinates.height + 100;

                if (bottomView < KeyboardHeight) {
                    this.adaptiveOffset = (KeyboardHeight - bottomView) / 2;
                    LayoutAnimation.easeInEaseOut();
                    this.setState({ offsetBottom: KeyboardHeight - bottomView });
                }
            });
        }
    };

    onKeyboardHide = () => {
        if (this.adaptiveKeyboard.hide()) return;
        this.onLegacyKeyboardHide();
    };

    private onLegacyKeyboardHide = () => {
        if (this.mounted) {
            this.adaptiveOffset = 0;
            LayoutAnimation.easeInEaseOut();
            this.setState({ offsetBottom: 0 });
        }
    };

    setBiometricStatus = () => {
        const { fullBiometricsView } = this.state;

        return new Promise((resolve) => {
            AuthenticationService.isBiometricAvailable().then((status) => {
                this.setState(
                    {
                        isBiometricAvailable: status,
                        fullBiometricsView: fullBiometricsView && status,
                    },
                    () => resolve(null),
                );
            });
        });
    };

    startAuthentication = (delay = false) => {
        const { isBiometricAvailable } = this.state;

        if (isBiometricAvailable) {
            if (delay) {
                setTimeout(() => {
                    this.requestBiometricAuthenticate(true);
                }, 100);
            } else {
                this.requestBiometricAuthenticate(true);
            }
        } else if (this.securePinInputRef.current) {
            // focus the input
            this.securePinInputRef.current.focus();
        }
    };

    onSuccessBiometricAuthenticate = () => {
        const { coreSettings, sign } = this.context;
        const { passcode } = coreSettings;

        sign(AuthMethods.BIOMETRIC, { encryptionKey: passcode });
    };

    onSuccessPasscodeAuthenticate = (hashedPasscode: string) => {
        const { sign } = this.context;

        sign(AuthMethods.PIN, { encryptionKey: hashedPasscode });
    };

    requestBiometricAuthenticate = (system?: boolean) => {
        AuthenticationService.authenticateBiometrics(Localize.t('global.signingTheTransaction'))
            .then(this.onSuccessBiometricAuthenticate)
            .catch((error: any) => {
                this.setState({ fullBiometricsView: false });

                let errorMessage;
                // biometric's has been changed
                if (error.name === BiometricErrors.ERROR_BIOMETRIC_HAS_BEEN_CHANGED) {
                    errorMessage = Localize.t('global.biometricChangeError');
                    // disable biometrics and start authentication again
                    this.setState(
                        { isBiometricAvailable: false },
                        this.startAuthentication,
                    );
                } else if (error.name !== BiometricErrors.ERROR_USER_CANCEL) {
                    errorMessage = Localize.t('global.invalidBiometryAuth');
                }

                if (errorMessage && !system) {
                    Prompt(Localize.t('global.error'), errorMessage);
                }
            });
    };

    onPasscodeEntered = (passcode: string) => {
        const { onInvalidAuth } = this.context;

        AuthenticationService.authenticatePasscode(passcode)
            .then(this.onSuccessPasscodeAuthenticate)
            .catch((e) => {
                if (this.securePinInputRef.current) {
                    this.securePinInputRef.current.clearInput();
                }
                if (e?.message === Localize.t('global.invalidPasscode')) {
                    onInvalidAuth(AuthMethods.PIN, () => {
                        this.securePinInputRef?.current?.focus();
                    });
                } else {
                    Alert.alert(Localize.t('global.error'), e.message);
                }
            });
    };

    private dismiss = () => {
        this.adaptiveKeyboard.cancel();
        const { dismiss } = this.context;
        dismiss();
    };

    render() {
        const { isSigning } = this.context;
        const { offsetBottom, hapticFeedback, isBiometricAvailable, fullBiometricsView } = this.state;
        const { androidWindowSurround } = this.props;
        const fullPane = androidWindowSurround?.fullPane === true;
        // biometricMethod,

        const interpolateColor = this.animatedColor.interpolate({
            inputRange: [0, 150],
            outputRange: StyleService.getBackdropInterpolateColor(),
        });

        const needsToShowPinPad = !fullBiometricsView || !isBiometricAvailable;

        return needsToShowPinPad && (
            <Animated.View
                ref={this.containerViewRef}
                onStartShouldSetResponder={() => true}
                style={[styles.container, { backgroundColor: interpolateColor },
                    ...(fullPane ? [{ marginTop: androidWindowSurround?.topInset ?? 0 }] : [])]}
            >
                <AndroidPaneCard ref={this.contentViewRef} {...{ onFocus: this.adaptiveKeyboard.focus }}
                    style={[styles.visibleContent, { marginBottom: offsetBottom },
                        ...(fullPane ? [{ padding: 8 }] : [])]}>
                    <View style={[AppStyles.row, AppStyles.centerAligned]}>
                        <View style={[AppStyles.flex1, AppStyles.paddingLeftSml, AppStyles.paddingRightSml]}>
                            <Text numberOfLines={1} style={[AppStyles.p, AppStyles.bold]}>
                                {Localize.t('global.signing')}
                            </Text>
                        </View>
                        <View style={[AppStyles.row, AppStyles.flex1, AppStyles.flexEnd]}>
                            <Button
                                light
                                numberOfLines={1}
                                label={Localize.t('global.cancel')}
                                roundedSmall
                                onPress={this.dismiss}
                            />
                        </View>
                    </View>
                    <View style={[AppStyles.row, AppStyles.paddingTopSml]}>
                        <View style={[AppStyles.container, AppStyles.centerContent]}>
                            <Text
                                style={[
                                    AppStyles.subtext,
                                    AppStyles.bold,
                                    AppStyles.textCenterAligned,
                                    AppStyles.paddingTopSml,
                                ]}
                            >
                                {Localize.t('global.pleaseEnterYourPasscode')}
                            </Text>

                            <AndroidPinEntrySlot>{(paneLayout) => <SecurePinInput
                                ref={this.securePinInputRef}
                                isLoading={isSigning}
                                length={6}
                                virtualKeyboard
                                enableHapticFeedback={hapticFeedback}
                                onInputFinish={this.onPasscodeEntered}
                                supportBiometric={isBiometricAvailable}
                                onBiometryPress={this.requestBiometricAuthenticate}
                                pinPadStyle={styles.pinInputPadding}
                                paneLayout={paneLayout}
                            />}</AndroidPinEntrySlot>

                            {/* {isBiometricAvailable && (
                                <View style={AppStyles.paddingTopSml}>
                                    <Button
                                        label={`${biometricMethod}`}
                                        icon="IconFingerprint"
                                        roundedSmall
                                        secondary
                                        isDisabled={isSigning}
                                        onPress={this.requestBiometricAuthenticate}
                                    />
                                </View>
                            )} */}
                        </View>
                    </View>
                </AndroidPaneCard>
            </Animated.View>
        );
    }
}

/* Export Component ==================================================================== */
const PasscodeMethodWithAndroidWindow = React.forwardRef<PasscodeMethod, Props>((props, ref) => (
    <AndroidWindowSurroundContext.Consumer>
        {(androidWindowSurround) => (
            // eslint-disable-next-line react/jsx-props-no-spreading
            <PasscodeMethod {...props} ref={ref} androidWindowSurround={androidWindowSurround} />
        )}
    </AndroidWindowSurroundContext.Consumer>
));
PasscodeMethodWithAndroidWindow.displayName = 'PasscodeMethod';

export default PasscodeMethodWithAndroidWindow;
