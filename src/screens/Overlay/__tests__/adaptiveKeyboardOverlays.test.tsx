import { NativeModules, Platform } from 'react-native';
import EnterDestinationTagOverlay from '../EnterDestinationTag/EnterDestinationTagOverlay';
import FlaggedDestinationOverlay from '../FlaggedDestination/FlaggedDestinationOverlay';

jest.mock('@components/General/AndroidPaneCard/AndroidPaneCard', () => ({
    __esModule: true, default: 'View', AnimatedAndroidPaneCard: 'AnimatedView',
}));

const mockSprings: any[] = [];
const mockNativeHandlers: Record<string, () => void> = {};
const mockDismiss = jest.fn().mockResolvedValue(undefined);
const mockCustomAdd = jest.fn();
const mockCustomRemove = jest.fn();
let mockGeometry: jest.Mock;
jest.mock('react-native', () => ({
    View: 'View', Text: 'Text', Image: 'Image',
    Platform: { OS: 'android' },
    NativeModules: { KeyboardModule: { getWindowGeometry: () => mockGeometry() } },
    Keyboard: {
        addListener: (name: string, handler: () => void) => {
            mockNativeHandlers[name] = handler;
            return { remove: () => { delete mockNativeHandlers[name]; } };
        },
    },
    BackHandler: { addEventListener: () => ({ remove: jest.fn() }) },
    Animated: {
        View: 'AnimatedView',
        Value: class {
            value: number;
            listener?: (event: { value: number }) => void;
            constructor(value: number) { this.value = value; }
            interpolate = (options: any) => options;
            addListener = (listener: (event: { value: number }) => void) => {
                this.listener = listener; return 'offset';
            };
            removeListener = () => { this.listener = undefined; };
        },
        multiply: (value: any, factor: number) => ({ value, factor }),
        timing: () => ({ start: (callback?: () => void) => callback?.() }),
        spring: (value: any, options: any) => ({
            start: () => {
                value.value = options.toValue;
                value.listener?.({ value: options.toValue });
                mockSprings.push(options);
            },
        }),
        parallel: () => ({ start: (callback: () => void) => callback() }),
    },
}));
jest.mock('xumm-string-decode', () => ({ StringType: { XrplDestinationTag: 'tag' } }));
jest.mock('@common/helpers/navigator', () => ({ Navigator: { dismissOverlay: () => mockDismiss() } }));
jest.mock('@common/helpers/images', () => ({ Images: {} }));
jest.mock('@common/helpers/sideSafeArea', () => ({ SideSafeAreaFill: 'SideSafeAreaFill' }));
jest.mock('../../../common/helpers/androidKeyboardGeometry', () => ({
    watchAndroidKeyboardGeometry: () => () => undefined,
}));
jest.mock('@common/helpers/keyboard', () => ({
    __esModule: true, default: { addListener: (...args: any[]) => mockCustomAdd(...args),
        removeListener: (...args: any[]) => mockCustomRemove(...args), dismiss: jest.fn() },
}));
jest.mock('@common/utils/string', () => ({ StringTypeCheck: { isValidDestinationTag: () => true } }));
jest.mock('@common/constants', () => ({
    AppScreens: { Overlay: { EnterDestinationTag: 'tag', FlaggedDestination: 'flag' } },
}));
jest.mock('@components/General', () => ({
    Button: 'Button', TextInput: 'TextInput', ActionPanel: 'ActionPanel', Spacer: 'Spacer', Icon: 'Icon',
}));
jest.mock('@services/BackendService', () => ({ __esModule: true, default: { auditTrail: jest.fn() } }));
jest.mock('@locale', () => ({ __esModule: true, default: { t: (key: string) => key } }));
jest.mock('@theme', () => ({ AppStyles: {}, AppSizes: {
    screen: { height: 900, width: 400 }, safeAreaBottomInset: 20, topInset: 24, bottomInset: 16,
    moderateScale: (size: number) => size,
} }));
jest.mock('../EnterDestinationTag/styles', () => ({ __esModule: true, default: {} }));
jest.mock('../FlaggedDestination/styles', () => ({ __esModule: true, default: {} }));

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const event = { endCoordinates: { height: 300 } } as any;
const elements = (element: any): any[] => (element?.props
    ? [element, ...[].concat(element.props.children || []).flatMap(elements)] : []);
