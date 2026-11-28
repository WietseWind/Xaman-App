/**
 * Vault / Passphrase Method
 */

import React, { Component } from 'react';
import { View, Text, Animated, LayoutAnimation, InteractionManager, KeyboardEvent, Platform } from 'react-native';

import Keyboard from '@common/helpers/keyboard';
import { AdaptiveOverlayKeyboard } from '@common/helpers/adaptiveOverlayKeyboard';
import { AndroidWindowSurroundContext, AndroidWindowSurround } from '@common/helpers/androidWindowContext';

import { PasswordInput, Button, Spacer } from '@components/General';
import AndroidPaneCard from '@components/General/AndroidPaneCard/AndroidPaneCard';

import StyleService from '@services/StyleService';

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
    passphrase?: string;
    offsetBottom: number;
}

/* Component ==================================================================== */
class PassphraseMethod extends Component<InternalProps, State> {
    static contextType = MethodsContext;
    declare context: React.ContextType<typeof MethodsContext>;

    private containerViewRef = React.createRef<View>();
    private contentViewRef: React.RefObject<View>;
    private passwordInputRef: React.RefObject<PasswordInput>;
    private animatedColor: Animated.Value;

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

    constructor(props: InternalProps) {
        super(props);

        this.state = {
            passphrase: undefined,
            offsetBottom: 0,
        };

        this.animatedColor = new Animated.Value(0);
        this.contentViewRef = React.createRef();
        this.passwordInputRef = React.createRef();
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

        InteractionManager.runAfterInteractions(this.startAuthentication);
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

    startAuthentication = () => {
        // focus the input
        if (this.passwordInputRef.current) {
            this.passwordInputRef.current.focus();
        }
    };

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

    onPassphraseChange = (passphrase: string) => {
        this.setState({ passphrase });
    };

    onSignPress = () => {
        const { sign } = this.context;
        const { passphrase } = this.state;

        // blur the input if android
        if (Platform.OS === 'android' && this.passwordInputRef.current) {
            this.passwordInputRef.current.blur();
        }

        setTimeout(() => {
            sign(AuthMethods.PASSPHRASE, { encryptionKey: passphrase });
        }, 100);
    };

    private dismiss = () => {
        this.adaptiveKeyboard.cancel();
        const { dismiss } = this.context;
        dismiss();
    };

    render() {
        const { preferredSigner, isSigning } = this.context;
        const { offsetBottom, passphrase } = this.state;

        if (!preferredSigner) {
            return null;
        }

        const interpolateColor = this.animatedColor.interpolate({
            inputRange: [0, 150],
            outputRange: StyleService.getBackdropInterpolateColor(),
        });

        return (
            <Animated.View
                ref={this.containerViewRef}
                onStartShouldSetResponder={() => true}
                style={[styles.container, { backgroundColor: interpolateColor }]}
            >
                <AndroidPaneCard ref={this.contentViewRef} {...{ onFocus: this.adaptiveKeyboard.focus }}
                    style={[styles.visibleContent, { marginBottom: offsetBottom }]}>
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
                                {Localize.t('account.PleaseEnterYourPasswordForAccount')}
                                <Text style={AppStyles.colorBlue}> &#34;{preferredSigner.label}&#34;</Text>
                            </Text>

                            <Spacer size={40} />

                            <PasswordInput
                                testID="passphrase-input"
                                ref={this.passwordInputRef}
                                placeholder={Localize.t('account.enterPassword')}
                                editable={!isSigning}
                                onChange={this.onPassphraseChange}
                                autoFocus
                            />

                            <Spacer size={40} />

                            <Button
                                testID="sign-button"
                                isDisabled={!passphrase}
                                isLoading={isSigning}
                                label={Localize.t('global.sign')}
                                onPress={this.onSignPress}
                            />
                        </View>
                    </View>
                </AndroidPaneCard>
            </Animated.View>
        );
    }
}

/* Export Component ==================================================================== */
const PassphraseMethodWithAndroidWindow = React.forwardRef<PassphraseMethod, Props>((props, ref) => (
    <AndroidWindowSurroundContext.Consumer>
        {(androidWindowSurround) => (
            // eslint-disable-next-line react/jsx-props-no-spreading
            <PassphraseMethod {...props} ref={ref} androidWindowSurround={androidWindowSurround} />
        )}
    </AndroidWindowSurroundContext.Consumer>
));
PassphraseMethodWithAndroidWindow.displayName = 'PassphraseMethod';

export default PassphraseMethodWithAndroidWindow;
