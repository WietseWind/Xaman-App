import { NativeModules } from 'react-native';
import KeyboardAwareScrollView from '../KeyboardAwareScrollView';

let mockWindowHeight = 411;
const mockDensity = 2.625;
let mockFocusedInput: any;
let mockGeometry: jest.Mock;
const mockAnimations: any[] = [];
let mockDeferAnimation = false;
const mockAnimationCompletions: Array<() => void> = [];
const mockNativeHandlers: Record<string, () => void> = {};
const mockRemoved = jest.fn();
const mockWatchGeometry = jest.fn();
const mockReleaseGeometry = jest.fn();
let mockGeometryChanged: () => void;

jest.mock('react-native', () => ({
    ScrollView: 'ScrollView',
    findNodeHandle: (input: any) => input?.nativeTag ?? null,
    Dimensions: { get: () => ({ width: 400, height: mockWindowHeight }) },
    PixelRatio: { get: () => mockDensity },
    NativeModules: {
        KeyboardModule: { getWindowGeometry: () => mockGeometry() },
        DeviceUtilsModule: { supportsAndroidWindowLayout: false },
    },
    Keyboard: {
        addListener: (name: string, listener: () => void) => {
            mockNativeHandlers[name] = listener;
            return { remove: () => { mockRemoved(name); delete mockNativeHandlers[name]; } };
        },
    },
    Animated: {
        Value: class { value: number; constructor(value: number) { this.value = value; } },
        View: 'AnimatedView',
        timing: (value: any, options: any) => ({
            start: (callback?: () => void) => {
                value.value = options.toValue;
                mockAnimations.push(options);
                if (callback && mockDeferAnimation) mockAnimationCompletions.push(callback);
                else callback?.();
            },
        }),
    },
    Platform: { OS: 'android', select: (values: any) => values.android },
    TextInput: { State: { currentlyFocusedInput: () => mockFocusedInput } },
}));
jest.mock('@common/helpers/androidKeyboardGeometry', () => ({
    watchAndroidKeyboardGeometry: (callback: () => void) => mockWatchGeometry(callback),
}));
jest.mock('@common/helpers/keyboard', () => ({
    __esModule: true,
    default: { addListener: jest.fn(), removeListener: jest.fn() },
}));
jest.mock('../styles', () => ({ __esModule: true, default: { contentContainer: { flex: 1 } } }));

// RN Android returns a physical origin and an untransformed height. Geometry
// and measurements below are isolated native API fixtures, not device proof.
const fixture = ({ initialHeight = 411, height = initialHeight, scale = 0.5, inputY = 250, inputHeight = 40,
    scrollY = 20, scrollHeight = 800, scrollPosition = 25, extraOffset = 8,
    context = true, fullPane = false, os = 'android', calculateExtraOffset, defer = false,
    onKeyboardShow, onKeyboardHide,
    enabled = true }: any = {}) => {
    // eslint-disable-next-line global-require
    const { Platform } = require('react-native');
    Platform.OS = os;
    mockWindowHeight = initialHeight;
    const view: any = new KeyboardAwareScrollView({
        children: null, enabled, extraOffset, calculateExtraOffset, onKeyboardShow, onKeyboardHide,
    });
    view.context = context ? { left: 0, width: 400, height: 800, columnWidth: 337, scale,
        ...(fullPane ? { fullPane: true } : {}) } : undefined;
    let pendingMeasure: any;
    const inputMeasure = jest.fn((callback) => callback(0, inputY, 100, inputHeight));
    mockFocusedInput = { nativeTag: 1, measureInWindow: inputMeasure };
    const input = mockFocusedInput;
    const scrollTo = jest.fn();
    view.scrollViewRef.current = {
        getScrollResponder: () => ({}), scrollTo,
        measureInWindow: (callback: any) => {
            if (defer) pendingMeasure = callback;
            else callback(0, scrollY, 400, scrollHeight);
        },
    };
    view.scrollPosition = { x: 0, y: scrollPosition };
    view.componentDidMount();
    mockWindowHeight = height;
    view.keyboardHeight = 703;
    view.keyboardVisible = true;
    return { view, scrollTo, input, inputMeasure, finishMeasure: () => pendingMeasure(0, scrollY, 400, scrollHeight) };
};

const flushMicrotasks = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockAnimations.length = 0;
    mockDeferAnimation = false;
    mockAnimationCompletions.length = 0;
    Object.keys(mockNativeHandlers).forEach((name) => delete mockNativeHandlers[name]);
    mockWatchGeometry.mockImplementation((callback) => {
        mockGeometryChanged = callback;
        return mockReleaseGeometry;
    });
    mockGeometry = jest.fn().mockResolvedValue({ keyboardTop: 211, visible: true });
    NativeModules.KeyboardModule.getWindowGeometry = () => mockGeometry();
    NativeModules.DeviceUtilsModule.supportsAndroidWindowLayout = false;
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