const fixture = (kind: 'tag' | 'flag', { adaptive = true, os = 'android' } = {}) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    const onClose = jest.fn();
    const onFinish = jest.fn();
    const view: any = kind === 'tag'
        ? new EnterDestinationTagOverlay({
            buttonType: 'set', destination: { address: 'public', tag: '557' }, onClose, onFinish,
        })
        : new FlaggedDestinationOverlay({ destination: 'public', onContinue: jest.fn() });
    view.context = adaptive ? { left: 200, width: 200, height: 400, columnWidth: 400, scale: 0.5 } : undefined;
    view.setState = (update: any, callback?: () => void) => {
        view.state = { ...view.state, ...update }; callback?.();
    };
    const input = { measure: jest.fn((callback) => callback(0, 0, 100, 40, 0, 750)),
        measureInWindow: jest.fn((callback) => callback(0, 300, 100, 40)) };
    (kind === 'tag' ? view.textInputViewRef : view.textInputView).current = input;
    const snapTo = jest.fn();
    const slideDown = jest.fn();
    if (kind === 'tag') {view.actionPanelRef.current = {
        snapTo, slideDown, get offsetFromRest() { return view.adaptiveOffset; },
    };}
    view.componentDidMount();
    return { view, input, snapTo, slideDown, onClose, onFinish };
};

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockSprings.length = 0;
    Object.keys(mockNativeHandlers).forEach((key) => delete mockNativeHandlers[key]);
    mockGeometry = jest.fn().mockResolvedValue({ keyboardTop: 250, visible: true });
    NativeModules.KeyboardModule.getWindowGeometry = () => mockGeometry();
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

