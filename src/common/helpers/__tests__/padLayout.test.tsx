/**
 * The app on an iPad (issue 553).
 *
 * The app is an iPhone app. iPadOS 27 runs it in a window that the user can resize and that changes when the iPad
 * turns. The app keeps one phone layout there, in a box in the middle of that window. Every phone must get exactly
 * what it got before: no layout size, the insets of the native side, the screen as it is.
 */
import React, { Component } from 'react';
import { Dimensions, NativeModules, Platform, Text } from 'react-native';
import renderer from 'react-test-renderer';

import { GetLayoutInsets, GetUsableWindowWidth, IsFoldPhone } from '../device';
import { GetPadLayout, IsPadDevice } from '../padLayout';
import { padBoxFor, SideSafeAreaContext, withSideInsets } from '../sideSafeArea';

const originalOS = Platform.OS;

type Device = {
    platform?: string;
    isPad?: unknown;
    pad?: unknown;
    insets?: any;
    window?: { width: number; height: number };
    screen?: { width: number; height: number };
};

const apply = ({ platform = 'ios', isPad, pad, insets = { top: 47, bottom: 34 }, window, screen }: Device) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => platform });
    const native = NativeModules.DeviceUtilsModule;
    native.layoutInsets = insets;
    delete native.verticalBarEdge;
    if (isPad === undefined) {
        delete native.isPadDevice;
    } else {
        native.isPadDevice = isPad;
    }
    if (pad === undefined) {
        delete native.padLayout;
    } else {
        native.padLayout = pad;
    }
    const win = window || { width: 390, height: 844 };
    jest.spyOn(Dimensions, 'get').mockImplementation(
        (dim: string) => ({ ...(dim === 'screen' && screen ? screen : win), scale: 2, fontScale: 1 }) as any,
    );
};

afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
    delete NativeModules.DeviceUtilsModule.isPadDevice;
    delete NativeModules.DeviceUtilsModule.padLayout;
    jest.restoreAllMocks();
});

describe('a phone: no iPad, no layout size, everything as it was', () => {
    it('the native side sends nothing about an iPad (Android, older native code)', () => {
        apply({});
        expect(IsPadDevice()).toBe(false);
        expect(GetPadLayout()).toBeUndefined();
        expect(GetLayoutInsets()).toEqual({ top: 47, bottom: 34, left: 0, right: 0 });
        expect(GetUsableWindowWidth()).toBe(390);
    });

    it('an iPhone: the native side sends false and a size of 0', () => {
        apply({ isPad: false, pad: { width: 0, height: 0 } });
        expect(IsPadDevice()).toBe(false);
        expect(GetPadLayout()).toBeUndefined();
        expect(GetLayoutInsets()).toEqual({ top: 47, bottom: 34, left: 0, right: 0 });
    });

    it('a layout size without the iPad mark is not used, and no value but true is the mark', () => {
        [undefined, false, 0, 1, 'true', null].forEach((isPad) => {
            apply({ isPad, pad: { width: 430, height: 932 } });
            expect(IsPadDevice()).toBe(false);
            expect(GetPadLayout()).toBeUndefined();
        });
    });

    it('Android never is an iPad', () => {
        apply({ platform: 'android', isPad: true, pad: { width: 430, height: 932 } });
        expect(IsPadDevice()).toBe(false);
        expect(GetPadLayout()).toBeUndefined();
    });
});

describe('an iPad whose system gives the app the screen of a phone (older iPadOS)', () => {
    it('is an iPad without a layout size: the app is laid out as on a phone', () => {
        apply({
            isPad: true,
            pad: { width: 0, height: 0 },
            insets: { top: 20, bottom: 25, left: 0, right: 0 },
            window: { width: 390, height: 844 },
        });
        expect(IsPadDevice()).toBe(true);
        expect(GetPadLayout()).toBeUndefined();
        expect(GetLayoutInsets()).toEqual({ top: 20, bottom: 25, left: 0, right: 0 });
        expect(GetUsableWindowWidth()).toBe(390);
    });

    it('a size that is no positive number is no size', () => {
        [{ width: 430 }, { width: -1, height: 932 }, { width: '430', height: 932 }, null, 'x'].forEach((pad) => {
            apply({ isPad: true, pad });
            expect(GetPadLayout()).toBeUndefined();
        });
    });
});

