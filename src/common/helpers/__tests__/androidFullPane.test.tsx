/* eslint-disable max-classes-per-file */
import React, { Component } from 'react';
import renderer, { act } from 'react-test-renderer';
import { Dimensions, NativeModules } from 'react-native';

import { AndroidWindowSurroundContext } from '../androidWindowContext';
import { withAndroidWindowLayout } from '../androidWindowLayout';
import { FoldPhone } from '../foldPhone';

const mockNativeListeners = new Set<(value: any) => void>();
let mockState: any;
jest.mock('../androidMultiWindow', () => ({
    getAndroidMultiWindowState: () => mockState,
    subscribeAndroidMultiWindowState: (listener: (value: any) => void) => {
        mockNativeListeners.add(listener);
        return { remove: () => mockNativeListeners.delete(listener) };
    },
}));
jest.mock('react-native', () => ({
    View: 'NativeView',
    Dimensions: { get: jest.fn(), addEventListener: jest.fn() },
    NativeModules: { DeviceUtilsModule: {} },
    Platform: { OS: 'android' },
    PixelRatio: { get: () => 2.625 },
}));
jest.mock('@theme', () => ({
    AppSizes: { screen: { uncorrectedWidth: 884 / 2.625, height: 2208 / 2.625 } },
}));
jest.mock('@components/General/FoldPhoneExtraPanel/FoldPhoneExtraPanel', () => 'ExtraPanel');

const COVER = { width: 884 / 2.625, height: 2208 / 2.625 };
const INNER = { width: 1768 / 2.625, height: 2208 / 2.625 };
const device = NativeModules.DeviceUtilsModule;
let windowChanged: (value: any) => void;

beforeEach(() => {
    jest.clearAllMocks();
    mockNativeListeners.clear();
    mockState = { ...INNER, isInMultiWindowMode: false, revision: 0 };
    device.supportsAndroidWindowLayout = true;
    device.androidFoldLayout = COVER;
    device.setAndroidWindowColumnWidth = jest.fn();
    (Dimensions.get as jest.Mock).mockReturnValue(INNER);
    (Dimensions.addEventListener as jest.Mock).mockImplementation((name, listener) => {
        windowChanged = listener;
        return { remove: jest.fn() };
    });
});

const native = (width: number, height: number, split: boolean) => {
    mockState = { width, height, isInMultiWindowMode: split, revision: mockState.revision + 1 };
    mockNativeListeners.forEach((listener) => listener(mockState));
};

it('fills either split side and a wide pane, retaining the same screen, draft and full-screen column', () => {
    const mounted = jest.fn();
    class Screen extends Component<object, { value: string }> {
        static contextType = AndroidWindowSurroundContext;
        declare context: React.ContextType<typeof AndroidWindowSurroundContext>;
        constructor(props: object) {
            super(props);
            this.state = { value: 'public draft' };
        }
        componentDidMount() { mounted(); }
        render() {
            const { value } = this.state;
            return React.createElement('Input', { value, surround: this.context });
        }
    }
    const Wrapped = withAndroidWindowLayout(Screen);
    let tree: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<Wrapped />); });
    const screen = tree!.root.findByType(Screen).instance;
    const layout = (width: number, height: number) => tree!.root.findByProps({
        testID: 'android-window-layout',
    }).props.onLayout({ nativeEvent: { layout: { width, height } } });
    act(() => layout(INNER.width, INNER.height - 80));
    expect(tree!.root.findAllByType('ExtraPanel' as any)).toHaveLength(1);
    for (const width of [1091 / 2.625, 1117 / 2.625, INNER.width]) {
        act(() => { native(width, 600, true); layout(width, 520); });
        expect(tree!.root.findByType('Input' as any).props.surround).toEqual({
            left: 0, width, height: 520, columnWidth: width, scale: 1, fullPane: true,
        });
        expect(tree!.root.findAllByType('ExtraPanel' as any)).toHaveLength(0);
        expect(FoldPhone.getState().mode).toBe('split');
        expect(device.setAndroidWindowColumnWidth).toHaveBeenLastCalledWith(width);
        expect(tree!.root.findByType(Screen).instance).toBe(screen);
        expect(tree!.root.findByType('Input' as any).props.value).toBe('public draft');
    }
    // A detached screen still has a narrow local view; native tabs use the
    // atomic global snapshot and must never follow that stale view width.
    act(() => { native(512, 600, true); layout(200, 520); });
    expect(device.setAndroidWindowColumnWidth).toHaveBeenLastCalledWith(512);
    act(() => {
        native(INNER.width, INNER.height, false);
        layout(INNER.width, INNER.height - 80);
    });
    // Delayed RN size notifications cannot overwrite the newer atomic native
    // fullscreen state or restore a narrow bar from the old split window.
    const restoredSurround = tree!.root.findByType('Input' as any).props.surround;
    act(() => windowChanged({ window: { width: 200, height: 600 } }));
    expect(tree!.root.findByType('Input' as any).props.surround).toBe(restoredSurround);
    expect(tree!.root.findByType(Screen).instance).toBe(screen);
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(FoldPhone.getState().mode).toBe('open');
    expect(device.setAndroidWindowColumnWidth).toHaveBeenLastCalledWith(COVER.width);
    expect(tree!.root.findAllByType('ExtraPanel' as any)).toHaveLength(1);
    act(() => tree!.unmount());
    expect(mockNativeListeners.size).toBe(0);
});

