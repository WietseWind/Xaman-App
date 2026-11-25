import React, { Component } from 'react';
import {
    Text,
    View,
    PanResponder,
    Animated,
    TouchableOpacity,
    AccessibilityInfo,
    PanResponderGestureState,
    GestureResponderEvent,
    ViewStyle,
    StyleProp,
} from 'react-native';

import { LoadingIndicator } from '@components/General/LoadingIndicator';

import { AppSizes } from '@theme';

// Components
import { Icon } from '../Icon';

// Styles
import styles from './styles';
import StyleService from '@services/StyleService';
import { TextContrast } from '@common/utils/color';

/* Constants ==================================================================== */
const DEFAULT_ANIMATION_DURATION = 400;
const RESET_AFTER_SUCCESS_DEFAULT_DELAY = 1000;
const SWIPE_SUCCESS_THRESHOLD = 80;
// screen reader button: ignore a second activation within this time (a swipe can't fire twice either)
const ACCESSIBLE_PRESS_GUARD_MS = 1000;

/* Types ==================================================================== */
interface Props {
    testID?: string;
    label?: string;
    accessibilityLabel?: string;
    isLoading?: boolean;
    isDisabled?: boolean;
    secondary?: boolean;
    onSwipeSuccess: () => void;
    onPanResponderGrant?: () => void;
    onPanResponderRelease?: () => void;
    shouldResetAfterSuccess?: boolean;
    style?: StyleProp<ViewStyle>;
    color?: string;
}

interface State {
    screenReaderEnabled: boolean;
    labelColor?: string;
    iconColor?: string;
}
/* Component ==================================================================== */
class SwipeButton extends Component<Props, State> {
    declare readonly props: Props & Required<Pick<Props, keyof typeof SwipeButton.defaultProps>>;

    static defaultProps: Partial<Props> = {
        shouldResetAfterSuccess: false,
    };

    private animatedWidth: Animated.Value;
    // private animatedWidth: number;
    private defaultContainerWidth: number;
    private maxWidth: number;
    private panResponder: any;
    private resetDelayTimeout: any;
    private screenReaderListener?: ReturnType<typeof AccessibilityInfo.addEventListener>;
    private lastAccessiblePress: number;