describe('an iPad with a window of its own (iPadOS 27)', () => {
    const PRO = { isPad: true, pad: { width: 430, height: 932 }, screen: { width: 1032, height: 1376 } };

    it('has the layout size the native side tells', () => {
        apply({ ...PRO, window: { width: 516, height: 1376 } });
        expect(GetPadLayout()).toEqual({ width: 430, height: 932 });
        // the tab icons are made for the width of the layout, not for that of the window
        expect(GetUsableWindowWidth()).toBe(430);
    });

    it('is never taken for a fold phone, however wide its window is', () => {
        apply({ ...PRO, window: { width: 516, height: 1376 }, screen: { width: 390, height: 844 } });
        expect(IsFoldPhone()).toBe(false);
    });

    it('iPad Pro, started in portrait: the insets of the window', () => {
        apply({ ...PRO, insets: { top: 47, bottom: 34, left: 0, right: 0 } });
        expect(GetLayoutInsets()).toEqual({ top: 47, bottom: 34, left: 0, right: 0 });
    });

    it('iPad Pro, started in landscape: the same insets (the top inset is on the sides there)', () => {
        apply({ ...PRO, insets: { top: 20, bottom: 20, left: 47, right: 47 } });
        expect(GetLayoutInsets()).toEqual({ top: 47, bottom: 34, left: 0, right: 0 });
    });

    it('an iPad with a home button: the plain status bar and no bottom inset, in portrait and in landscape', () => {
        apply({ ...PRO, pad: { width: 375, height: 820 }, insets: { top: 20, bottom: 0, left: 0, right: 0 } });
        expect(GetLayoutInsets()).toEqual({ top: 20, bottom: 0, left: 0, right: 0 });
        apply({ ...PRO, pad: { width: 375, height: 820 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } });
        expect(GetLayoutInsets()).toEqual({ top: 20, bottom: 0, left: 0, right: 0 });
    });
});

describe('the place of the layout box in the window', () => {
    const LAYOUT = { width: 430, height: 932 };

    it('a window of the size of the layout: the box is the window', () => {
        expect(padBoxFor({ width: 430, height: 932 }, LAYOUT)).toEqual({
            left: 0,
            top: 0,
            width: 430,
            height: 932,
            scale: 1,
            below: 0,
        });
    });

    it('a larger window (the window the system gives at first): the box is in the middle, at its own size', () => {
        expect(padBoxFor({ width: 516, height: 1376 }, LAYOUT)).toEqual({
            left: 43,
            top: 222,
            width: 430,
            height: 932,
            scale: 1,
            below: 222,
        });
    });

    it('a higher window of the same width (after the user changed its size)', () => {
        const box = padBoxFor({ width: 430, height: 1183 }, LAYOUT);
        expect([box.left, box.top, box.scale, box.below]).toEqual([0, 125.5, 1, 125.5]);
    });

    it('a smaller window: the whole box, made smaller around the middle of the window', () => {
        const box = padBoxFor({ width: 375, height: 486 }, LAYOUT);
        expect(box.scale).toBeCloseTo(486 / 932, 6);
        // the box keeps its own size for the layout; its middle is the middle of the window
        expect([box.width, box.height]).toEqual([430, 932]);
        expect(box.left + box.width / 2).toBe(375 / 2);
        expect(box.top + box.height / 2).toBe(486 / 2);
        expect(box.below).toBe(0);
        // what is drawn fits in the window
        expect(box.width * box.scale).toBeLessThanOrEqual(375);
        expect(box.height * box.scale).toBeLessThanOrEqual(486);
    });

    it('a window that is only too narrow, or only too low', () => {
        expect(padBoxFor({ width: 375, height: 932 }, LAYOUT).scale).toBeCloseTo(375 / 430, 6);
        expect(padBoxFor({ width: 516, height: 800 }, LAYOUT).scale).toBeCloseTo(800 / 932, 6);
    });

    it('no window size known yet: the box at its own size', () => {
        const box = padBoxFor({ width: 0 }, LAYOUT);
        expect(box).toEqual({ left: 0, top: 0, width: 430, height: 932, scale: 1, below: 0 });
    });
});

