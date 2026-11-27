/* eslint-disable react/jsx-props-no-spreading */
import React, { ReactNode, PureComponent } from 'react';
import {
    ScrollView,
    Dimensions,
    ScrollViewProps,
    Animated,
    Platform,
    LayoutChangeEvent,
    TextInput,
    NativeModules,
    Keyboard as RNKeyboard,
    findNodeHandle,
    PixelRatio,
} from 'react-native';

import Keyboard from '@common/helpers/keyboard';
import { AndroidWindowSurroundContext } from '@common/helpers/androidWindowContext';
import { watchAndroidKeyboardGeometry } from '@common/helpers/androidKeyboardGeometry';

import styles from './styles';
/* Types ==================================================================== */
interface Props extends ScrollViewProps {
    testID?: string;
    enabled?: boolean;
    children: ReactNode;
    hasHeader?: boolean;
    extraOffset?: number;
    calculateExtraOffset?: (input: any, inputHeight: number) => number;
    onKeyboardShow?: () => void;
    onKeyboardHide?: () => void;
}

interface State {
    offset: any;
}

const DEFAULT_EXTRA_OFFSET = 20;
/* Component ==================================================================== */
class KeyboardAwareScrollView extends PureComponent<Props, State> {
    static contextType = AndroidWindowSurroundContext;

    declare context: React.ContextType<typeof AndroidWindowSurroundContext>;

    private mounted = false;
    private keyboardVisible = false;
    private keyboardShowNotified = false;
    private adaptiveKeyboardSession = false;
    private previousAdaptiveScale?: number;
    private adaptiveLife = 0;
    private adaptiveQuery = 0;
    private adaptiveScroll = 0;
    private adaptiveLayout = 0;
    private adaptivePaddingTarget = 0;
    private adaptiveKey?: { input: any; top: number; scale: number; layout: number };
    private nativeKeyboardSubscriptions: Array<{ remove: () => void }> = [];
    private releaseGeometryWatch?: () => void;
    private keyboardHeight: number;
    private windowHeight: number;
    private scrollPosition: any;
    private viewHeight: number;
    private contentHeight: number;
    private scrollViewRef: React.RefObject<ScrollView>;
    private scrollToTimeout: NodeJS.Timeout | undefined;

    declare readonly props: Props & Required<Pick<Props, keyof typeof KeyboardAwareScrollView.defaultProps>>;

    static defaultProps: Partial<Props> = {
        extraOffset: 0,
        enabled: true,
    };

    constructor(props: Props) {
        super(props);

        this.state = {
            offset: new Animated.Value(0),
        };

        this.scrollViewRef = React.createRef();

        this.keyboardHeight = 0;
        this.viewHeight = 0;
        this.contentHeight = 0;
        this.windowHeight = Dimensions.get('window').height;

        this.scrollPosition = { x: 0, y: 0 };
    }

    componentDidMount() {
        this.mounted = true;
        this.previousAdaptiveScale = this.adaptiveScale();
        if (Platform.OS === 'android' && typeof NativeModules.KeyboardModule?.getWindowGeometry === 'function') {
            this.nativeKeyboardSubscriptions = [
                RNKeyboard.addListener('keyboardDidShow', this.onNativeKeyboardShow),
                RNKeyboard.addListener('keyboardDidHide', this.onNativeKeyboardHide),
            ];
        }
        Keyboard.addListener('keyboardWillShow', this.onKeyboardShow);
        Keyboard.addListener('keyboardWillHide', this.onKeyboardHide);
    }

    componentDidUpdate() {
        const scale = this.adaptiveScale();
        const changed = this.previousAdaptiveScale !== scale;
        if (changed) {
            if (scale === undefined) this.stopGeometryWatch();
            this.adaptiveLife += 1;
            this.adaptiveQuery += 1;
            this.adaptiveScroll += 1;
            this.adaptiveKey = undefined;
            if (this.scrollToTimeout) clearTimeout(this.scrollToTimeout);
            // Preserve the last parent notification until a real hide. Losing
            // the adaptive context alone does not mean the keyboard closed.
        }
        this.previousAdaptiveScale = scale;
        const { enabled } = this.props;
        if (changed && scale !== undefined && this.keyboardVisible && enabled) {
            this.scrollToAdaptiveFocusedInput(scale);
        }
    }

