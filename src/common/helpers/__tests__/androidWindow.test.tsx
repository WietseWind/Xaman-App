import React, { Component } from 'react';
import renderer, { act } from 'react-test-renderer';
import { Dimensions, NativeModules, Platform } from 'react-native';

import {
    androidWindowFrame,
    getAndroidLayoutSize,
    getAndroidFoldLayout,
    supportsAndroidWindowLayout,
} from '../androidWindow';
import { withAndroidWindowLayout } from '../androidWindowLayout';
import { FoldPhone } from '../foldPhone';
import { AndroidWindowSurroundContext } from '../androidWindowContext';

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
let windowChanged: (event: { window: typeof COVER }) => void;
const remove = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    delete device.androidFoldLayout;
    delete device.androidWindowLayout;
    delete device.supportsAndroidWindowLayout;
    device.setAndroidWindowColumnWidth = jest.fn();
    (Dimensions.get as jest.Mock).mockReturnValue(COVER);
    (Dimensions.addEventListener as jest.Mock).mockImplementation((type, listener) => {
        windowChanged = listener;
        return { remove };
    });
});

describe('Android window native gate', () => {
    it('requires the explicit capability and never infers a fold from a wide screen', () => {
        (Dimensions.get as jest.Mock).mockReturnValue(INNER);
        expect(supportsAndroidWindowLayout()).toBe(false);
        expect(getAndroidFoldLayout()).toBeUndefined();
        device.supportsAndroidWindowLayout = true;
        expect(supportsAndroidWindowLayout()).toBe(true);
        expect(getAndroidFoldLayout()).toBeUndefined();
        device.androidFoldLayout = COVER;
        expect(getAndroidFoldLayout()).toEqual(COVER);
        Object.defineProperty(Platform, 'OS', { value: 'ios' });
        expect(supportsAndroidWindowLayout()).toBe(false);
        expect(getAndroidFoldLayout()).toBeUndefined();
    });

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, '337', null])(
        'rejects invalid native layout dimensions: %s', (width) => {
            device.supportsAndroidWindowLayout = true;
            device.androidFoldLayout = { width, height: COVER.height } as any;
            expect(getAndroidFoldLayout()).toBeUndefined();
        },
    );
});

describe('ordinary Android multi-window size hint', () => {
    it('uses the full size without enabling fold identity', () => {
        device.supportsAndroidWindowLayout = true;
        device.androidWindowLayout = { width: 411.42857142857144, height: 914.2857142857143 };
        expect(getAndroidLayoutSize()).toEqual(device.androidWindowLayout);
        expect(getAndroidFoldLayout()).toBeUndefined();
        device.androidFoldLayout = COVER;
        expect(getAndroidLayoutSize()).toEqual(COVER);
        delete device.supportsAndroidWindowLayout;
        expect(getAndroidLayoutSize()).toBeUndefined();
    });

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, '411', null])(
        'rejects an invalid ordinary size hint: %s', (width) => {
            device.supportsAndroidWindowLayout = true;
            device.androidWindowLayout = { width, height: 914 } as any;
            expect(getAndroidLayoutSize()).toBeUndefined();
            expect(getAndroidFoldLayout()).toBeUndefined();
        },
    );
});