    constructor(props: Props) {
        super(props);

        this.state = {
            screenReaderEnabled: false,
            labelColor: undefined,
            iconColor: undefined,
        };

        this.defaultContainerWidth = AppSizes.scale(45);
        this.maxWidth = 0;
        this.lastAccessiblePress = 0;
        this.animatedWidth = new Animated.Value(this.defaultContainerWidth);
        // this.animatedWidth = this.defaultContainerWidth;

        this.panResponder = PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onStartShouldSetPanResponderCapture: () => true,
            onMoveShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponderCapture: () => true,
            onShouldBlockNativeResponder: () => false,
            onPanResponderTerminationRequest: () => false,
            onPanResponderMove: this.onPanResponderMove,
            onPanResponderRelease: this.onPanResponderRelease,
            onPanResponderTerminate: this.onPanResponderRelease,
            onPanResponderGrant: this.onPanResponderGrant,
            onPanResponderStart: this.onPanResponderGrant,
        });
    }

    componentDidMount() {
        this.screenReaderListener = AccessibilityInfo.addEventListener(
            'screenReaderChanged',
            this.onScreenReaderChange,
        );

        AccessibilityInfo.isScreenReaderEnabled().then(this.onScreenReaderChange);
    }

    componentWillUnmount() {
        if (this.resetDelayTimeout) clearTimeout(this.resetDelayTimeout);
        this.screenReaderListener?.remove();
    }

    static getDerivedStateFromProps(nextProps: Props) {
        const { color, secondary } = nextProps;

        if (color) {
            const colorContrast = TextContrast(color);
            return {
                labelColor: colorContrast === 'light' ? StyleService.value('$white') : StyleService.value('$darkGrey'),
                iconColor: secondary
                    ? StyleService.value('$lightGreen')
                    : colorContrast === 'light'
                      ? StyleService.value('$transparentWhite')
                      : StyleService.value('$darkGrey'),
            };
        }

        return null;
    }

    onScreenReaderChange = (enabled: boolean) => {
        const { screenReaderEnabled } = this.state;

        if (enabled !== screenReaderEnabled) {
            this.setState({
                screenReaderEnabled: enabled,
            });
        }
    };

    onLayoutChange = (e: any) => {
        const { width } = e.nativeEvent.layout;

        this.maxWidth = width - 10;
    };

    changePosition = (width: number) => {
        // this.animatedWidth = width;
        Animated.timing(this.animatedWidth, {
            toValue: width,
            duration: 400,
            useNativeDriver: true,
        }).start();
    };

    onSwipeNotMetSuccessThreshold = () => {
        // Animate to initial position
        this.changePosition(this.defaultContainerWidth);
    };

    onSwipeMetSuccessThreshold = (newWidth: number) => {
        const { onSwipeSuccess } = this.props;

        if (newWidth !== this.maxWidth) {
            this.finishRemainingSwipe();
            return;
        }

        if (typeof onSwipeSuccess === 'function') {
            onSwipeSuccess();
        }

        this.reset();
    };

    onPanResponderGrant = () => {
        const { onPanResponderGrant, isDisabled } = this.props;

        // ignore if button disabled
        if (isDisabled) {
            return;
        }

        if (typeof onPanResponderGrant === 'function') {
            onPanResponderGrant();
        }
    };

    onPanResponderMove = (event: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const { isDisabled } = this.props;

        if (isDisabled) {
            return;
        }

        const newWidth = this.defaultContainerWidth + gestureState.dx;

        if (newWidth < this.defaultContainerWidth) {
            // Reached starting position
            this.reset();
        } else if (newWidth > this.maxWidth) {
            // Reached end position
            this.changePosition(this.maxWidth);
        } else {
            // this.animatedWidth = newWidth;
            this.animatedWidth.setValue(newWidth);
        }
    };

    onPanResponderRelease = (event: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const { isDisabled, onPanResponderRelease } = this.props;

        // ignore if button is disabled
        if (isDisabled) {
            return;
        }

        if (typeof onPanResponderRelease === 'function') {
            onPanResponderRelease();
        }

        const newWidth = this.defaultContainerWidth + 1 * gestureState.dx;
        const successThresholdWidth = this.maxWidth * (SWIPE_SUCCESS_THRESHOLD / 100);

        if (newWidth < successThresholdWidth) {
            this.onSwipeNotMetSuccessThreshold();
        } else {
            this.onSwipeMetSuccessThreshold(newWidth);
        }
    };

    finishRemainingSwipe = () => {
        const { onSwipeSuccess, shouldResetAfterSuccess } = this.props;

        // Animate to final position
        this.changePosition(this.maxWidth);

        if (typeof onSwipeSuccess === 'function') {
            onSwipeSuccess();
        }

        // Animate back to initial position after successfully swiped
        const resetDelay = DEFAULT_ANIMATION_DURATION + RESET_AFTER_SUCCESS_DEFAULT_DELAY;
        this.resetDelayTimeout = setTimeout(() => {
            shouldResetAfterSuccess && this.reset();
        }, resetDelay);
    };

    reset = () => {
        this.changePosition(this.defaultContainerWidth);
    };

    // The screen reader replacement for the swipe: it must hold back exactly like the swipe does.
    // A disabled swipe is how screens wait for checks (e.g. the scam check before Accept).
    onAccessiblePress = () => {
        const { isDisabled, isLoading, onSwipeSuccess } = this.props;

        if (isDisabled || isLoading) {
            return;
        }

        const now = Date.now();
        if (now - this.lastAccessiblePress < ACCESSIBLE_PRESS_GUARD_MS) {
            return;
        }
        this.lastAccessiblePress = now;

        if (typeof onSwipeSuccess === 'function') {
            onSwipeSuccess();
        }
    };

    render() {
        const { label, accessibilityLabel, isDisabled, isLoading, secondary, testID, style, color } = this.props;
        const { screenReaderEnabled, labelColor, iconColor } = this.state;

        if (isLoading) {
            return (
                <View
                    style={[
                        styles.container,
                        secondary && styles.containerSecondary,
                        style,
                        color ? { backgroundColor: color, borderColor: color } : {},
                    ]}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={accessibilityLabel || label}
                    accessibilityState={{ disabled: true, busy: true }}
                >
                    <LoadingIndicator style={styles.spinner} color="light" />
                </View>
            );
        }

        if (screenReaderEnabled) {
            return (
                <TouchableOpacity
                    testID={testID}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={accessibilityLabel || label}
                    accessibilityState={{ disabled: !!isDisabled }}
                    disabled={!!isDisabled}
                    onPress={this.onAccessiblePress}
                    style={[
                        styles.container,
                        secondary && styles.containerSecondary,
                        style,
                        color ? { backgroundColor: color, borderColor: color } : {},
                        isDisabled ? styles.containerDisabled : {},
                    ]}
                >
                    <Text
                        style={[
                            styles.label,
                            // eslint-disable-next-line react-native/no-inline-styles
                            { paddingLeft: 0 },
                            labelColor ? { color: labelColor } : {},
                        ]}
                    >
                        {accessibilityLabel || label}
                    </Text>
                </TouchableOpacity>
            );
        }

        return (
            <View
                style={[
                    styles.container,
                    secondary ? styles.containerSecondary : {},
                    style,
                    color ? { backgroundColor: color, borderColor: color } : {},
                    isDisabled ? styles.containerDisabled : {},
                ]}
                onLayout={this.onLayoutChange}
            >
                <Text style={[styles.label, labelColor ? { color: labelColor } : {}]}>{label}</Text>
                <Animated.View
                    testID={testID}
                    style={[
                        styles.thumpContainer,
                        { transform: [ { translateX: this.animatedWidth } ] },
                    ]}
                    // eslint-disable-next-line react/jsx-props-no-spreading
                    {...this.panResponder.panHandlers}
                    hitSlop={{ top: 50, left: 50, right: 50, bottom: 50 }}
                >
                    <View
                        style={[
                            styles.iconContainer,
                            secondary ? styles.iconContainerSecondary : {},
                            iconColor ? { backgroundColor: iconColor } : {},
                        ]}
                    >
                        <Icon size={30} name="IconArrowRightLong" />
                    </View>
                </Animated.View>
            </View>
        );
    }
}

export default SwipeButton;