    componentWillUnmount() {
        this.mounted = false;
        this.adaptivePaddingTarget = 0;
        this.stopGeometryWatch();
        this.adaptiveLife += 1;
        this.adaptiveQuery += 1;
        this.adaptiveScroll += 1;
        this.adaptiveKey = undefined;
        this.nativeKeyboardSubscriptions.forEach((subscription) => subscription.remove());
        // clear timeout
        if (this.scrollToTimeout) clearTimeout(this.scrollToTimeout);

        Keyboard.removeListener('keyboardWillShow', this.onKeyboardShow);
        Keyboard.removeListener('keyboardWillHide', this.onKeyboardHide);
    }

    public scrollTo = (y: number) => {
        this.scrollViewRef?.current?.scrollTo({ y });
    };

    measureElement = (element: any): Promise<any> => {
        return new Promise((resolve: any) => {
            element.measureInWindow((x: number, y: number, width: number, height: number) => {
                resolve({ x, y, width, height });
            });
        });
    };

    private adaptiveScale = (): number | undefined => {
        const { context } = this;
        const scale = Platform.OS === 'android' ? context?.scale : undefined;
        return typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : undefined;
    };

    private stopGeometryWatch = () => {
        this.releaseGeometryWatch?.();
        this.releaseGeometryWatch = undefined;
    };

    private onWindowGeometryChange = () => {
        const scale = this.adaptiveScale();
        if (this.mounted && this.keyboardVisible && scale !== undefined) {
            this.scrollToAdaptiveFocusedInput(scale);
        }
    };

    private hideAdaptiveKeyboard = () => {
        this.adaptivePaddingTarget = 0;
        this.stopGeometryWatch();
        const wasVisible = this.keyboardVisible || this.adaptiveKey !== undefined;
        this.keyboardVisible = false;
        this.adaptiveLife += 1;
        this.adaptiveQuery += 1;
        this.adaptiveScroll += 1;
        this.adaptiveKey = undefined;
        if (this.scrollToTimeout) clearTimeout(this.scrollToTimeout);
        const { enabled, onKeyboardHide } = this.props;
        if (this.keyboardShowNotified) {
            this.keyboardShowNotified = false;
            onKeyboardHide?.();
        }
        const { offset } = this.state;
        if (wasVisible && enabled) {
            Animated.timing(offset, {
                toValue: 0, duration: 300, useNativeDriver: false,
            }).start();
        }
    };

    private onNativeKeyboardShow = () => {
        // Remember visibility while fullscreen too, so a later split can
        // remeasure without depending on a second native Show event.
        this.keyboardVisible = true;
        const scale = this.adaptiveScale();
        if (scale === undefined || typeof NativeModules.KeyboardModule?.getWindowGeometry !== 'function') return;
        // Standard events never enter the legacy popup-height protocol. Only
        // the existing custom emitter is allowed to use that fallback.
        this.scrollToAdaptiveFocusedInput(scale);
    };

    private onNativeKeyboardHide = () => {
        if (this.adaptiveKeyboardSession || (this.adaptiveScale() !== undefined &&
            typeof NativeModules.KeyboardModule?.getWindowGeometry === 'function')) this.hideAdaptiveKeyboard();
        else {
            this.keyboardVisible = false;
            this.adaptivePaddingTarget = 0;
        }
    };