describe.each(['tag', 'flag'] as const)('%s production keyboard overlay', (kind) => {
    it('moves its measured input above the current real-window top at scale 0.5', async () => {
        const { view, input, snapTo } = fixture(kind);
        view.onKeyboardShow(event);
        await flush();
        jest.advanceTimersByTime(10);
        expect(input.measure).not.toHaveBeenCalled();
        expect(input.measureInWindow).toHaveBeenCalledTimes(1);
        if (kind === 'tag') {
            expect(view.state.offsetBottom).toBe(140);
            expect(snapTo).toHaveBeenCalledWith(2);
        } else {
            expect(mockSprings).toEqual([{ toValue: 280, useNativeDriver: false }]);
            const inner = view.render().props.children[1];
            expect(inner.props.style[1].marginBottom).toBe(view.bottomOffset);
        }
    });

    it.each(['android', 'ios'])('keeps the exact ordinary %s height formula and legacy style', async (os) => {
        const { view, input, snapTo } = fixture(kind, { adaptive: os === 'ios', os });
        view.onKeyboardShow(event);
        await flush();
        expect(mockGeometry).not.toHaveBeenCalled();
        expect(input.measureInWindow).not.toHaveBeenCalled();
        const offset = os === 'ios' ? 190 : kind === 'tag' ? 210 : 230;
        if (kind === 'tag') {
            expect(view.state.offsetBottom).toBe(offset);
            expect(snapTo).not.toHaveBeenCalled();
            jest.advanceTimersByTime(10);
            expect(snapTo).toHaveBeenCalledWith(2);
        } else {
            expect(mockSprings).toEqual([{ toValue: offset, useNativeDriver: false }]);
            expect(view.render().props.children[1].props.style[1].marginBottom).toBe(view.bottomOffset);
        }
    });

    it('keeps the custom listener delay and registration intact', () => {
        const { view } = fixture(kind);
        jest.advanceTimersByTime(499);
        expect(mockCustomAdd).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(mockCustomAdd).toHaveBeenCalledWith('keyboardWillShow', view.onKeyboardShow);
        expect(mockCustomAdd).toHaveBeenCalledWith('keyboardWillHide', view.onKeyboardHide);
        view.componentWillUnmount();
        expect(mockCustomRemove).toHaveBeenCalledWith('keyboardWillShow', view.onKeyboardShow);
    });

    it('listens for bubbling focus without overriding the shared TextInput focus handler', async () => {
        const { view } = fixture(kind);
        const tree = elements(view.render());
        expect(tree.find((element) => element.type === 'TextInput').props.onFocus).toBeUndefined();
        const wrapper = tree.find((element) => element.type === 'View' && element.props.onFocus);
        expect(wrapper).toBeDefined();
        wrapper.props.onFocus();
        await flush();
        expect(mockGeometry).toHaveBeenCalledTimes(1);
    });

    it('recovers a missed custom event and resets once on RN/custom Hide', async () => {
        const { view, snapTo } = fixture(kind);
        mockNativeHandlers.keyboardDidShow();
        await flush();
        jest.advanceTimersByTime(10);
        mockNativeHandlers.keyboardDidHide();
        view.onKeyboardHide();
        jest.advanceTimersByTime(10);
        if (kind === 'tag') {
            expect(view.state.offsetBottom).toBe(0);
            expect(snapTo.mock.calls).toEqual([[2], [1]]);
        } else expect(mockSprings.map((spring) => spring.toValue)).toEqual([280, 0]);
    });

    it('uses custom legacy fallback and its existing Hide when native geometry is unavailable', async () => {
        mockGeometry.mockResolvedValue(null);
        const { view } = fixture(kind);
        view.onKeyboardShow(event);
        await flush();
        view.onKeyboardHide();
        expect(view.keyboardShow).toBe(false);
        if (kind === 'tag') expect(view.state.offsetBottom).toBe(0);
        else {
            expect(mockSprings.map((spring) => spring.toValue)).toEqual([230, 0]);
            expect(view.render().props.children[1].props.style[1].marginBottom).toBe(view.bottomOffset);
        }
    });

    it('resets legacy fallback on an RN-only Hide and consumes the later custom Hide once', async () => {
        mockGeometry.mockResolvedValue(null);
        const { view, snapTo } = fixture(kind);
        view.onKeyboardShow(event);
        await flush();
        jest.advanceTimersByTime(10);
        mockNativeHandlers.keyboardDidHide();
        view.onKeyboardHide();
        jest.advanceTimersByTime(10);
        expect(view.keyboardShow).toBe(false);
        expect(view.adaptiveOffset).toBe(0);
        if (kind === 'tag') expect(snapTo.mock.calls).toEqual([[2], [1]]);
        else expect(mockSprings.map((spring) => spring.toValue)).toEqual([230, 0]);
        view.onKeyboardShow(event);
        await flush();
        expect(view.keyboardShow).toBe(true);
    });

    it('starts a new ordinary legacy session after adaptive fallback loses its context', async () => {
        mockGeometry.mockResolvedValue(null);
        const { view } = fixture(kind);
        view.onKeyboardShow(event);
        await flush();
        view.context = undefined;
        view.componentDidUpdate();
        view.onKeyboardShow(event);
        expect(view.keyboardShow).toBe(true);
        if (kind === 'tag') expect(view.state.offsetBottom).toBe(210);
        else expect(mockSprings[mockSprings.length - 1].toValue).toBe(230);
        // The new ordinary flow retains its own custom Hide handler.
        view.onKeyboardHide();
        expect(view.keyboardShow).toBe(false);
    });

    it('accounts for a legacy displacement before a later valid native measurement', async () => {
        mockGeometry.mockResolvedValueOnce(null);
        const { view, input } = fixture(kind);
        view.onKeyboardShow(event);
        await flush();
        const priorDisplacement = kind === 'tag' ? 210 : 115;
        input.measureInWindow.mockImplementation((callback) => callback(0, 300 - priorDisplacement * 0.5, 100, 40));
        view.onKeyboardShow(event);
        await flush();
        expect(view.adaptiveOffset).toBe(140);
        if (kind === 'tag') expect(view.state.offsetBottom).toBe(140);
        else {
            expect(mockSprings.map((spring) => spring.toValue)).toEqual([230, 280]);
            expect(view.render().props.children[1].props.style[1].marginBottom).toBe(view.bottomOffset);
        }
        view.onKeyboardHide();
        expect(view.keyboardShow).toBe(false);
        expect(view.adaptiveOffset).toBe(0);
    });

    it('ignores a pending native answer after dismissal starts', async () => {
        let resolve: (value: any) => void = () => undefined;
        mockGeometry.mockReturnValue(new Promise((done) => { resolve = done; }));
        const { view, slideDown, snapTo } = fixture(kind);
        view.onKeyboardShow(event);
        await flush();
        if (kind === 'tag') view.slideDownPanel(); else view.onDismiss();
        resolve({ keyboardTop: 250, visible: true });
        await flush();
        jest.advanceTimersByTime(10);
        expect(snapTo).not.toHaveBeenCalled();
        expect(mockSprings).toEqual([]);
        if (kind === 'tag') expect(slideDown).toHaveBeenCalledTimes(1);
    });

    it('guards a pending legacy fallback measurement after dismissal starts', async () => {
        mockGeometry.mockResolvedValue(null);
        const { view, input, snapTo } = fixture(kind);
        let finish: (...args: number[]) => void = () => undefined;
        input.measure.mockImplementation((callback) => { finish = callback; });
        view.onKeyboardShow(event);
        await flush();
        if (kind === 'tag') view.slideDownPanel(); else view.onDismiss();
        finish(0, 0, 100, 40, 0, 750);
        jest.advanceTimersByTime(10);
        expect(snapTo).not.toHaveBeenCalled();
        expect(mockSprings).toEqual([]);
    });

    it('does not reopen a closing panel when Hide follows an applied legacy fallback', async () => {
        mockGeometry.mockResolvedValue(null);
        const { view, snapTo } = fixture(kind);
        view.onKeyboardShow(event);
        await flush();
        jest.advanceTimersByTime(10);
        const count = kind === 'tag' ? snapTo.mock.calls.length : mockSprings.length;
        if (kind === 'tag') view.slideDownPanel(); else view.onDismiss();
        view.onKeyboardHide();
        jest.advanceTimersByTime(10);
        expect(kind === 'tag' ? snapTo.mock.calls.length : mockSprings.length).toBe(count);
    });

    it('ignores a pending measured answer after unmount', async () => {
        const { view, input, snapTo } = fixture(kind);
        let finish: (x: number, y: number, width: number, height: number) => void = () => undefined;
        input.measureInWindow.mockImplementation((callback) => { finish = callback; });
        view.onKeyboardShow(event);
        await flush();
        view.componentWillUnmount();
        finish(0, 300, 100, 40);
        jest.advanceTimersByTime(10);
        expect(snapTo).not.toHaveBeenCalled();
        expect(mockSprings).toEqual([]);
    });
});

it('preserves the Tag Apply callback and cancels a deferred adaptive snap before Apply', async () => {
    const { view, onFinish, snapTo } = fixture('tag');
    view.onKeyboardShow(event);
    await flush();
    await view.onFinish();
    jest.advanceTimersByTime(10);
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith('557');
    expect(snapTo).not.toHaveBeenCalled();
});

it('keeps Flagged position continuous when native geometry returns during a legacy spring', async () => {
    mockGeometry.mockResolvedValueOnce(null);
    const { view, input } = fixture('flag');
    view.onKeyboardShow(event);
    await flush();
    // The 230dp legacy margin target is only 80dp applied: 40dp displacement.
    view.bottomOffset.value = 80;
    view.bottomOffset.listener({ value: 80 });
    input.measureInWindow.mockImplementation((callback) => callback(0, 280, 100, 40));
    const before = view.render().props.children[1].props.style[1];
    expect(before.marginBottom.value / 2).toBe(40);
    view.onKeyboardShow(event);
    await flush();
    expect(view.render().props.children[1].props.style[1].marginBottom).toBe(before.marginBottom);
    expect(view.adaptiveOffset).toBe(140);
    expect(view.bottomOffset.value / 2).toBe(140);
});