describe('Android visible window rectangle', () => {
    it('keeps the existing cover height and scale beside the native tab bar', () => {
        const view = { width: COVER.width, height: COVER.height - 80 };
        expect(androidWindowFrame(view, COVER, COVER, 2.625)).toEqual({
            left: 0, width: COVER.width, height: view.height, scale: 1,
            logicalLeft: 0, logicalTop: 0, logicalHeight: view.height,
        });
    });

    it('uses one phone column on the cold inner screen', () => {
        const frame = androidWindowFrame({ ...INNER, height: INNER.height - 80 }, INNER, COVER, 2.625)!;
        expect(frame.width).toBe(COVER.width);
        expect(frame.left).toBe(COVER.width);
        expect(frame.scale).toBe(1);
    });

    it.each([
        ['rotated', { width: 2208 / 2.625, height: 1768 / 2.625 }],
        ['split left', { width: 1091 / 2.625, height: 1768 / 2.625 }],
        ['split right', { width: 1117 / 2.625, height: 1768 / 2.625 }],
        ['narrow resized window', { width: 240, height: 400 }],
    ])('keeps the transformed content inside %s', (name, window) => {
        const view = { ...window, height: window.height - 80 };
        const frame = androidWindowFrame(view, window, COVER, 2.625)!;
        expect(frame.scale).toBeGreaterThan(0);
        expect(frame.scale).toBeLessThanOrEqual(1);
        expect(frame.left).toBeGreaterThanOrEqual(0);
        expect(frame.left + frame.width).toBeCloseTo(view.width);
        expect(frame.logicalLeft + (COVER.width - frame.width) / 2).toBeCloseTo(frame.left);
        expect(frame.logicalTop + (frame.logicalHeight - frame.height) / 2).toBeCloseTo(0);
        expect(frame.logicalHeight * frame.scale).toBeCloseTo(view.height);
    });

    it('does not round up beyond the model or the available width', () => {
        const frame = androidWindowFrame({ width: 100.1, height: 200 }, { width: 100.1, height: 200 },
            { width: 100.1, height: 200 }, 2)!;
        expect(frame.width).toBeLessThanOrEqual(100.1);
        expect(frame.scale).toBeLessThanOrEqual(1);
    });

    it('does not shrink a regular phone because onLayout returned a bridge float', () => {
        const model = { width: 1080 / 2.625, height: 2400 / 2.625 };
        const view = { width: Math.fround(model.width), height: Math.fround(model.height - 80) };
        const frame = androidWindowFrame(view, model, model, 2.625)!;
        expect(frame.scale).toBe(1);
        expect(frame.width * 2.625).toBe(1080);
        expect(frame.left).toBe(0);
    });

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('ignores invalid native frames: %s', (width) => {
        expect(androidWindowFrame({ width, height: 300 }, COVER, COVER)).toBeUndefined();
    });
});