    private onAdaptiveFocus = (event: any) => {
        const scale = this.adaptiveScale();
        const { enabled } = this.props;
        if (!enabled || scale === undefined ||
            typeof NativeModules.KeyboardModule?.getWindowGeometry !== 'function') return;
        const input = TextInput.State.currentlyFocusedInput();
        const target = event.nativeEvent?.target ?? event.target;
        // A bubbling focus must belong to this focused native input. A focus
        // on the scroll container must not move a different or hidden form.
        if (!input || target == null || target !== findNodeHandle(input)) return;
        this.keyboardVisible = true;
        this.scrollToAdaptiveFocusedInput(scale);
    };

    /** True when the adaptive path handled or canceled this request; false keeps legacy behavior. */
    private scrollToAdaptiveFocusedInput = async (scale: number): Promise<boolean> => {
        const query = NativeModules.KeyboardModule?.getWindowGeometry;
        if (typeof query !== 'function') return false;
        const input = TextInput.State.currentlyFocusedInput();
        const scrollView = this.scrollViewRef.current;
        if (!input || !scrollView?.getScrollResponder()) return true;
        if (this.keyboardVisible && !this.releaseGeometryWatch) {
            this.releaseGeometryWatch = () => undefined;
            const release = watchAndroidKeyboardGeometry(this.onWindowGeometryChange);
            if (this.releaseGeometryWatch) this.releaseGeometryWatch = release;
            else release();
        }
        // Keep ownership through context loss and both hide emitters. A later
        // ordinary custom Show starts the original legacy notification session.
        this.adaptiveKeyboardSession = true;
        const life = this.adaptiveLife;
        const queryId = ++this.adaptiveQuery;
        const isActive = () => this.mounted && this.keyboardVisible && life === this.adaptiveLife &&
            input === TextInput.State.currentlyFocusedInput() && scale === this.adaptiveScale();
        let geometry;
        try {
            geometry = await query();
        } catch {
            return !isActive() || queryId !== this.adaptiveQuery;
        }
        if (!isActive() || queryId !== this.adaptiveQuery) return true;
        if (geometry?.visible === false) {
            this.hideAdaptiveKeyboard();
            return true;
        }
        const top = geometry?.keyboardTop;
        if (typeof top !== 'number' || !Number.isFinite(top) || top <= 0) return false;
        const { enabled, onKeyboardShow } = this.props;
        if (!this.keyboardShowNotified) {
            this.keyboardShowNotified = true;
            onKeyboardShow?.();
        }
        if (!enabled) return true;
        const previous = this.adaptiveKey;
        if (previous?.input === input && previous.top === top && previous.scale === scale &&
            previous.layout === this.adaptiveLayout) return true;

        // Reserve the verified geometry before measuring. A duplicate standard
        // or custom event must not cancel the first request's pending animation.
        const key = { input, top, scale, layout: this.adaptiveLayout };
        this.adaptiveKey = key;
        const scrollId = ++this.adaptiveScroll;
        const isCurrent = () => isActive() && scrollId === this.adaptiveScroll && this.adaptiveKey === key;
        if (this.scrollToTimeout) clearTimeout(this.scrollToTimeout);
        let scrollY: number;
        let scrollHeight: number;
        let inputY: number;
        let inputHeight: number;
        try {
            ({ y: scrollY, height: scrollHeight } = await this.measureElement(scrollView));
            if (!isCurrent()) return true;
            if (!Number.isFinite(scrollY) || !Number.isFinite(scrollHeight) || scrollHeight <= 0) {
                this.adaptiveKey = undefined;
                return true;
            }
            ({ y: inputY, height: inputHeight } = await this.measureElement(input));
        } catch {
            if (this.adaptiveKey === key) this.adaptiveKey = undefined;
            return true;
        }
        if (!isCurrent()) return true;
        if (!Number.isFinite(inputY) || !Number.isFinite(inputHeight) || inputHeight <= 0) {
            this.adaptiveKey = undefined;
            return true;
        }
        const { extraOffset, calculateExtraOffset } = this.props;
        const { offset } = this.state;
        const inputExtra = typeof calculateExtraOffset === 'function' ? calculateExtraOffset(input, inputHeight) : 0;
        const bottom = inputY + (inputHeight + inputExtra) * scale;
        const gap = bottom - top;
        const hasOverlap = gap > 0;
        // Native origins are physical, while input height and scroll offsets
        // are logical. Convert the overlap once; keep caller offsets logical.
        const focusedPadding = (gap + 2 * inputHeight * scale + scrollY) / scale + extraOffset;
        // A short form first absorbs padding into unused viewport space. Reserve
        // the occluded viewport so Android can honor the requested scroll range.
        const occluded = Math.max(0, scrollHeight - (top - scrollY) / scale);
        const pixelClearance = 1 / (PixelRatio.get() * scale);
        const rangePadding = Math.ceil(occluded + DEFAULT_EXTRA_OFFSET + pixelClearance +
            Math.max(0, inputExtra) + Math.max(0, extraOffset));
        const padding = hasOverlap ? Math.max(focusedPadding, rangePadding)
            : Math.max(this.adaptivePaddingTarget, rangePadding);
        // Visible focus still needs manual range, but must not shrink a range
        // the user already used or restart a pending padding animation.
        if (!hasOverlap && padding === this.adaptivePaddingTarget) return true;
        this.adaptivePaddingTarget = padding;
        Animated.timing(offset, {
            toValue: padding, useNativeDriver: false, duration: 200,
        }).start(() => {
            if (!hasOverlap || !isCurrent()) return;
            this.scrollToTimeout = setTimeout(() => {
                if (!isCurrent()) return;
                this.scrollViewRef.current?.scrollTo({
                    x: 0, y: this.scrollPosition.y + gap / scale + DEFAULT_EXTRA_OFFSET, animated: true,
                });
            }, 10);
        });
        return true;
    };

