import { NativeModules, Platform } from 'react-native';
import AssetListFilter, { Props } from '../AssetListFilterOverlay';

let mockFocusedInput: any;
let mockGeometry: jest.Mock;
const mockNativeHandlers: Record<string, () => void> = {};
const mockGeometrySignals: (() => void)[] = [];
const mockRelease = jest.fn();
const mockDismiss = jest.fn().mockResolvedValue('sheet');
jest.mock('react-native', () => ({
    View: 'View', Platform: { OS: 'android' },
    findNodeHandle: (input: any) => input?.nativeTag ?? null,
    TextInput: { State: { currentlyFocusedInput: () => mockFocusedInput } },
    NativeModules: { KeyboardModule: { getWindowGeometry: () => mockGeometry() } },
    Keyboard: {
        addListener: (name: string, listener: () => void) => {
            mockNativeHandlers[name] = listener;
            return { remove: () => { delete mockNativeHandlers[name]; } };
        },
    },
}));
jest.mock('@common/helpers/navigator', () => ({ Navigator: { dismissOverlay: () => mockDismiss() } }));
jest.mock('@common/helpers/keyboard', () => ({
    __esModule: true, default: { addListener: jest.fn(), removeListener: jest.fn() },
}));
jest.mock('@common/helpers/androidKeyboardGeometry', () => ({
    watchAndroidKeyboardGeometry: (listener: () => void) => { mockGeometrySignals.push(listener); return mockRelease; },
}));
jest.mock('@common/constants', () => ({ AppScreens: { Overlay: { AssetListFilter: 'asset-filter' } } }));
jest.mock('@components/General', () => ({ ActionPanel: 'ActionPanel' }));
jest.mock('@components/Modules/AssetsList/Tokens/ListFilter', () => ({ ListFilter: 'ListFilter' }));
jest.mock('@theme', () => ({ AppSizes: { safeAreaBottomInset: 20 }, AppStyles: {} }));

const flush = async () => { for (let i = 0; i < 14; i++) await Promise.resolve(); };
const props = (): Props => ({
    visible: true, filters: { text: 'XRP', favorite: false, hideZero: false },
    onFilterChange: jest.fn(), onReorderPress: jest.fn(), onTokenAddPress: jest.fn(),
    onReorderSavePress: jest.fn(), onAddTokenPress: jest.fn(), hideTopElements: jest.fn(),
});
const fixture = ({ context = true, os = 'android', applied = 0, focus = true } = {}) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    const p = props();
    const view: any = new AssetListFilter(p);
    view.context = context ? { left: 200, width: 200, height: 400, columnWidth: 400, scale: 0.5 } : undefined;
    view.setState = (update: any, callback?: () => void) => {
        view.state = { ...view.state, ...update };
        view.componentDidUpdate();
        callback?.();
    };
    const snapTo = jest.fn();
    const slideDown = jest.fn();
    view.actionPanelRef.current = { snapTo, slideDown, offsetFromRest: applied };
    mockFocusedInput = {
        nativeTag: 11,
        measureInWindow: jest.fn((callback) => callback(0, 300 - applied * 0.5, 100, 40)),
    };
    view.componentDidMount();
    if (focus && context && os === 'android') view.onSearchFocus({ nativeEvent: { target: 11 } });
    return { view, p, snapTo, slideDown, input: mockFocusedInput };
};