describe('mounted Android screen on fold and resize', () => {
    it('does not let a detached screen with a stale local frame narrow the global native tabs', () => {
        device.supportsAndroidWindowLayout = true;
        device.androidFoldLayout = COVER;
        const Wrapped = withAndroidWindowLayout(() => React.createElement('RetainedStackScreen'));
        let tree: renderer.ReactTestRenderer;
        act(() => { tree = renderer.create(<Wrapped />); });
        // RNN can retain this screen's React tree after removing its native view.
        act(() => tree!.root.findByProps({ testID: 'android-window-layout' }).props.onLayout({
            nativeEvent: { layout: { width: 200, height: 600 } },
        }));
        expect(device.setAndroidWindowColumnWidth).toHaveBeenLastCalledWith(COVER.width);
        expect((device.setAndroidWindowColumnWidth as jest.Mock).mock.calls.some(([width]) => width === 200))
            .toBe(false);
        act(() => windowChanged({ window: INNER }));
        expect(device.setAndroidWindowColumnWidth).toHaveBeenLastCalledWith(COVER.width);
        expect(FoldPhone.getState().window.width).toBe(INNER.width);
        expect(FoldPhone.getState().mode).toBe('open');
        act(() => tree!.unmount());
    });

    it('retains screen input/state, updates native tabs once and removes its listener', () => {
        device.supportsAndroidWindowLayout = true;
        device.androidFoldLayout = COVER;
        const mounted = jest.fn();
        class Screen extends Component<{ componentType?: string }, { value: string }> {
            static screenName = 'test.fold';
            static options = () => ({ topBar: { visible: false } });
            constructor(props: { componentType?: string }) {
                super(props);
                this.state = { value: 'typed before folding' };
            }
            componentDidMount() { mounted(); }
            render() {
                const { value } = this.state;
                return React.createElement('Input', { value });
            }
        }
        const Wrapped = withAndroidWindowLayout(Screen);
        expect(withAndroidWindowLayout(Screen)).toBe(Wrapped);
        expect((Wrapped as any).screenName).toBe(Screen.screenName);
        expect((Wrapped as any).options).toBe(Screen.options);
        let tree: renderer.ReactTestRenderer;
        act(() => { tree = renderer.create(<Wrapped />); });
        const screen = tree!.root.findByType(Screen).instance;
        const layout = (width: number, height: number) => tree!.root.findByProps({
            testID: 'android-window-layout',
        }).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
        act(() => layout(COVER.width, COVER.height - 80));
        expect(device.setAndroidWindowColumnWidth).toHaveBeenLastCalledWith(COVER.width);
        act(() => { windowChanged({ window: INNER }); layout(INNER.width, INNER.height - 80); });
        expect(tree!.root.findByType(Screen).instance).toBe(screen);
        expect(tree!.root.findByType('Input' as any).props.value).toBe('typed before folding');
        expect(mounted).toHaveBeenCalledTimes(1);
        expect(FoldPhone.getState().mode).toBe('open');
        expect(tree!.root.findAllByType('ExtraPanel' as any)).toHaveLength(1);
        const calls = (device.setAndroidWindowColumnWidth as jest.Mock).mock.calls.length;
        act(() => layout(INNER.width, INNER.height - 80));
        expect(device.setAndroidWindowColumnWidth).toHaveBeenCalledTimes(calls);
        act(() => tree!.unmount());
        expect(remove).toHaveBeenCalledTimes(1);
        act(() => windowChanged({ window: COVER }));
        expect(device.setAndroidWindowColumnWidth).toHaveBeenCalledTimes(calls);
    });

    it('does not mount a free-area panel beside an overlay', () => {
        device.supportsAndroidWindowLayout = true;
        device.androidFoldLayout = COVER;
        (Dimensions.get as jest.Mock).mockReturnValue(INNER);
        const Content = () => (
            <AndroidWindowSurroundContext.Consumer>
                {(value) => React.createElement('Overlay', { surround: value })}
            </AndroidWindowSurroundContext.Consumer>
        );
        const Wrapped = withAndroidWindowLayout<{ componentType?: string }>(Content);
        let tree: renderer.ReactTestRenderer;
        act(() => { tree = renderer.create(<Wrapped componentType="OVERLAY" />); });
        // An overlay's first native blur must be bounded even before onLayout.
        expect(tree!.root.findByType('Overlay' as any).props.surround).toEqual({
            left: COVER.width, width: INNER.width, height: INNER.height, columnWidth: COVER.width, scale: 1,
        });
        act(() => tree!.root.findByProps({ testID: 'android-window-layout' }).props.onLayout({
            nativeEvent: { layout: { width: INNER.width, height: INNER.height - 24 } },
        }));
        expect(tree!.root.findAllByType('ExtraPanel' as any)).toHaveLength(0);
        expect(tree!.root.findByType('Overlay' as any).props.surround.height).toBe(INNER.height - 24);
        act(() => tree!.unmount());
    });
});

describe('scaled ordinary Android surround', () => {
    it('provides scale metadata when the column fills a narrow ordinary window', () => {
        device.supportsAndroidWindowLayout = true;
        const window = { width: 200, height: COVER.height };
        (Dimensions.get as jest.Mock).mockReturnValue(window);
        const Content = () => (
            <AndroidWindowSurroundContext.Consumer>
                {(value) => React.createElement('ScaledInput', { surround: value })}
            </AndroidWindowSurroundContext.Consumer>
        );
        const Wrapped = withAndroidWindowLayout(Content);
        let tree: renderer.ReactTestRenderer;
        act(() => { tree = renderer.create(<Wrapped />); });
        const { surround } = tree!.root.findByType('ScaledInput' as any).props;
        expect(surround.left).toBe(0);
        expect(surround.scale).toBeCloseTo(200 / COVER.width);
        expect(surround.columnWidth).toBe(COVER.width);
        expect(surround.width * surround.scale).toBe(200);
        expect(getAndroidFoldLayout()).toBeUndefined();
        act(() => tree!.unmount());
    });
});