    scrollToFocusedTextInput = async () => {
        const adaptiveScale = this.adaptiveScale();
        if (adaptiveScale !== undefined && await this.scrollToAdaptiveFocusedInput(adaptiveScale)) return;
        await this.scrollToLegacyFocusedInput();
    };

    private scrollToLegacyFocusedInput = async () => {
        const { extraOffset, calculateExtraOffset } = this.props;
        const { offset } = this.state;

        const currentlyFocusedField = TextInput.State.currentlyFocusedInput();
        const responder = this.scrollViewRef?.current?.getScrollResponder();

        if (!currentlyFocusedField || !responder) {
            return;
        }

        const { y: scrollViewY } = await this.measureElement(this.scrollViewRef.current);
        const { y: inputY, height: inputHeight } = await this.measureElement(currentlyFocusedField);

        const keyboardPosition = Math.abs(this.keyboardHeight - this.windowHeight);
        let textInputBottomPosition = inputY + inputHeight;

        if (typeof calculateExtraOffset === 'function') {
            textInputBottomPosition += calculateExtraOffset(currentlyFocusedField, inputHeight);
        }

        // need to push content to up
        if (textInputBottomPosition > keyboardPosition) {
            let bottomOffset = textInputBottomPosition - keyboardPosition + inputHeight;

            if (scrollViewY) {
                bottomOffset += scrollViewY;
            }

            bottomOffset += extraOffset;

            Animated.timing(offset, {
                toValue: bottomOffset + inputHeight,
                useNativeDriver: false,
                duration: 200,
            }).start(() => {
                this.scrollToTimeout = setTimeout(() => {
                    this.scrollViewRef?.current?.scrollTo({
                        x: 0,
                        y: this.scrollPosition.y + textInputBottomPosition - keyboardPosition + DEFAULT_EXTRA_OFFSET,
                        animated: true,
                    });
                }, 10);
            });
        }
    };

    onKeyboardShow = (event: any) => {
        const { onKeyboardShow, enabled } = this.props;

        const { height } = event.endCoordinates;

        this.keyboardHeight = height;
        this.keyboardVisible = true;

        const scale = this.adaptiveScale();
        if (scale !== undefined && typeof NativeModules.KeyboardModule?.getWindowGeometry === 'function') {
            this.onAdaptiveKeyboardShow(scale);
            return;
        }
        this.adaptiveKeyboardSession = false;
        this.keyboardShowNotified = true;
        if (typeof onKeyboardShow === 'function') {
            onKeyboardShow();
        }

        if (enabled) {
            this.scrollToFocusedTextInput();
        }
    };