describe('adaptive Android keyboard coordinates', () => {
    it('includes the native outer scroll padding when keeping the complete pane field above the IME', async () => {
        // Actual short-pane Add Contact measurements. Inner-relative coordinates
        // omit the native ScrollView's 20.19dp padding and hid 45 physical pixels.
        const scrollY = 56;
        const inputHeight = 59.80952453613281;
        const keyboardTop = 121.9047619047619;
        const innerY = 30.4761905670166;
        const outerY = 50.66666793823242;
        mockGeometry.mockResolvedValue({ keyboardTop, visible: true });
        const { view, input, scrollTo } = fixture({ scale: 1, fullPane: true, scrollY,
            scrollHeight: 210.2857208251953, inputY: 79.23809814453125, inputHeight,
            scrollPosition: 27.428571701049805, extraOffset: 0 });
        const inner = { nativeTag: 9 };
        const outer = { nativeTag: 10 };
        view.scrollViewRef.current.getInnerViewRef = () => inner;
        view.scrollViewRef.current.getNativeScrollRef = () => outer;
        input.measureLayout = jest.fn((relative, success) => {
            success(0, relative === outer ? outerY : innerY, 100, inputHeight);
        });
        await view.scrollToFocusedTextInput();
        jest.runOnlyPendingTimers();
        const finalTop = scrollY + outerY - scrollTo.mock.calls[0][0].y;
        expect(finalTop - 2).toBeGreaterThanOrEqual(scrollY);
        expect(finalTop + inputHeight + 2).toBeLessThanOrEqual(keyboardTop);
        expect(input.measureLayout).toHaveBeenCalledWith(outer, expect.any(Function), expect.any(Function));
        view.componentWillUnmount();
    });

    it.each([0, 25])('uses content coordinates despite an intervening native scroll from %s', async (initialY) => {
        mockGeometry.mockResolvedValue({ keyboardTop: 122, visible: true });
        const { view, input, scrollTo } = fixture({ scale: 1, scrollY: 52, scrollHeight: 210,
            inputY: 102, inputHeight: 60, scrollPosition: initialY, extraOffset: 0 });
        view.context.fullPane = true;
        const inner = { nativeTag: 9 };
        view.scrollViewRef.current.getNativeScrollRef = () => inner;
        input.measureLayout = jest.fn((relative, success) => {
            expect(relative).toBe(inner);
            success(0, initialY + 50, 100, 60);
        });
        mockDeferAnimation = true;
        await view.scrollToFocusedTextInput();
        // RN Android can scroll a focused descendant during the padding animation.
        view.handleOnScroll({ nativeEvent: { contentOffset: { x: 0, y: initialY + 9 / mockDensity } } });
        mockAnimationCompletions.splice(0).forEach((complete) => complete());
        jest.runOnlyPendingTimers();
        expect(input.measureLayout).toHaveBeenCalledTimes(1);
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: initialY + 45, animated: true });
        const finalTop = 52 + initialY + 50 - scrollTo.mock.calls[0][0].y;
        expect(finalTop - 2).toBeGreaterThanOrEqual(52);
        expect(finalTop + 60 + 2).toBeLessThanOrEqual(122);
        view.componentWillUnmount();
    });

    it('ignores a late content-coordinate reply after the keyboard hides', async () => {
        const { view, input, scrollTo } = fixture({ scale: 1 });
        view.context.fullPane = true;
        view.scrollViewRef.current.getNativeScrollRef = () => ({ nativeTag: 9 });
        let complete: (...values: number[]) => void = () => undefined;
        input.measureLayout = (_relative: any, success: typeof complete) => { complete = success; };
        const pending = view.scrollToFocusedTextInput();
        await flushMicrotasks();
        view.onNativeKeyboardHide();
        complete(0, 250, 100, 40);
        await pending;
        jest.runOnlyPendingTimers();
        expect(scrollTo).not.toHaveBeenCalled();
        view.componentWillUnmount();
    });

    it('replaces a canceled pane reply when the same-scale screen returns to normal mode', async () => {
        const { view, input, scrollTo } = fixture({ scale: 1, fullPane: true, extraOffset: 0 });
        view.scrollViewRef.current.getNativeScrollRef = () => ({ nativeTag: 9 });
        let complete: (...values: number[]) => void = () => undefined;
        input.measureLayout = jest.fn((_relative: any, success: typeof complete) => { complete = success; });
        const pending = view.scrollToFocusedTextInput();
        await flushMicrotasks();
        view.context.fullPane = false;
        view.componentDidUpdate();
        complete(0, 250, 100, 40);
        await pending;
        await flushMicrotasks();
        jest.runOnlyPendingTimers();
        expect(input.measureLayout).toHaveBeenCalledTimes(1);
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 124, animated: true });
        view.componentWillUnmount();
    });

    it('retains normal adaptive scrolling without querying pane content coordinates', async () => {
        mockGeometry.mockResolvedValue({ keyboardTop: 122, visible: true });
        const { view, input, scrollTo } = fixture({ scale: 1, scrollY: 52, scrollHeight: 210,
            inputY: 102, inputHeight: 60, scrollPosition: 0, extraOffset: 0 });
        view.scrollViewRef.current.getNativeScrollRef = () => ({ nativeTag: 9 });
        input.measureLayout = jest.fn();
        mockDeferAnimation = true;
        await view.scrollToFocusedTextInput();
        view.handleOnScroll({ nativeEvent: { contentOffset: { x: 0, y: 9 / mockDensity } } });
        mockAnimationCompletions.splice(0).forEach((complete) => complete());
        jest.runOnlyPendingTimers();
        expect(input.measureLayout).not.toHaveBeenCalled();
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 60 + 9 / mockDensity, animated: true });
        view.componentWillUnmount();
    });

    it.each([
        { width: 300, height: 210, x: 0, y: 0 },
        { width: 407, height: 210, x: 0, y: 30 },
    ])('remeasures focus after a same-height pane layout change %j', async (layout) => {
        const { view, inputMeasure, scrollTo } = fixture({ scale: 1, scrollY: 20, scrollHeight: 210,
            inputY: 160, inputHeight: 40, scrollPosition: 0, extraOffset: 0 });
        view.context.fullPane = true;
        view.keyboardVisible = false;
        view.handleLayout({ nativeEvent: { layout: { width: 407, height: 210, x: 0, y: 0 } } });
        view.keyboardVisible = true;
        await view.scrollToFocusedTextInput();
        expect(inputMeasure).toHaveBeenCalledTimes(1);
        inputMeasure.mockImplementation((callback: any) => callback(0, 240, 100, 40));
        view.handleLayout({ nativeEvent: { layout } });
        await flushMicrotasks();
        jest.runOnlyPendingTimers();
        expect(inputMeasure).toHaveBeenCalledTimes(2);
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 89, animated: true });
        view.componentWillUnmount();
    });

    it('keeps the normal-layout trigger unchanged for a same-height width change', async () => {
        const { view, inputMeasure, scrollTo } = fixture({ scale: 1, scrollY: 20, scrollHeight: 210,
            inputY: 160, inputHeight: 40, scrollPosition: 0, extraOffset: 0 });
        view.keyboardVisible = false;
        view.handleLayout({ nativeEvent: { layout: { width: 407, height: 210, x: 0, y: 0 } } });
        view.keyboardVisible = true;
        await view.scrollToFocusedTextInput();
        inputMeasure.mockImplementation((callback: any) => callback(0, 240, 100, 40));
        view.handleLayout({ nativeEvent: { layout: { width: 300, height: 210, x: 0, y: 0 } } });
        await flushMicrotasks();
        jest.runOnlyPendingTimers();
        expect(inputMeasure).toHaveBeenCalledTimes(1);
        expect(scrollTo).not.toHaveBeenCalled();
        view.componentWillUnmount();
    });

    it('reduces pane clearance when a field only just fits above the actual IME', async () => {
        // Same native coordinate origin: compact Header leaves70dp visible,
        // and a60dp field must keep its top inside that measured scroll view.
        mockGeometry.mockResolvedValue({ keyboardTop: 122, visible: true });
        const { view, scrollTo } = fixture({ scale: 1, scrollY: 52, scrollHeight: 210,
            inputY: 102, inputHeight: 60, scrollPosition: 0, extraOffset: 0 });
        view.context.fullPane = true;
        await view.scrollToFocusedTextInput();
        jest.runOnlyPendingTimers();
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 50, animated: true });
        const finalTop = 102 - scrollTo.mock.calls[0][0].y;
        expect(finalTop).toBeGreaterThanOrEqual(52);
        expect(finalTop + 60).toBeLessThanOrEqual(122);
        view.componentWillUnmount();
    });

    it('recovers a focused pane input already scrolled above its own viewport', async () => {
        mockGeometry.mockResolvedValue({ keyboardTop: 122, visible: true });
        const { view, scrollTo } = fixture({ scale: 1, scrollY: 52, scrollHeight: 210,
            inputY: 32, inputHeight: 60, scrollPosition: 80, extraOffset: 0 });
        view.context.fullPane = true;
        await view.scrollToFocusedTextInput();
        jest.runOnlyPendingTimers();
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 60, animated: true });
        view.componentWillUnmount();
    });

    it('aligns an oversized pane field at the viewport top instead of hiding its start', async () => {
        mockGeometry.mockResolvedValue({ keyboardTop: 122, visible: true });
        const { view, scrollTo } = fixture({ scale: 1, scrollY: 107, scrollHeight: 160,
            inputY: 158, inputHeight: 60, scrollPosition: 0, extraOffset: 0 });
        view.context.fullPane = true;
        await view.scrollToFocusedTextInput();
        jest.runOnlyPendingTimers();
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 51, animated: true });
        expect(158 - scrollTo.mock.calls[0][0].y).toBe(107);
        view.componentWillUnmount();
    });

    it('scrolls a focused field clipped by a pane card even when it is already above the IME', async () => {
        mockGeometry.mockResolvedValue({ keyboardTop: 200, visible: true });
        const { view, scrollTo } = fixture({ scale: 1, scrollY: 40, scrollHeight: 100,
            inputY: 150, inputHeight: 40, scrollPosition: 0, extraOffset: 0 });
        view.context.fullPane = true;
        await view.scrollToFocusedTextInput();
        jest.runOnlyPendingTimers();
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 70, animated: true });
        view.componentWillUnmount();
    });
    it('ignores a stale inflated height and uses current native top after fullscreen to split', async () => {
        const { view, scrollTo } = fixture({ initialHeight: 914, height: 411 });
        await view.scrollToFocusedTextInput();
        jest.runOnlyPendingTimers();
        expect(view.keyboardHeight).toBe(703);
        expect(mockAnimations).toEqual([{ toValue: 447, useNativeDriver: false, duration: 200 }]);
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 163, animated: true });
    });

    it('corrects the actual early visible=true/top383 snapshot when the native frame reports top121', async () => {
        const { view, scrollTo } = fixture();
        mockGeometry.mockResolvedValue({ keyboardTop: 383, visible: true });
        await view.scrollToFocusedTextInput();
        expect(scrollTo).not.toHaveBeenCalled();
        mockGeometry.mockResolvedValue({ keyboardTop: 121, visible: true });
        mockGeometryChanged();
        await flushMicrotasks();
        jest.runOnlyPendingTimers();
        expect(mockWatchGeometry).toHaveBeenCalledTimes(1);
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 343, animated: true });
    });

    it.each(['hide', 'context', 'unmount'])('releases the lazy native geometry lease on %s', async (action) => {
        const { view } = fixture();
        expect(mockWatchGeometry).not.toHaveBeenCalled();
        await view.scrollToFocusedTextInput();
        const oldSignal = mockGeometryChanged;
        if (action === 'hide') view.onKeyboardHide();
        if (action === 'context') { view.context = undefined; view.componentDidUpdate(); }
        if (action === 'unmount') view.componentWillUnmount();
        const queries = mockGeometry.mock.calls.length;
        oldSignal();
        await flushMicrotasks();
        expect(mockReleaseGeometry).toHaveBeenCalledTimes(1);
        expect(mockGeometry).toHaveBeenCalledTimes(queries);
    });

    it('requeries current visibility instead of trusting a queued old geometry payload', async () => {
        const { view } = fixture();
        await view.scrollToFocusedTextInput();
        (mockGeometryChanged as any)({ visible: false });
        await flushMicrotasks();
        expect(view.keyboardVisible).toBe(true);
        expect(mockReleaseGeometry).not.toHaveBeenCalled();
        mockGeometry.mockResolvedValue({ keyboardTop: 800, visible: false });
        mockGeometryChanged();
        await flushMicrotasks();
        expect(view.keyboardVisible).toBe(false);
        expect(mockReleaseGeometry).toHaveBeenCalledTimes(1);
    });

    it('balances a lease whose first signal arrives during registration', async () => {
        mockWatchGeometry.mockImplementationOnce((callback) => {
            callback();
            return mockReleaseGeometry;
        });
        const { view } = fixture();
        await view.scrollToFocusedTextInput();
        await flushMicrotasks();
        expect(mockWatchGeometry).toHaveBeenCalledTimes(1);
        view.onKeyboardHide();
        expect(mockReleaseGeometry).toHaveBeenCalledTimes(1);
    });

    it.each(['android', 'ios'])('never leases geometry observation for ordinary %s', async (os) => {
        const { view } = fixture({ context: os === 'ios', os });
        await view.scrollToFocusedTextInput();
        expect(mockWatchGeometry).not.toHaveBeenCalled();
    });

    it('permits native scrolling above the IME when a retained split form has short content', async () => {
        // Actual v4 native failure: the old padding left maxScroll at33.905,
        // so the field stopped104.65 physical pixels below the real IME top.
        const scale = 0.45;
        const viewport = 633.904785156;
        const naturalContent = 353.777748148;
        const top = 121.9047619;
        const inputHeight = 59.809524536;
        const unscrolledY = 134.857147217 + 33.904762268 * scale;
        mockGeometry.mockResolvedValue({ keyboardTop: top, visible: true });
        const { view, scrollTo } = fixture({ initialHeight: 914.2857, height: 411.4286, scale,
            inputY: unscrolledY, inputHeight, scrollY: 32.380950928, scrollHeight: viewport,
            scrollPosition: 0, extraOffset: 0 });
        let actualScroll = 0;
        let maximumScroll = 0;
        scrollTo.mockImplementation(({ y }) => {
            const padding = mockAnimations[mockAnimations.length - 1].toValue;
            // Android clamps the requested offset to its pixel-rounded range.
            const contentPixels = Math.floor((naturalContent + padding) * mockDensity);
            const viewportPixels = Math.ceil(viewport * mockDensity);
            maximumScroll = Math.max(0, (contentPixels - viewportPixels) / mockDensity);
            actualScroll = Math.min(Math.round(y * mockDensity) / mockDensity, maximumScroll);
        });
        await view.scrollToFocusedTextInput();
        jest.runOnlyPendingTimers();
        const requested = scrollTo.mock.calls[0][0].y;
        expect(maximumScroll).toBeGreaterThanOrEqual(requested);
        const finalBottom = unscrolledY + inputHeight * scale - actualScroll * scale;
        expect(Math.ceil(finalBottom * mockDensity)).toBeLessThanOrEqual(Math.floor(top * mockDensity));
        expect(actualScroll).toBeGreaterThan(33.905);
    });

    it('reserves manual range for lower fields while the focused Name is already above the IME', async () => {
        // Fresh Name-first native failure: content353.905 < viewport633.905,
        // padding0 and maxScroll0 left Address/Tag unreachable by a real swipe.
        const scale = 0.45;
        const viewport = 633.904785156;
        const naturalContent = 353.904754639;
        const top = 121.9047619;
        mockGeometry.mockResolvedValue({ keyboardTop: top, visible: true });
        const { view, scrollTo } = fixture({ scale, inputY: 55.238095238, inputHeight: 59.809524536,
            scrollY: 32.380950928, scrollHeight: viewport, scrollPosition: 0, extraOffset: 0 });
        await view.scrollToFocusedTextInput();
        jest.runOnlyPendingTimers();
        expect(scrollTo).not.toHaveBeenCalled();
        expect(view.scrollPosition.y).toBe(0);
        const padding = mockAnimations[mockAnimations.length - 1]?.toValue ?? 0;
        const maximumScroll = Math.max(0, (Math.floor((naturalContent + padding) * mockDensity) -
            Math.ceil(viewport * mockDensity)) / mockDensity);
        const tagBottom = (539 - 74) / mockDensity;
        const manualScroll = (tagBottom - top) / scale + 20;
        expect(maximumScroll).toBeGreaterThanOrEqual(manualScroll);
        expect(Math.ceil((tagBottom - manualScroll * scale) * mockDensity))
            .toBeLessThanOrEqual(Math.floor(top * mockDensity));
    });

    it('does not shrink an existing manual range on visible focus and clears it on Hide', async () => {
        let clearance = 1000;
        const { view, scrollTo } = fixture({ calculateExtraOffset: () => clearance });
        await view.scrollToFocusedTextInput();
        jest.runOnlyPendingTimers();
        const previousPadding = mockAnimations[0].toValue;
        // The user has manually scrolled the last input near the viewport top.
        view.scrollPosition = { x: 0, y: 950 };
        scrollTo.mockClear();
        clearance = 0;
        mockFocusedInput = { nativeTag: 2, measureInWindow: (callback: any) => callback(0, 25, 100, 40) };
        view.render().props.onFocus({ nativeEvent: { target: 2 } });
        await flushMicrotasks();
        jest.runOnlyPendingTimers();
        expect(mockAnimations).toHaveLength(1);
        expect(view.state.offset.value).toBe(previousPadding);
        expect(1000 + previousPadding - 800).toBeGreaterThanOrEqual(view.scrollPosition.y);
        expect(scrollTo).not.toHaveBeenCalled();
        mockNativeHandlers.keyboardDidHide();
        mockNativeHandlers.keyboardDidShow();
        await flushMicrotasks();
        jest.runOnlyPendingTimers();
        expect(mockAnimations[mockAnimations.length - 1].toValue).toBe(447);
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it('reserves caller clearance even when the last input is below a much taller viewport', async () => {
        const scale = 1;
        const viewport = 1000;
        const naturalContent = 100;
        const calculate = jest.fn(() => 300);
        mockGeometry.mockResolvedValue({ keyboardTop: 200, visible: true });
        const { view, scrollTo, input } = fixture({ scale, inputY: 80, inputHeight: 20,
            scrollY: 0, scrollHeight: viewport, scrollPosition: 0, extraOffset: 0, calculateExtraOffset: calculate });
        let actualScroll = 0;
        scrollTo.mockImplementation(({ y }) => {
            const padding = mockAnimations[mockAnimations.length - 1].toValue;
            actualScroll = Math.min(y, Math.max(0, naturalContent + padding - viewport));
        });
        await view.scrollToFocusedTextInput();
        jest.runOnlyPendingTimers();
        expect(calculate).toHaveBeenCalledWith(input, 20);
        expect(actualScroll).toBe(scrollTo.mock.calls[0][0].y);
        expect(100 + 300 - actualScroll).toBeLessThan(200);
    });

    it('remembers ordinary RN visibility for adaptive entry without a second Show event', async () => {
        const onShow = jest.fn();
        const { view, scrollTo } = fixture({ context: false, onKeyboardShow: onShow });
        view.keyboardVisible = false;
        mockNativeHandlers.keyboardDidShow();
        expect(mockGeometry).not.toHaveBeenCalled();
        expect(mockWatchGeometry).not.toHaveBeenCalled();
        expect(onShow).not.toHaveBeenCalled();
        view.context = { left: 0, width: 400, height: 800, columnWidth: 337, scale: 0.5 };
        view.componentDidUpdate();
        await flushMicrotasks();
        jest.runOnlyPendingTimers();
        expect(mockGeometry).toHaveBeenCalledTimes(1);
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 163, animated: true });
    });

    it('does not query adaptive entry after an ordinary RN Hide', async () => {
        const onShow = jest.fn();
        const onHide = jest.fn();
        const { view } = fixture({ context: false, onKeyboardShow: onShow, onKeyboardHide: onHide });
        mockNativeHandlers.keyboardDidShow();
        mockNativeHandlers.keyboardDidHide();
        view.context = { left: 0, width: 400, height: 800, columnWidth: 337, scale: 0.5 };
        view.componentDidUpdate();
        await flushMicrotasks();
        expect(mockGeometry).not.toHaveBeenCalled();
        expect(mockWatchGeometry).not.toHaveBeenCalled();
        expect(mockAnimations).toEqual([]);
        expect(onShow).not.toHaveBeenCalled();
        expect(onHide).not.toHaveBeenCalled();
    });

    it('keeps caller offsets and the callback input height in logical units', async () => {
        const calculate = jest.fn((input, inputHeight) => inputHeight + 10);
        const { view, scrollTo, input } = fixture({ calculateExtraOffset: calculate });
        await view.scrollToFocusedTextInput();
        jest.advanceTimersByTime(9);
        expect(scrollTo).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(calculate).toHaveBeenCalledWith(input, 40);
        expect(mockAnimations[0].toValue).toBe(497);
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 213, animated: true });
    });

    it('reserves padding without scrolling when the scaled bottom is already above the native top', async () => {
        const { view, scrollTo } = fixture({ inputY: 190 });
        await view.scrollToFocusedTextInput();
        jest.runOnlyPendingTimers();
        expect(mockAnimations).toEqual([{ toValue: 447, useNativeDriver: false, duration: 200 }]);
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it.each(['android', 'ios'])('keeps the ordinary %s formula and timer unchanged', async (os) => {
        const { view, scrollTo } = fixture({ initialHeight: 914, height: 411, inputY: 750, context: os === 'ios', os });
        view.keyboardHeight = 300;
        await view.scrollToFocusedTextInput();
        jest.runOnlyPendingTimers();
        expect(mockGeometry).not.toHaveBeenCalled();
        expect(mockAnimations).toEqual([{ toValue: 284, useNativeDriver: false, duration: 200 }]);
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 221, animated: true });
    });

    it('does not move an already visible Tag after a split-created form returns fullscreen', async () => {
        // Native v6: the constructor retained411.429dp after the window became914.286dp.
        // Tag1039..1197px already fitted above the real IME at1517px before refocus.
        // The measured post-scroll145.142852783 + actual scroll198.857147217 restores344dp.
        const { view, scrollTo } = fixture({ initialHeight: 411.428571429, height: 914.285714286,
            context: false, inputY: 344, inputHeight: 60.190475464,
            scrollY: 82.666664124, scrollPosition: 0, extraOffset: 0 });
        NativeModules.DeviceUtilsModule.supportsAndroidWindowLayout = true;
        view.onKeyboardShow({ endCoordinates: { height: 336.380952381 } });
        await flushMicrotasks();
        jest.runOnlyPendingTimers();
        expect(view.windowHeight).toBe(411.428571429);
        expect(mockGeometry).not.toHaveBeenCalled();
        expect(mockAnimations).toEqual([]);
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it('reads the live height after pending native measurements finish', async () => {
        const { view, scrollTo, finishMeasure } = fixture({ initialHeight: 411, height: 411,
            context: false, inputY: 370, inputHeight: 60, defer: true });
        NativeModules.DeviceUtilsModule.supportsAndroidWindowLayout = true;
        view.keyboardHeight = 336;
        const pending = view.scrollToFocusedTextInput();
        mockWindowHeight = 914;
        finishMeasure();
        await pending;
        jest.runOnlyPendingTimers();
        expect(mockAnimations).toEqual([]);
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it('keeps the same fullscreen native Android formula and timer without a resize', async () => {
        const { view, scrollTo } = fixture({ initialHeight: 914, height: 914, context: false, inputY: 750 });
        NativeModules.DeviceUtilsModule.supportsAndroidWindowLayout = true;
        view.keyboardHeight = 300;
        await view.scrollToFocusedTextInput();
        expect(mockAnimations).toEqual([{ toValue: 284, useNativeDriver: false, duration: 200 }]);
        jest.advanceTimersByTime(9);
        expect(scrollTo).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 221, animated: true });
    });

    it.each([0, -1, NaN, Infinity])('retains the captured height when live height is invalid: %s', async (height) => {
        const { view, scrollTo } = fixture({ initialHeight: 914, height, context: false, inputY: 750 });
        NativeModules.DeviceUtilsModule.supportsAndroidWindowLayout = true;
        view.keyboardHeight = 300;
        await view.scrollToFocusedTextInput();
        jest.runOnlyPendingTimers();
        expect(mockAnimations).toEqual([{ toValue: 284, useNativeDriver: false, duration: 200 }]);
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 221, animated: true });
    });

    it('retains the captured iOS height even if a native module exposes the Android support flag', async () => {
        const { view, scrollTo } = fixture({ initialHeight: 914, height: 411, inputY: 750, context: false, os: 'ios' });
        NativeModules.DeviceUtilsModule.supportsAndroidWindowLayout = true;
        view.keyboardHeight = 300;
        await view.scrollToFocusedTextInput();
        jest.runOnlyPendingTimers();
        expect(mockAnimations).toEqual([{ toValue: 284, useNativeDriver: false, duration: 200 }]);
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 221, animated: true });
    });

    it.each(['missing', 'null', 'rejected'])('uses the exact legacy formula if native query is %s', async (mode) => {
        const { view, scrollTo } = fixture({ initialHeight: 914, height: 411 });
        if (mode === 'missing') delete NativeModules.KeyboardModule.getWindowGeometry;
        if (mode === 'null') mockGeometry.mockResolvedValue(null);
        if (mode === 'rejected') mockGeometry.mockRejectedValue(new Error('window unavailable'));
        await view.scrollToFocusedTextInput();
        jest.runOnlyPendingTimers();
        expect(mockAnimations).toEqual([{ toValue: 187, useNativeDriver: false, duration: 200 }]);
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 124, animated: true });
    });

    it('recovers through the standard event when the custom popup event is missed', async () => {
        const { view, scrollTo } = fixture({ initialHeight: 914, height: 411 });
        view.keyboardHeight = 0;
        view.keyboardVisible = false;
        mockNativeHandlers.keyboardDidShow();
        await flushMicrotasks();
        jest.runOnlyPendingTimers();
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 163, animated: true });
    });

    it('deduplicates concurrent standard and custom show events', async () => {
        const { view, scrollTo } = fixture();
        mockNativeHandlers.keyboardDidShow();
        view.onKeyboardShow({ endCoordinates: { height: 703 } });
        await flushMicrotasks();
        jest.runOnlyPendingTimers();
        expect(mockGeometry).toHaveBeenCalledTimes(2);
        expect(mockAnimations).toHaveLength(1);
        expect(scrollTo).toHaveBeenCalledTimes(1);
    });

    it('does not cancel an already pending scroll when a duplicate event queries the same geometry', async () => {
        const { view, scrollTo } = fixture();
        await view.scrollToFocusedTextInput();
        mockNativeHandlers.keyboardDidShow();
        await flushMicrotasks();
        jest.runOnlyPendingTimers();
        expect(mockAnimations).toHaveLength(1);
        expect(scrollTo).toHaveBeenCalledTimes(1);
    });

    it('does not enter the legacy formula for an unready standard-event geometry query', async () => {
        const { scrollTo } = fixture({ initialHeight: 914, height: 411 });
        mockGeometry.mockResolvedValue(null);
        mockNativeHandlers.keyboardDidShow();
        await flushMicrotasks();
        jest.runOnlyPendingTimers();
        expect(mockAnimations).toEqual([]);
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it('does not subscribe to standard supplements when the native method is absent', async () => {
        delete NativeModules.KeyboardModule.getWindowGeometry;
        const { view, scrollTo } = fixture({ initialHeight: 914, height: 411 });
        expect(mockNativeHandlers.keyboardDidShow).toBeUndefined();
        view.onNativeKeyboardShow();
        await flushMicrotasks();
        jest.runOnlyPendingTimers();
        expect(mockGeometry).not.toHaveBeenCalled();
        expect(mockAnimations).toEqual([]);
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it('does not query or scroll ordinary Android for the new standard callbacks', async () => {
        const { scrollTo } = fixture({ context: false });
        mockNativeHandlers.keyboardDidShow();
        mockNativeHandlers.keyboardDidHide();
        await flushMicrotasks();
        jest.runOnlyPendingTimers();
        expect(mockGeometry).not.toHaveBeenCalled();
        expect(mockAnimations).toEqual([]);
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it('treats explicit native hidden visibility as a hide and does not repeat its animation', async () => {
        const onHide = jest.fn();
        const { view, scrollTo } = fixture({ onKeyboardHide: onHide, inputY: 190 });
        await view.scrollToFocusedTextInput();
        mockGeometry.mockResolvedValue({ keyboardTop: 800, visible: false });
        await view.scrollToFocusedTextInput();
        mockNativeHandlers.keyboardDidHide();
        view.onKeyboardHide();
        jest.runOnlyPendingTimers();
        expect(mockAnimations.map((animation) => animation.duration)).toEqual([200, 300]);
        expect(onHide).toHaveBeenCalledTimes(1);
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it('notifies the parent once for standard-only verified show and hide', async () => {
        const onShow = jest.fn();
        const onHide = jest.fn();
        fixture({ onKeyboardShow: onShow, onKeyboardHide: onHide });
        mockNativeHandlers.keyboardDidShow();
        expect(onShow).not.toHaveBeenCalled();
        await flushMicrotasks();
        expect(onShow).toHaveBeenCalledTimes(1);
        mockNativeHandlers.keyboardDidHide();
        mockNativeHandlers.keyboardDidHide();
        expect(onHide).toHaveBeenCalledTimes(1);
    });

    it('deduplicates parent callbacks across standard and custom events', async () => {
        const onShow = jest.fn();
        const onHide = jest.fn();
        const { view } = fixture({ onKeyboardShow: onShow, onKeyboardHide: onHide });
        mockNativeHandlers.keyboardDidShow();
        view.onKeyboardShow({ endCoordinates: { height: 703 } });
        await flushMicrotasks();
        view.onKeyboardShow({ endCoordinates: { height: 703 } });
        await flushMicrotasks();
        view.onKeyboardHide();
        mockNativeHandlers.keyboardDidHide();
        view.onKeyboardHide();
        expect(onShow).toHaveBeenCalledTimes(1);
        expect(onHide).toHaveBeenCalledTimes(1);
    });

    it('does not notify either parent callback for an initially hidden native query', async () => {
        const onShow = jest.fn();
        const onHide = jest.fn();
        const { view } = fixture({ onKeyboardShow: onShow, onKeyboardHide: onHide });
        mockGeometry.mockResolvedValue({ keyboardTop: 800, visible: false });
        view.onKeyboardShow({ endCoordinates: { height: 703 } });
        await flushMicrotasks();
        mockNativeHandlers.keyboardDidHide();
        view.onKeyboardHide();
        expect(onShow).not.toHaveBeenCalled();
        expect(onHide).not.toHaveBeenCalled();
    });

    it.each(['null', 'rejected'])('retains the legacy custom callback and timing for %s geometry', async (mode) => {
        const onShow = jest.fn();
        const onHide = jest.fn();
        const { view, scrollTo } = fixture({ initialHeight: 914, onKeyboardShow: onShow, onKeyboardHide: onHide });
        if (mode === 'null') mockGeometry.mockResolvedValue(null);
        else mockGeometry.mockRejectedValue(new Error('window unavailable'));
        view.onKeyboardShow({ endCoordinates: { height: 703 } });
        await flushMicrotasks();
        expect(onShow).toHaveBeenCalledTimes(1);
        expect(mockAnimations).toEqual([{ toValue: 187, useNativeDriver: false, duration: 200 }]);
        jest.advanceTimersByTime(9);
        expect(scrollTo).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 124, animated: true });
        mockNativeHandlers.keyboardDidHide();
        expect(onHide).toHaveBeenCalledTimes(1);
    });

    it.each(['null', 'rejected'])('does not repeat a parent Show when a duplicate query is %s', async (mode) => {
        const onShow = jest.fn();
        const { view } = fixture({ onKeyboardShow: onShow });
        mockNativeHandlers.keyboardDidShow();
        await flushMicrotasks();
        if (mode === 'null') mockGeometry.mockResolvedValue(null);
        else mockGeometry.mockRejectedValue(new Error('window unavailable'));
        view.onKeyboardShow({ endCoordinates: { height: 703 } });
        await flushMicrotasks();
        expect(onShow).toHaveBeenCalledTimes(1);
    });

    it('balances an adaptive parent Show through RN-only Hide after context loss', async () => {
        const onShow = jest.fn();
        const onHide = jest.fn();
        const { view } = fixture({ onKeyboardShow: onShow, onKeyboardHide: onHide });
        mockNativeHandlers.keyboardDidShow();
        await flushMicrotasks();
        view.context = undefined;
        view.componentDidUpdate();
        mockNativeHandlers.keyboardDidHide();
        view.onKeyboardHide();
        expect(onShow).toHaveBeenCalledTimes(1);
        expect(onHide).toHaveBeenCalledTimes(1);
        expect(view.keyboardVisible).toBe(false);
    });

    it('does not repeat a completed adaptive Hide when the custom Hide follows context loss', async () => {
        const onHide = jest.fn();
        const { view } = fixture({ onKeyboardHide: onHide });
        mockNativeHandlers.keyboardDidShow();
        await flushMicrotasks();
        mockNativeHandlers.keyboardDidHide();
        view.context = undefined;
        view.componentDidUpdate();
        view.onKeyboardHide();
        expect(onHide).toHaveBeenCalledTimes(1);
        view.onKeyboardShow({ endCoordinates: { height: 703 } });
        view.onKeyboardHide();
        expect(onHide).toHaveBeenCalledTimes(2);
    });

    it('notifies verified visibility with scrolling disabled', async () => {
        const onShow = jest.fn();
        const onHide = jest.fn();
        const { scrollTo } = fixture({ enabled: false, onKeyboardShow: onShow, onKeyboardHide: onHide });
        mockNativeHandlers.keyboardDidShow();
        await flushMicrotasks();
        mockNativeHandlers.keyboardDidHide();
        expect(onShow).toHaveBeenCalledTimes(1);
        expect(onHide).toHaveBeenCalledTimes(1);
        expect(mockAnimations).toEqual([]);
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it('invalidates adaptive work on context loss without inventing a keyboard hide or duplicate show', async () => {
        const onShow = jest.fn();
        const onHide = jest.fn();
        const { view, scrollTo } = fixture({ onKeyboardShow: onShow, onKeyboardHide: onHide });
        await view.scrollToFocusedTextInput();
        const { context } = view;
        view.context = undefined;
        view.componentDidUpdate();
        jest.runOnlyPendingTimers();
        expect(scrollTo).not.toHaveBeenCalled();
        expect(onShow).toHaveBeenCalledTimes(1);
        expect(onHide).not.toHaveBeenCalled();
        view.context = context;
        view.componentDidUpdate();
        mockNativeHandlers.keyboardDidShow();
        await flushMicrotasks();
        expect(onShow).toHaveBeenCalledTimes(1);
        mockNativeHandlers.keyboardDidHide();
        expect(onHide).toHaveBeenCalledTimes(1);
    });

    it('clears parent visibility through the legacy hide after the context becomes ordinary', async () => {
        const onShow = jest.fn();
        const onHide = jest.fn();
        const { view } = fixture({ onKeyboardShow: onShow, onKeyboardHide: onHide });
        await view.scrollToFocusedTextInput();
        const { context } = view;
        view.context = undefined;
        view.componentDidUpdate();
        view.onKeyboardHide();
        view.context = context;
        view.componentDidUpdate();
        mockNativeHandlers.keyboardDidShow();
        await flushMicrotasks();
        expect(onShow).toHaveBeenCalledTimes(2);
        expect(onHide).toHaveBeenCalledTimes(1);
    });

    it('accepts a valid popup top without inventing visibility', async () => {
        const { view, scrollTo } = fixture();
        mockGeometry.mockResolvedValue({ keyboardTop: 211 });
        await view.scrollToFocusedTextInput();
        jest.runOnlyPendingTimers();
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 163, animated: true });
    });

    it('discards a pending native query on unmount and removes both standard listeners', async () => {
        let finish: any;
        mockGeometry.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
        const { view, scrollTo, inputMeasure } = fixture();
        const pending = view.scrollToFocusedTextInput();
        view.componentWillUnmount();
        finish({ keyboardTop: 211, visible: true });
        await pending;
        jest.runOnlyPendingTimers();
        expect(mockRemoved).toHaveBeenCalledTimes(2);
        expect(inputMeasure).not.toHaveBeenCalled();
        expect(mockAnimations).toEqual([]);
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it('cancels a delayed native measurement when the keyboard hides', async () => {
        const { view, scrollTo, inputMeasure, finishMeasure } = fixture({ defer: true });
        const pending = view.scrollToFocusedTextInput();
        await flushMicrotasks();
        mockNativeHandlers.keyboardDidHide();
        finishMeasure();
        await pending;
        jest.runOnlyPendingTimers();
        expect(inputMeasure).not.toHaveBeenCalled();
        expect(mockAnimations.map((animation) => animation.duration)).toEqual([300]);
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it('does not scroll stale focus after a delayed native measurement', async () => {
        const { view, scrollTo, finishMeasure } = fixture({ defer: true });
        const pending = view.scrollToFocusedTextInput();
        await flushMicrotasks();
        mockFocusedInput = {};
        finishMeasure();
        await pending;
        jest.runOnlyPendingTimers();
        expect(mockAnimations).toEqual([]);
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it('discards an older native geometry response after a newer query completed', async () => {
        let first: any;
        mockGeometry.mockImplementationOnce(() => new Promise((resolve) => { first = resolve; }));
        const { view, scrollTo } = fixture();
        const old = view.scrollToFocusedTextInput();
        await view.scrollToFocusedTextInput();
        first({ keyboardTop: 100, visible: true });
        await old;
        jest.runOnlyPendingTimers();
        expect(mockAnimations).toHaveLength(1);
        expect(scrollTo).toHaveBeenCalledTimes(1);
    });

    it('does not enter legacy fallback when an obsolete native query rejects', async () => {
        let rejectFirst: any;
        mockGeometry.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectFirst = reject; }));
        const { view, scrollTo } = fixture();
        const old = view.scrollToFocusedTextInput();
        await view.scrollToFocusedTextInput();
        rejectFirst(new Error('old window disappeared'));
        await old;
        jest.runOnlyPendingTimers();
        expect(mockAnimations).toHaveLength(1);
        expect(scrollTo).toHaveBeenCalledTimes(1);
    });

    it.each(['scroll', 'input'])('ignores a detached %s host reported with an empty native measure', async (kind) => {
        const { view, scrollTo, inputMeasure } = fixture();
        if (kind === 'scroll') view.scrollViewRef.current.measureInWindow = (callback: any) => callback();
        else inputMeasure.mockImplementationOnce((callback) => callback());
        await view.scrollToFocusedTextInput();
        jest.runOnlyPendingTimers();
        expect(mockAnimations).toEqual([]);
        expect(scrollTo).not.toHaveBeenCalled();
        expect(view.adaptiveKey).toBeUndefined();
    });

    it('releases a reserved geometry key when a native input measurement fails', async () => {
        const { view, scrollTo, inputMeasure } = fixture();
        inputMeasure.mockImplementationOnce(() => { throw new Error('input removed'); });
        await view.scrollToFocusedTextInput();
        expect(mockAnimations).toEqual([]);
        await view.scrollToFocusedTextInput();
        jest.runOnlyPendingTimers();
        expect(mockAnimations).toHaveLength(1);
        expect(scrollTo).toHaveBeenCalledTimes(1);
    });

    it('remeasures a newly focused descendant while the same keyboard is already open', async () => {
        const { view, scrollTo } = fixture({ inputY: 190 });
        await view.scrollToFocusedTextInput();
        expect(mockAnimations).toHaveLength(1);
        expect(scrollTo).not.toHaveBeenCalled();
        mockFocusedInput = { nativeTag: 2, measureInWindow: (callback: any) => callback(0, 250, 100, 40) };
        view.render().props.onFocus({ nativeEvent: { target: 2 } });
        await flushMicrotasks();
        jest.runOnlyPendingTimers();
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 163, animated: true });
        expect(scrollTo).toHaveBeenCalledTimes(1);
    });

    it('ignores a bubbling target that is not the currently focused input', async () => {
        const { view, scrollTo } = fixture();
        view.render().props.onFocus({ nativeEvent: { target: 99 } });
        await flushMicrotasks();
        jest.runOnlyPendingTimers();
        expect(mockGeometry).not.toHaveBeenCalled();
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it('can query a hidden keyboard on first focus then respond to its later standard show', async () => {
        const { view, scrollTo } = fixture();
        mockGeometry.mockResolvedValueOnce({ keyboardTop: 800, visible: false });
        view.render().props.onFocus({ nativeEvent: { target: 1 } });
        await flushMicrotasks();
        expect(scrollTo).not.toHaveBeenCalled();
        mockNativeHandlers.keyboardDidShow();
        await flushMicrotasks();
        jest.runOnlyPendingTimers();
        expect(scrollTo).toHaveBeenCalledTimes(1);
    });

    it.each(['android', 'ios'])('adds no focus handler to the ordinary %s scroll view', (os) => {
        const { view } = fixture({ context: os === 'ios', os });
        expect(view.render().props.onFocus).toBeUndefined();
    });

    it('rechecks a changed adaptive scale without a local layout-height change', async () => {
        const { view, scrollTo } = fixture();
        await view.scrollToFocusedTextInput();
        jest.runOnlyPendingTimers();
        view.viewHeight = 800;
        view.context = { ...view.context, scale: 0.4 };
        view.componentDidUpdate();
        await flushMicrotasks();
        jest.runOnlyPendingTimers();
        expect(view.viewHeight).toBe(800);
        expect(mockGeometry).toHaveBeenCalledTimes(2);
        expect(scrollTo).toHaveBeenLastCalledWith({ x: 0, y: 182.5, animated: true });
        expect(scrollTo).toHaveBeenCalledTimes(2);
    });

    it('rechecks the still-visible keyboard when an ordinary view becomes adaptive', async () => {
        const { view, scrollTo } = fixture({ context: false });
        view.context = { left: 0, width: 400, height: 800, columnWidth: 337, scale: 0.5 };
        view.componentDidUpdate();
        await flushMicrotasks();
        jest.runOnlyPendingTimers();
        expect(mockGeometry).toHaveBeenCalledTimes(1);
        expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 163, animated: true });
    });

    it('rechecks changed local height despite a previously reserved geometry key', async () => {
        const { view, scrollTo } = fixture();
        await view.scrollToFocusedTextInput();
        jest.runOnlyPendingTimers();
        view.viewHeight = 800;
        view.handleLayout({ nativeEvent: { layout: { height: 760 } } });
        await flushMicrotasks();
        jest.runOnlyPendingTimers();
        expect(scrollTo).toHaveBeenCalledTimes(2);
        view.handleLayout({ nativeEvent: { layout: { height: 760 } } });
        await flushMicrotasks();
        expect(mockGeometry).toHaveBeenCalledTimes(2);
    });
});
