/**
 * SecurePinInput
 *
    <SecurePinInput />
 *
 */
import { noAutofillProps } from '../TextInput/noAutofill';

import React, { Component } from 'react';
import {
    View,
    Text,
    TouchableHighlight,
    TouchableWithoutFeedback,
    TextInput,
    Platform,
    NativeSyntheticEvent,
    TextInputKeyPressEventData,
    ViewStyle,
    AccessibilityInfo,
} from 'react-native';

import StyleService from '@services/StyleService';

import { VibrateHapticFeedback } from '@common/helpers/interface';
import { AndroidWindowSurroundContext } from '@common/helpers/androidWindowContext';

import Localize from '@locale';

import { Icon } from '@components/General/Icon';
import { LoadingIndicator } from '@components/General/LoadingIndicator';
import { SensitiveAccessibilityView } from '@components/General/SensitiveAccessibilityView';

import styles from './styles';
import { AppStyles } from '@theme/index';
import { AndroidPinPaneLayout, ANDROID_PIN_MIN_HEIGHT } from './AndroidPinEntry';

/* Types ==================================================================== */
interface Props {
    virtualKeyboard: boolean;
    supportBiometric: boolean;
    condensed?: boolean;
    length: number;
    clearOnFinish: boolean;
    enableHapticFeedback?: boolean;
    isLoading?: boolean;
    pinPadStyle?: ViewStyle | ViewStyle[];
    /** Actual caller allocation, used only by an Android multi-window pane. */
    paneLayout?: AndroidPinPaneLayout;
    // what screen readers call the digits field; the passcode unless set
    accessibilityLabel?: string;
    accessibilityHint?: string;
    onInputFinish: (pin: string) => void;
    onBiometryPress: () => void;
}

// VoiceOver treats keyboard keys as keys (typing modes); TalkBack only knows it for input method windows
const KEY_ROLE = Platform.OS === 'ios' ? 'keyboardkey' : 'button';

interface State {
    digits: string;
}

const BUTTONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Y', '0', 'X'];
const PANE_CONTAINER = { width: '100%' as const };
const PANE_DIGITS = { height: 32 };
const PANE_KEYBOARD = { width: '100%' as const, marginTop: 8, paddingHorizontal: 0 };
const PANE_NUMBER = { fontSize: 24, lineHeight: 28 };
const PANE_ALPHA = { fontSize: 9, lineHeight: 10 };
const PANE_DELETE_ICON = { marginTop: 0 };
/* Component ==================================================================== */
class SecurePinInput extends Component<Props, State> {
    static contextType = AndroidWindowSurroundContext;

    declare context: React.ContextType<typeof AndroidWindowSurroundContext>;

    private inputRef: React.RefObject<TextInput>;
    private clearInputTimeout: NodeJS.Timeout | undefined;
    private lastKeyEventTimestamp: number;

    static defaultProps: Partial<Props> = {
        virtualKeyboard: false,
        supportBiometric: true,
        length: 6,
        clearOnFinish: false,
        enableHapticFeedback: true,
        onBiometryPress: () => {},
    };

    constructor(props: Props) {
        super(props);

        this.state = {
            digits: '',
        };

        this.lastKeyEventTimestamp = 0;

        this.inputRef = React.createRef();
    }

    componentWillUnmount() {
        if (this.clearInputTimeout) clearTimeout(this.clearInputTimeout);
    }

    public focus = () => {
        const { virtualKeyboard } = this.props;
        if (!virtualKeyboard) {
            // blur first
            if (this.inputRef.current) {
                this.inputRef.current.blur();
            }

            setTimeout(() => {
                if (this.inputRef.current) {
                    this.inputRef.current.focus();
                }
            }, 100);
        }
    };

    public blur = () => {
        const { virtualKeyboard } = this.props;
        if (!virtualKeyboard) {
            setTimeout(() => {
                if (this.inputRef.current) {
                    this.inputRef.current.blur();
                }
            }, 100);
        }
    };

    onFinish = (digits: string) => {
        const { clearOnFinish, onInputFinish } = this.props;

        // blur the input
        this.blur();

        // callback
        if (onInputFinish) {
            onInputFinish(digits);
        }

        // clear the input if necessary
        if (clearOnFinish) {
            this.clearInputTimeout = setTimeout(() => this.clearInput(), 1000);
        }
    };