    private onAdaptiveKeyboardShow = async (scale: number) => {
        const life = this.adaptiveLife;
        const pending = this.scrollToAdaptiveFocusedInput(scale);
        const queryId = this.adaptiveQuery;
        if (await pending || !this.mounted || !this.keyboardVisible || life !== this.adaptiveLife ||
            queryId !== this.adaptiveQuery || scale !== this.adaptiveScale()) return;
        // The custom emitter retains its original callback and height formula
        // when the additive native query cannot supply a current geometry.
        const { enabled, onKeyboardShow } = this.props;
        if (!this.keyboardShowNotified) {
            this.keyboardShowNotified = true;
            onKeyboardShow?.();
        }
        if (enabled) this.scrollToLegacyFocusedInput();
    };

    onKeyboardHide = () => {
        if (this.adaptiveKeyboardSession || (this.adaptiveScale() !== undefined &&
            typeof NativeModules.KeyboardModule?.getWindowGeometry === 'function')) {
            this.hideAdaptiveKeyboard();
            return;
        }
        this.keyboardVisible = false;
        this.adaptivePaddingTarget = 0;
        this.keyboardShowNotified = false;
        const { onKeyboardHide, enabled } = this.props;
        const { offset } = this.state;

        if (typeof onKeyboardHide === 'function') {
            onKeyboardHide();
        }

        if (enabled) {
            Animated.timing(offset, {
                toValue: 0,
                duration: 300,
                useNativeDriver: false,
            }).start();
        }
    };

    handleLayout = (event: LayoutChangeEvent) => {
        const { onLayout, enabled } = this.props;

        const changed = this.viewHeight !== event.nativeEvent.layout.height;
        this.viewHeight = event.nativeEvent.layout.height;
        if (changed && this.keyboardVisible && enabled && this.adaptiveScale() !== undefined) {
            this.adaptiveLayout += 1;
            this.adaptiveScroll += 1;
            this.adaptiveKey = undefined;
            this.scrollToFocusedTextInput();
        }

        if (typeof onLayout === 'function') {
            onLayout(event);
        }
    };

    handleContentSizeChange = (w: number, h: number) => {
        const { onContentSizeChange } = this.props;

        this.contentHeight = h;

        if (typeof onContentSizeChange === 'function') {
            onContentSizeChange(w, h);
        }
    };

    handleOnScroll = (e: any) => {
        this.scrollPosition = e.nativeEvent.contentOffset;
    };

    render() {
        const { children, style, contentContainerStyle, scrollEnabled, testID } = this.props;
        const { offset } = this.state;

        const extraProps = {};
        if (this.adaptiveScale() !== undefined &&
            typeof NativeModules.KeyboardModule?.getWindowGeometry === 'function') {
            Object.assign(extraProps, { onFocus: this.onAdaptiveFocus });
        }
        if (typeof scrollEnabled !== 'undefined') {
            Object.assign(
                extraProps,
                Platform.select({
                    android: { scrollEnabled },
                    ios: { canCancelContentTouches: scrollEnabled },
                }),
            );
        }

        return (
            <ScrollView
                testID={testID}
                ref={this.scrollViewRef}
                onScroll={this.handleOnScroll}
                bounces={false}
                scrollEventThrottle={16}
                automaticallyAdjustContentInsets={false}
                contentInsetAdjustmentBehavior="never"
                onLayout={this.handleLayout}
                onContentSizeChange={this.handleContentSizeChange}
                style={style}
                contentContainerStyle={[contentContainerStyle]}
                {...extraProps}
            >
                <Animated.View style={[styles.contentContainer, { paddingBottom: offset }]}>{children}</Animated.View>
            </ScrollView>
        );
    }
}

export default KeyboardAwareScrollView;