beforeEach(() => {
    jest.useFakeTimers(); jest.clearAllMocks();
    Object.keys(mockNativeHandlers).forEach((key) => delete mockNativeHandlers[key]);
    mockGeometrySignals.length = 0;
    mockGeometry = jest.fn().mockResolvedValue({ keyboardTop: 250, visible: true });
    NativeModules.KeyboardModule.getWindowGeometry = () => mockGeometry();
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

it('adds an adaptive third snap point from the actual focused SearchBar input at scale 0.5', async () => {
    const { view, input, snapTo } = fixture();
    const panel = view.render();
    expect(panel.props.offset).toBe(0);
    expect(panel.props.children.props.onFocus).toBeDefined();
    expect(panel.props.children.props.children.props.onFocus).toBeUndefined();
    panel.props.children.props.onFocus({ nativeEvent: { target: 11 } });
    await flush();
    jest.advanceTimersByTime(10);
    expect(input.measureInWindow).toHaveBeenCalledTimes(1);
    expect(view.render().props.offset).toBe(140);
    expect(snapTo).toHaveBeenCalledWith(2);
});

it('corrects the early RN Show measurement after settled geometry changes without a custom Show', async () => {
    mockGeometry.mockResolvedValue({ keyboardTop: 383, visible: true });
    const { view, snapTo } = fixture();
    mockNativeHandlers.keyboardDidShow();
    await flush();
    expect(view.state.keyboardOffset).toBe(0);
    mockGeometry.mockResolvedValue({ keyboardTop: 121, visible: true });
    mockGeometrySignals[0]();
    await flush();
    jest.advanceTimersByTime(10);
    expect(view.state.keyboardOffset).toBe(398);
    expect(snapTo).toHaveBeenCalledWith(2);
});

it('ignores an underlying focused form until the filter receives its own matching focus event', async () => {
    const { view, input, snapTo } = fixture({ focus: false });
    mockFocusedInput = { nativeTag: 33, measureInWindow: jest.fn() };
    mockNativeHandlers.keyboardDidShow();
    view.onKeyboardShow();
    view.onSearchFocus({ nativeEvent: { target: 11 } });
    await flush();
    expect(mockGeometry).not.toHaveBeenCalled();
    expect(mockGeometrySignals).toHaveLength(0);
    expect(snapTo).not.toHaveBeenCalled();
    mockFocusedInput = input;
    view.onSearchFocus({ nativeEvent: { target: 11 } });
    await flush();
    expect(view.state.keyboardOffset).toBe(140);
});

it('invalidates a pending owned search measurement on real blur and ignores a later signal', async () => {
    let resolve: (value: any) => void = () => undefined;
    mockGeometry.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { view, snapTo } = fixture();
    await flush();
    const signal = mockGeometrySignals[0];
    mockFocusedInput = null;
    view.onSearchBlur({ nativeEvent: { target: 11 } });
    resolve({ keyboardTop: 250, visible: true });
    signal();
    await flush();
    jest.advanceTimersByTime(10);
    expect(view.state.keyboardOffset).toBe(0);
    expect(snapTo).not.toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalledTimes(1);
});

it('ignores foreign and stale blur events while the owned input is still focused', async () => {
    const { view, input } = fixture();
    view.onSearchBlur({ nativeEvent: { target: 33 } });
    view.onSearchBlur({ nativeEvent: { target: 11 } });
    await flush();
    expect(view.ownedSearchInput).toBe(input);
    expect(view.state.keyboardOffset).toBe(140);
    expect(mockRelease).not.toHaveBeenCalled();
});

it('restores the resting snap on real own blur even though the eligible context is now absent', async () => {
    const { view, snapTo } = fixture();
    await flush();
    jest.advanceTimersByTime(10);
    mockFocusedInput = null;
    view.onSearchBlur({ nativeEvent: { target: 11 } });
    jest.advanceTimersByTime(10);
    expect(view.state.keyboardOffset).toBe(0);
    expect(snapTo.mock.calls).toEqual([[2], [1]]);
    expect(mockRelease).toHaveBeenCalledTimes(1);
});

it('reconstructs the unshifted search position using actual ActionPanel displacement', async () => {
    const { view } = fixture({ applied: 60 });
    view.onKeyboardShow();
    await flush();
    expect(view.state.keyboardOffset).toBe(140);
});

it.each(['android', 'ios'])('preserves the default %s render and legacy Show/Hide timing', async (os) => {
    const { view, snapTo } = fixture({ context: os === 'ios', os });
    expect(view.render().props.offset).toBeUndefined();
    expect(view.render().props.children.props.onFocus).toBeUndefined();
    view.onKeyboardShow();
    jest.advanceTimersByTime(9);
    expect(snapTo).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(snapTo).toHaveBeenCalledWith(2);
    view.onKeyboardHide();
    expect(snapTo.mock.calls).toEqual([[2], [1]]);
    await flush();
    expect(mockGeometry).not.toHaveBeenCalled();
});

it('retains custom legacy fallback but never uses RN height data for missing geometry', async () => {
    mockGeometry.mockResolvedValue(null);
    const { view, snapTo } = fixture();
    mockNativeHandlers.keyboardDidShow();
    await flush();
    jest.advanceTimersByTime(10);
    expect(snapTo).not.toHaveBeenCalled();
    view.onKeyboardShow();
    await flush();
    jest.advanceTimersByTime(10);
    expect(snapTo).toHaveBeenCalledWith(2);
});

it.each(['onClosePress', 'onCloseRequest', 'onSlideDown', 'componentWillUnmount'] as const)(
    'ignores a pending current-window query after %s', async (close) => {
        let resolve: (value: any) => void = () => undefined;
        mockGeometry.mockReturnValue(new Promise((done) => { resolve = done; }));
        const { view, snapTo } = fixture();
        view.onKeyboardShow();
        await flush();
        view[close]();
        resolve({ keyboardTop: 250, visible: true });
        await flush();
        jest.advanceTimersByTime(10);
        expect(view.state.keyboardOffset).toBe(0);
        expect(snapTo).not.toHaveBeenCalled();
        expect(mockRelease).toHaveBeenCalledTimes(1);
    },
);

it('does not execute an already queued snap or legacy fallback snap after close request', async () => {
    const { view, snapTo } = fixture();
    view.onKeyboardShow();
    await flush();
    view.onCloseRequest();
    jest.advanceTimersByTime(10);
    expect(snapTo).not.toHaveBeenCalled();
    const fallback = fixture();
    mockGeometry.mockResolvedValue(null);
    fallback.view.onKeyboardShow();
    await flush();
    fallback.view.onCloseRequest();
    jest.advanceTimersByTime(10);
    expect(fallback.snapTo).not.toHaveBeenCalled();
});

it('resets the adaptive snap once when both Hide emitters fire', async () => {
    const { view, snapTo } = fixture();
    view.onKeyboardShow();
    await flush();
    jest.advanceTimersByTime(10);
    mockNativeHandlers.keyboardDidHide();
    view.onKeyboardHide();
    jest.advanceTimersByTime(10);
    expect(view.state.keyboardOffset).toBe(0);
    expect(snapTo.mock.calls).toEqual([[2], [1]]);
});

it('keeps filter callbacks and first after-close action behavior unchanged', async () => {
    const { view, p, slideDown } = fixture();
    const list = view.render().props.children.props.children;
    expect(list.props.filters).toBe(p.filters);
    const next = { text: 'Draft', favorite: false, hideZero: false };
    list.props.onFilterChange(next);
    expect(p.onFilterChange).toHaveBeenCalledWith(next);
    list.props.onAddTokenPress();
    list.props.onReorderPress();
    expect(slideDown).toHaveBeenCalledTimes(1);
    expect(p.onAddTokenPress).not.toHaveBeenCalled();
    await view.onSlideDown();
    view.componentWillUnmount();
    const [hidden, complete] = jest.mocked(p.hideTopElements).mock.calls[0];
    expect(hidden).toBe(false);
    complete!();
    expect(p.onAddTokenPress).toHaveBeenCalledTimes(1);
    expect(p.onReorderPress).not.toHaveBeenCalled();
});
