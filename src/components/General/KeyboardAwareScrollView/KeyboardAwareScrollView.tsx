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
import { supportsAndroidWindowLayout } from '@common/helpers/androidWindow';

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
    /** A stable pane-only wrapper can opt out while its screen is fullscreen. */
    observeKeyboard?: boolean;
}

interface State {
    offset: any;
}

const DEFAULT_EXTRA_OFFSET = 20;
const FULL_PANE_CONTENT_STYLE = { flexGrow: 1, flexShrink: 0, flexBasis: 'auto' as const };
type ContentScrollView = ScrollView & {
    getNativeScrollRef?: () => Parameters<TextInput['measureLayout']>[0] | null;
};
/* Component ==================================================================== */
class KeyboardAwareScrollView extends PureComponent<Props, State> {
    static contextType = AndroidWindowSurroundContext;

    declare context: React.ContextType<typeof AndroidWindowSurroundContext>;

    private mounted = false;
    private keyboardVisible = false;
    private keyboardShowNotified = false;
    private adaptiveKeyboardSession = false;
    private previousAdaptiveScale?: number;
    private previousFullPane = false;
    private previousObserveKeyboard: boolean;
    private adaptiveLife = 0;
    private adaptiveQuery = 0;
    private adaptiveScroll = 0;
    private adaptiveLayout = 0;
    private adaptivePaddingTarget = 0;
    private adaptiveKey?: { input: any; top: number; scale: number; layout: number; fullPane: boolean };
    private nativeKeyboardSubscriptions: Array<{ remove: () => void }> = [];
    private keyboardListenersBound = false;
    private releaseGeometryWatch?: () => void;
    private keyboardHeight: number;
    private windowHeight: number;
    private scrollPosition: any;
    private viewHeight: number;
    private paneLayout?: { x: number; y: number; width: number };
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
        const { observeKeyboard } = props;
        this.previousObserveKeyboard = observeKeyboard !== false;

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
        const { context } = this;
        this.mounted = true;
        this.previousAdaptiveScale = this.adaptiveScale();
        this.previousFullPane = context?.fullPane === true;
        this.bindKeyboardListeners();
    }

    private bindKeyboardListeners = () => {
        if (this.keyboardListenersBound || !this.observesKeyboard()) return;
        this.keyboardListenersBound = true;
        if (Platform.OS === 'android' && typeof NativeModules.KeyboardModule?.getWindowGeometry === 'function') {
            this.nativeKeyboardSubscriptions = [
                RNKeyboard.addListener('keyboardDidShow', this.onNativeKeyboardShow),
                RNKeyboard.addListener('keyboardDidHide', this.onNativeKeyboardHide),
            ];
        }
        Keyboard.addListener('keyboardWillShow', this.onKeyboardShow);
        Keyboard.addListener('keyboardWillHide', this.onKeyboardHide);
    };

    private unbindKeyboardListeners = () => {
        if (!this.keyboardListenersBound) return;
        this.keyboardListenersBound = false;
        this.nativeKeyboardSubscriptions.forEach((subscription) => subscription.remove());
        this.nativeKeyboardSubscriptions = [];
        Keyboard.removeListener('keyboardWillShow', this.onKeyboardShow);
        Keyboard.removeListener('keyboardWillHide', this.onKeyboardHide);
    };

    componentDidUpdate() {
        const { context } = this;
        const { observeKeyboard } = this.props;
        const wasObserving = this.previousObserveKeyboard;
        this.previousObserveKeyboard = observeKeyboard !== false;
        if (observeKeyboard === false) {
            if (wasObserving) {
                this.hideAdaptiveKeyboard();
                const { offset } = this.state;
                Animated.timing(offset, { toValue: 0, duration: 0, useNativeDriver: false }).start();
            }
            this.unbindKeyboardListeners();
            return;
        }
        if (!wasObserving) {
            this.bindKeyboardListeners();
            this.onNativeKeyboardShow();
        }
        const scale = this.adaptiveScale();
        const fullPane = context?.fullPane === true;
        const changed = this.previousAdaptiveScale !== scale || this.previousFullPane !== fullPane;
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
        this.previousFullPane = fullPane;
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
        this.unbindKeyboardListeners();
        // clear timeout
        if (this.scrollToTimeout) clearTimeout(this.scrollToTimeout);

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

    private measureInputContent = (input: Pick<TextInput, 'measureLayout'>, scrollView: ScrollView):
        Promise<{ y: number; height: number } | undefined> => new Promise((resolve) => {
        try {
            const outer = (scrollView as ContentScrollView).getNativeScrollRef?.() ?? scrollView.getScrollableNode?.();
            if (outer == null || typeof input.measureLayout !== 'function') { resolve(undefined); return; }
            // Shadow layout coordinates include the outer scroll view's padding
            // and ignore its live native scroll offset. The inner content ref
            // omits that padding and can leave part of a field behind the IME.
            input.measureLayout(outer, (_x, y, _width, height) => {
                resolve(Number.isFinite(y) && Number.isFinite(height) && height > 0 ? { y, height } : undefined);
            }, () => resolve(undefined));
        } catch {
            resolve(undefined);
        }
    });

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

    private observesKeyboard = () => {
        const { observeKeyboard } = this.props;
        return observeKeyboard !== false;
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
        if (!this.observesKeyboard()) return;
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
        if (!this.observesKeyboard()) return;
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
        if (!this.observesKeyboard()) return true;
        const query = NativeModules.KeyboardModule?.getWindowGeometry;
        if (typeof query !== 'function') return false;
        const input = TextInput.State.currentlyFocusedInput();
        const scrollView = this.scrollViewRef.current;
        if (!input || !scrollView?.getScrollResponder()) return true;
        const { context } = this;
        const fullPane = context?.fullPane === true;
        const paneMeasuredOffset = fullPane ? this.scrollPosition.y : 0;
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
        const isActive = () => {
            const { context: activeContext } = this;
            return this.mounted && this.keyboardVisible && life === this.adaptiveLife &&
                input === TextInput.State.currentlyFocusedInput() && scale === this.adaptiveScale() &&
                fullPane === (activeContext?.fullPane === true);
        };
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
            previous.layout === this.adaptiveLayout && previous.fullPane === fullPane) return true;

        // Reserve the verified geometry before measuring. A duplicate standard
        // or custom event must not cancel the first request's pending animation.
        const key = { input, top, scale, layout: this.adaptiveLayout, fullPane };
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
        const content = fullPane ? await this.measureInputContent(input, scrollView) : undefined;
        if (!isCurrent() || scrollView !== this.scrollViewRef.current) return true;
        if (content) inputHeight = content.height;
        const { extraOffset, calculateExtraOffset } = this.props;
        const { offset } = this.state;
        const inputExtra = typeof calculateExtraOffset === 'function' ? calculateExtraOffset(input, inputHeight) : 0;
        const bottom = inputY + (inputHeight + inputExtra) * scale;
        // A bounded pane card may end above the keyboard. Its own scroll
        // viewport, rather than the farther IME top, is the visible boundary.
        const visibleBottom = fullPane ? Math.min(top, scrollY + scrollHeight * scale) : top;
        const visibleHeight = (visibleBottom - scrollY) / scale;
        // Leave room for a field's surrounding border when the pane can fit it.
        const clearance = content ? Math.min(DEFAULT_EXTRA_OFFSET,
            Math.max(0, (visibleHeight - inputHeight - inputExtra) / 2)) : 0;
        const gap = bottom - visibleBottom;
        const hasOverlap = gap > 0;
        const inputAboveViewport = fullPane && inputY < scrollY + clearance * scale;
        const needsScroll = hasOverlap || inputAboveViewport ||
            (!!content && bottom > visibleBottom - clearance * scale);
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
        if (!needsScroll && padding === this.adaptivePaddingTarget) return true;
        this.adaptivePaddingTarget = padding;
        Animated.timing(offset, {
            toValue: padding, useNativeDriver: false, duration: 200,
        }).start(() => {
            if (!needsScroll || !isCurrent()) return;
            this.scrollToTimeout = setTimeout(() => {
                if (!isCurrent()) return;
                const currentY = fullPane ? paneMeasuredOffset : this.scrollPosition.y;
                let targetY = currentY + gap / scale + DEFAULT_EXTRA_OFFSET;
                if (content) {
                    // Content coordinates do not change when Android or the
                    // user scrolls during the padding animation. Never add a
                    // stale window-relative delta to a newer scroll offset.
                    const alignedTop = content.y - clearance;
                    const aboveKeyboard = content.y + inputHeight + inputExtra - visibleHeight + DEFAULT_EXTRA_OFFSET;
                    targetY = Math.max(0, inputAboveViewport ? alignedTop : Math.min(aboveKeyboard, alignedTop));
                } else if (fullPane) {
                    // Clearance is optional when the visible pane only just
                    // fits the input. Never move its start above this viewport;
                    // also recover focus that was already clipped at the top.
                    const alignedTop = currentY + (inputY - scrollY) / scale;
                    targetY = Math.max(0, inputAboveViewport ? alignedTop : Math.min(targetY, alignedTop));
                }
                this.scrollViewRef.current?.scrollTo({
                    x: 0, y: targetY, animated: true,
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

        let { windowHeight } = this;
        // Resizable Android windows can return fullscreen without remounting the form.
        if (supportsAndroidWindowLayout()) {
            const { height: liveHeight } = Dimensions.get('window');
            if (Number.isFinite(liveHeight) && liveHeight > 0) windowHeight = liveHeight;
        }
        const keyboardPosition = Math.abs(this.keyboardHeight - windowHeight);
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
        if (!this.observesKeyboard()) return;
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
        if (!this.observesKeyboard()) return;
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
        const { context } = this;
        const { x, y, width, height } = event.nativeEvent.layout;
        const pane = context?.fullPane && [x, y, width].every(Number.isFinite) && width > 0
            ? { x, y, width } : undefined;
        // Pane resizing can wrap text and move an input without changing the
        // scroll viewport's height. Its old focus measurement is then stale.
        const moved = pane && (!this.paneLayout || pane.x !== this.paneLayout.x ||
            pane.y !== this.paneLayout.y || pane.width !== this.paneLayout.width);
        const changed = this.viewHeight !== height || !!moved;
        this.viewHeight = height;
        this.paneLayout = pane;
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
        const {
            children, style, contentContainerStyle, scrollEnabled, testID, keyboardShouldPersistTaps,
            keyboardDismissMode, showsVerticalScrollIndicator, nestedScrollEnabled,
        } = this.props;
        const { offset } = this.state;
        const { context } = this;

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
                keyboardShouldPersistTaps={keyboardShouldPersistTaps}
                keyboardDismissMode={keyboardDismissMode}
                showsVerticalScrollIndicator={showsVerticalScrollIndicator}
                nestedScrollEnabled={nestedScrollEnabled}
                onLayout={this.handleLayout}
                onContentSizeChange={this.handleContentSizeChange}
                style={style}
                contentContainerStyle={[contentContainerStyle]}
                {...extraProps}
            >
                <Animated.View style={[
                    styles.contentContainer,
                    context?.fullPane ? FULL_PANE_CONTENT_STYLE : undefined,
                    { paddingBottom: offset },
                ]}>{children}</Animated.View>
            </ScrollView>
        );
    }
}

export default KeyboardAwareScrollView;