it('bounds an early ordinary-phone overlay to its actual pane before the first layout', () => {
    delete device.androidFoldLayout;
    mockState = { width: 407, height: 411, isInMultiWindowMode: true, revision: 0 };
    const Content = () => (
        <AndroidWindowSurroundContext.Consumer>
            {(surround) => React.createElement('Overlay', { surround })}
        </AndroidWindowSurroundContext.Consumer>
    );
    const Wrapped = withAndroidWindowLayout<{ componentType: string }>(Content);
    let tree: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<Wrapped componentType="OVERLAY" />); });
    const { surround } = tree!.root.findByType('Overlay' as any).props;
    expect(surround.left).toBe(0);
    expect(surround.width).toBeCloseTo(407, 0);
    expect(surround.columnWidth).toBe(surround.width);
    expect(surround.scale).toBe(1);
    expect(surround.fullPane).toBe(true);
    expect(tree!.root.findAllByType('ExtraPanel' as any)).toHaveLength(0);
    act(() => tree!.unmount());
});

it('passes a live local top inset only in actual split mode, without replacing the screen', () => {
    const Content = () => (
        <AndroidWindowSurroundContext.Consumer>
            {(surround) => React.createElement('InsetProbe', { surround })}
        </AndroidWindowSurroundContext.Consumer>
    );
    const Wrapped = withAndroidWindowLayout(Content);
    let tree: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<Wrapped />); });
    const content = tree!.root.findByType(Content);
    act(() => {
        mockState = { width: 407, height: 411, isInMultiWindowMode: true, topInset: 52, revision: 1 };
        mockNativeListeners.forEach((listener) => listener(mockState));
    });
    expect(tree!.root.findByType('InsetProbe' as any).props.surround.topInset).toBe(52);
    act(() => {
        mockState = { ...mockState, topInset: 24, revision: 2 };
        mockNativeListeners.forEach((listener) => listener(mockState));
    });
    expect(tree!.root.findByType('InsetProbe' as any).props.surround.topInset).toBe(24);
    expect(tree!.root.findByType(Content)).toBe(content);
    act(() => {
        mockState = { ...INNER, isInMultiWindowMode: false, topInset: 52, revision: 3 };
        mockNativeListeners.forEach((listener) => listener(mockState));
    });
    expect(tree!.root.findByType('InsetProbe' as any).props.surround.topInset).toBeUndefined();
    act(() => tree!.unmount());
});

it('reconciles a cached native transition between construction and mount without publishing the old width', () => {
    const width = 1091 / 2.625;
    class Screen extends Component {
        constructor(props: object) {
            super(props);
            // Simulate another already-mounted screen accepting this event
            // while the new wrapper is being constructed by React.
            mockState = { width, height: 600, isInMultiWindowMode: true, revision: 1 };
        }
        render() { return React.createElement('Input'); }
    }
    const Wrapped = withAndroidWindowLayout(Screen);
    let tree: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<Wrapped />); });
    expect(device.setAndroidWindowColumnWidth).toHaveBeenCalledWith(width);
    expect((device.setAndroidWindowColumnWidth as jest.Mock).mock.calls.some(([value]) => value === COVER.width))
        .toBe(false);
    expect(FoldPhone.getState().mode).toBe('split');
    act(() => tree!.unmount());
});