    // screen readers: say how many digits are entered, never which
    announceProgress = (count: number) => {
        const { length } = this.props;

        AccessibilityInfo.announceForAccessibility(Localize.t('global.passcodeDigitsEntered', { count, length }));
    };

    onInput = (key: string) => {
        const { enableHapticFeedback, length } = this.props;
        const { digits } = this.state;

        if (enableHapticFeedback) {
            VibrateHapticFeedback('impactLight');
        }

        // BackSpace
        if (key === 'Backspace') {
            const remaining = digits.slice(0, -1);
            this.setState({
                digits: remaining,
            });
            this.announceProgress(remaining.length);
            return;
        }

        const newDigits = `${digits}${key}`;

        // not finished yet
        if (newDigits.length <= length) {
            this.setState({
                digits: newDigits,
            });
        }

        // the last digit submits: the screen announces the result instead
        if (newDigits.length < length) {
            this.announceProgress(newDigits.length);
        }

        // User filling the last pin ?
        if (newDigits.length === length) {
            this.onFinish(newDigits);
        }
    };

    onKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
        // debounce
        if (Math.abs(this.lastKeyEventTimestamp - event.timeStamp) < 20) {
            return;
        }

        this.lastKeyEventTimestamp = event.timeStamp;

        // filter keys
        if (!event.nativeEvent.key.match(/^([0-9]+|Backspace)$/i)) {
            return;
        }