describe('a screen on the iPad: in the box, and it follows the window while the app runs', () => {
    class Screen extends Component<{ label: string }> {
        static screenName = 'app.Test';

        static options() {
            return { topBar: { visible: false } };
        }

        static contextType = SideSafeAreaContext;

        render() {
            const { label } = this.props;
            return <Text>{`${label} ${(this.context as { below: number }).below}`}</Text>;
        }
    }

    const LAYOUT = { width: 430, height: 932 };
    const NO_INSETS = { left: 0, right: 0 };

    const boxOf = (tree: renderer.ReactTestRenderer) => {
        const native = (tree.toJSON() as any) || {};
        const box = native.children[0];
        const { left, top, width, height, transform } = box.props.style;
        return { native: native.type, left, top, width, height, transform, text: box.children[0].children.join('') };
    };
    const tell = (tree: renderer.ReactTestRenderer, width: number, height: number, left = 0, right = 0) =>
        renderer.act(() =>
            (tree.toJSON() as any).props.onSideSafeAreaChange({ nativeEvent: { left, right, width, height, edge: 0 } }),
        );

    beforeEach(() => {
        apply({ isPad: true, pad: LAYOUT, window: { width: 516, height: 1376 } });
    });

    it('without a layout size and without a side safe area: the screen itself (every phone)', () => {
        expect(withSideInsets(Screen, NO_INSETS, { width: 390, height: 844 }, 0)).toBe(Screen);
        expect(withSideInsets(Screen, NO_INSETS, { width: 390, height: 844 }, 0, undefined)).toBe(Screen);
        expect(withSideInsets(Screen, NO_INSETS, { width: 390, height: 844 }, 0, { width: 0, height: 0 })).toBe(Screen);
    });

    it('is a box of the layout size in the middle of the window, with the statics of the screen', () => {
        const Wrapped: any = withSideInsets(Screen, NO_INSETS, LAYOUT, 0, LAYOUT);
        expect(Wrapped).not.toBe(Screen);
        expect(Wrapped.screenName).toBe('app.Test');
        expect(Wrapped.options()).toEqual({ topBar: { visible: false } });
        const tree = renderer.create(<Wrapped label="a" />);
        expect(boxOf(tree)).toEqual({
            native: 'SideSafeAreaView',
            left: 43,
            top: 222,
            width: 430,
            height: 932,
            transform: undefined,
            text: 'a 222',
        });
    });

    it('follows the window: resized by the user, turned to landscape, made small; the screen is not made again', () => {
        const Wrapped = withSideInsets(Screen, NO_INSETS, LAYOUT, 0, LAYOUT);
        const tree = renderer.create(<Wrapped label="a" />);
        const screen = tree.root.findByType(Screen).instance;

        // the user changed the size: the system holds the width of the layout
        tell(tree, 430, 1183);
        expect(boxOf(tree)).toMatchObject({ left: 0, top: 125.5, transform: undefined, text: 'a 125.5' });

        // landscape: the window has its top inset on the sides; the box does not move for it
        tell(tree, 430, 1024, 47, 47);
        expect(boxOf(tree)).toMatchObject({ left: 0, top: 46, width: 430, height: 932, transform: undefined });

        // exactly the layout
        tell(tree, 430, 932);
        expect(boxOf(tree)).toMatchObject({ left: 0, top: 0, transform: undefined, text: 'a 0' });

        // a small window from before the update
        tell(tree, 375, 486);
        const small = boxOf(tree);
        expect(small.transform).toEqual([{ scale: 486 / 932 }]);
        expect([small.width, small.height, small.text]).toEqual([430, 932, 'a 0']);

        expect(tree.root.findByType(Screen).instance).toBe(screen);
    });
});