        // trigger onChange
        this.onInput(event.nativeEvent.key);
    };

    clearInput = () => {
        this.setState({
            digits: '',
        });
    };

    // long press on delete
    clearAllInput = () => {
        this.clearInput();
        this.announceProgress(0);
    };

    private paneKeyStyle = (): ViewStyle | undefined => {
        const { virtualKeyboard, paneLayout } = this.props;
        const { context } = this;
        if (Platform.OS !== 'android' || !context?.fullPane || !virtualKeyboard) return undefined;
        const height = typeof paneLayout?.height === 'number' && Number.isFinite(paneLayout.height)
            ? paneLayout.height : ANDROID_PIN_MIN_HEIGHT;
        return { width: undefined, minWidth: 44, maxWidth: 90, flex: 1,
            height: Math.max(44, Math.min(48, (height - 56) / 4)), margin: 2 };
    };

    renderNumText = (flag: number) => {
        const { supportBiometric, onBiometryPress } = this.props;
        const paneKey = this.paneKeyStyle();

        return BUTTONS.slice(flag, flag + 3).map((item, index) => {
            if (item === 'X') {
                return (
                    <TouchableHighlight
                        testID="x-key"
                        underlayColor={StyleService.value('$transparentContrast')}
                        activeOpacity={0.7}
                        style={[
                            styles.line,
                            ...(paneKey ? [paneKey] : []),
                        ]}
                        key="x-key"
                        accessible
                        accessibilityRole={KEY_ROLE}
                        accessibilityLabel={Localize.t('global.delete')}
                        onPress={() => {
                            this.onInput('Backspace');
                        }}
                        onLongPress={this.clearAllInput}
                    >
                        <Icon name="IconChevronLeft" style={[
                            styles.iconStyle,
                            AppStyles.marginTopNegativeSml,
                            ...(paneKey ? [PANE_DELETE_ICON] : []),
                        ]} size={35} />
                    </TouchableHighlight>
                );
            }
            if (item === 'Y') {
                if (supportBiometric) {
                    return (
                        <TouchableHighlight
                            testID="y-key"
                            underlayColor={StyleService.value('$transparentContrast')}
                            style={[
                                styles.line,
                                ...(paneKey ? [paneKey] : []),
                            ]}
                            accessible
                            accessibilityRole="button"
                            accessibilityLabel={Localize.t('settings.biometricAuthentication')}
                            activeOpacity={0.7}
                            key="y-key"
                            onPress={() => {
                                if (onBiometryPress) {
                                    onBiometryPress();
                                }
                            }}
                        >
                            <Icon name="IconFingerprint" style={styles.iconStyle} size={35} />
                        </TouchableHighlight>
                    );
                }

                return <View key={`${index}-line`} style={paneKey ? [styles.line, paneKey] : styles.line} />;
            }

            const alpha = (n: string): string => {
                const alphabet = 'ABC.DEF.GHI.JKL.MNO.PQRS.TUV.WXYZ';
                switch (n) {
                    case '2':
                    case '3':
                    case '4':
                    case '5':
                    case '6':
                    case '7':
                    case '8':
                    case '9':
                        return alphabet.split('.')[Number(n) - 2];
                    default:
                        return '';
                }
            };

            return (
                <TouchableHighlight
                    testID={`${item}-key`}
                    underlayColor={StyleService.value('$transparentContrast')}
                    style={[
                        styles.line,
                        ...(paneKey ? [paneKey] : []),
                    ]}
                    activeOpacity={0.7}
                    key={`${item}-key`}
                    onPress={() => {
                        this.onInput(item);
                    }}
                    accessible
                    accessibilityRole={KEY_ROLE}
                    accessibilityLabel={item}
                >
                    <>
                        <Text style={paneKey ? [styles.numTextInt, PANE_NUMBER] : styles.numTextInt}>{item}</Text>
                        <Text style={paneKey ? [styles.numTextAlpha, PANE_ALPHA] : styles.numTextAlpha}>
                            {alpha(item)}
                        </Text>
                    </>
                </TouchableHighlight>
            );
        });
    };
    renderNum() {
        return BUTTONS.map((item, index) => {
            if (index % 3 === 0) {
                return (
                    <View style={styles.numWrap} key={`num-${index}`}>
                        {this.renderNumText(index)}
                    </View>
                );
            }

            return null;
        });
    }

    renderDots = () => {
        const { length } = this.props;
        const { digits } = this.state;

        const elements = [];
        for (let i = 0; i < length; i++) {
            elements.push(
                <View
                    key={`dot-${i}`}
                    style={[styles.pinStyle, digits.length > i ? { ...styles.pinActiveStyle } : {}]}
                />,
            );
        }

        return elements;
    };

    renderLoading = () => {
        return <LoadingIndicator />;
    };

    render() {
        const { condensed, virtualKeyboard, length, isLoading, pinPadStyle, accessibilityLabel, accessibilityHint } =
            this.props;
        const { digits } = this.state;
        const paneKey = this.paneKeyStyle();

        let props: {};

        // ios
        if (Platform.OS === 'ios') {
            props = { display: 'none' };
        } else {
            // android
            props = { style: styles.hiddenInput };
        }

        // Sensitive on Android 14+: apps that aren't accessibility tools (TalkBack is one)
        // can't see which keys are pressed.
        // No iOS capture cover here: the pad is also the app lock, which has to work while
        // the screen is mirrored. Secret numbers add the cover around this pad themselves.
        return (
            <TouchableWithoutFeedback testID="pin-input-container" onPress={this.focus} accessible={false}>
                <SensitiveAccessibilityView
                    captureShield={false}
                    style={[
                        styles.container,
                        ...(paneKey ? [PANE_CONTAINER] : []),
                    ]}
                >
                    {!virtualKeyboard && (
                        <TextInput
                    // eslint-disable-next-line react/jsx-props-no-spreading
                    {...noAutofillProps}
                            ref={this.inputRef}
                            testID="pin-input"
                            returnKeyType="done"
                            keyboardType="number-pad"
                            accessible
                            onKeyPress={this.onKeyPress}
                            autoCorrect={false}
                            spellCheck={false}
                            disableFullscreenUI
                            secureTextEntry
                            caretHidden
                            value={digits}
                            maxLength={length}
                            // eslint-disable-next-line
                            {...props}
                        />
                    )}
                    <View
                        style={[
                            styles.digits,
                            condensed && styles.digitsCondensed,
                            ...(paneKey ? [PANE_DIGITS] : []),
                        ]}
                        accessible
                        accessibilityLabel={accessibilityLabel ?? Localize.t('global.passcode')}
                        accessibilityHint={accessibilityHint ?? Localize.t('global.pleaseEnterYourPasscode')}
                        accessibilityValue={{
                            text: Localize.t('global.passcodeDigitsEntered', { count: digits.length, length }),
                        }}
                        accessibilityState={{ busy: !!isLoading }}
                    >{isLoading ? this.renderLoading() : this.renderDots()}</View>

                    {virtualKeyboard && (
                        <View testID="virtual-keyboard"
                            style={[
                                styles.keyboardWrap,
                                pinPadStyle,
                                condensed && styles.keyboardWrapCondensed,
                                ...(paneKey ? [PANE_KEYBOARD] : []),
                            ]}
                        >
                            {this.renderNum()}
                        </View>
                    )}
                </SensitiveAccessibilityView>
            </TouchableWithoutFeedback>
        );
    }
}

/* Export Component ==================================================================== */
export default SecurePinInput;
