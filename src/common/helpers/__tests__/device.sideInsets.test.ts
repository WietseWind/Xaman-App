/**
 * The safe area on a side of the screen, and the tab icon sizes with it (issue 544, iPhone Duo).
 * A phone without such an area must get exactly what it got before.
 */
import { Dimensions, NativeModules, PixelRatio, Platform } from 'react-native';

import {
    GetBottomTabIconDp,
    GetBottomTabScale,
    GetLayoutInsets,
    GetSideInsets,
    GetUsableWindowWidth,
    GetVerticalBarEdge,
    IsFoldPhone,
} from '../device';

const originalOS = Platform.OS;

type Phone = { width: number; ratio: number; os: string; platform?: string; insets: any };

const apply = ({ width, ratio, os, platform = 'ios', insets }: Phone) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => platform });
    NativeModules.DeviceUtilsModule.osVersion = os;
    NativeModules.DeviceUtilsModule.layoutInsets = insets;
    delete NativeModules.DeviceUtilsModule.verticalBarEdge;
    NativeModules.DeviceUtilsModule.tabBarMetrics = { itemHeight: 49, height: 49 + (insets?.bottom || 0) };
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width, height: 800, scale: ratio, fontScale: 1 } as any);
    jest.spyOn(PixelRatio, 'get').mockReturnValue(ratio);
};

const tabSizes = () => [
    GetBottomTabScale(0.65),
    GetBottomTabScale(0.9),
    GetBottomTabScale(),
    GetBottomTabIconDp(0.65),
    GetBottomTabIconDp(0.9),
];

afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
    jest.restoreAllMocks();
});

describe('side insets', () => {
    it('are 0 when the native side sends none, sends 0, or sends something that is no positive number', () => {
        [
            { top: 47, bottom: 34 },
            { top: 47, bottom: 34, left: 0, right: 0 },
            { top: 47, bottom: 34, left: -1, right: Number.NaN },
            { top: 47, bottom: 34, left: '84', right: null },
            { top: 47, bottom: 34, left: Infinity, right: undefined },
        ].forEach((insets) => {
            apply({ width: 390, ratio: 3, os: '27.2', insets });
            expect(GetLayoutInsets()).toEqual({ top: 47, bottom: 34, left: 0, right: 0 });
            expect(GetSideInsets()).toBe(0);
            expect(GetUsableWindowWidth()).toBe(390);
        });
    });

    it('keep top and bottom as the native side sends them', () => {
        apply({ width: 390, ratio: 3, os: '27.2', insets: { top: 0, bottom: -5 } });
        expect(GetLayoutInsets()).toEqual({ top: 0, bottom: -5, left: 0, right: 0 });
    });

    it('iPhone Duo: 84 on the right, 382 of the 466 left for content', () => {
        apply({ width: 466, ratio: 3, os: '27.2', insets: { top: 0, bottom: 34, left: 0, right: 84 } });
        expect(GetLayoutInsets()).toEqual({ top: 0, bottom: 34, left: 0, right: 84 });
        expect(GetSideInsets()).toBe(84);
        expect(GetUsableWindowWidth()).toBe(382);
    });
});

describe('tab icon sizes', () => {
    const PHONES: Phone[] = [
        { width: 375, ratio: 2, os: '16.7.1', insets: { top: 20, bottom: 0 } },
        { width: 375, ratio: 2, os: '26.5', insets: { top: 20, bottom: 0 } },
        { width: 390, ratio: 3, os: '18.5', insets: { top: 47, bottom: 34 } },
        { width: 402, ratio: 3, os: '27.2', insets: { top: 62, bottom: 34 } },
        { width: 440, ratio: 3, os: '27.2', insets: { top: 62, bottom: 34 } },
        { width: 360, ratio: 3, os: '14', platform: 'android', insets: { top: 24, bottom: 0 } },
        { width: 411.4, ratio: 2.625, os: '16', platform: 'android', insets: { top: 52, bottom: 24 } },
        { width: 800, ratio: 2, os: '15', platform: 'android', insets: { top: 24, bottom: 0 } },
    ];

    it('do not change on a phone without a side inset, whatever the native side sends for the sides', () => {
        PHONES.forEach((phone) => {
            apply(phone);
            const plain = tabSizes();
            [
                { left: 0, right: 0 },
                { left: -4, right: Number.NaN },
                { left: null, right: '12' },
            ].forEach((side) => {
                apply({ ...phone, insets: { ...phone.insets, ...side } });
                expect(tabSizes()).toEqual(plain);
            });
        });
    });

    it('iPhone Duo: the sizes of a phone as wide as the rest of its screen, not of one 466 wide', () => {
        apply({ width: 466, ratio: 3, os: '27.2', insets: { top: 0, bottom: 34, left: 0, right: 84 } });
        const duo = tabSizes();
        apply({ width: 382, ratio: 3, os: '27.2', insets: { top: 0, bottom: 34 } });
        expect(duo).toEqual(tabSizes());
        apply({ width: 466, ratio: 3, os: '27.2', insets: { top: 0, bottom: 34 } });
        // a larger scale is a smaller icon
        expect(duo[0]).toBeGreaterThan(tabSizes()[0]);
    });
});

describe('iPhone Duo, open: the window is 951 wide, the screen of the device stays 466', () => {
    const open = (insets: any) => {
        apply({ width: 951, ratio: 3, os: '27.2', insets });
        (Dimensions.get as jest.Mock).mockImplementation((dim: string) =>
            dim === 'screen'
                ? { width: 466, height: 678, scale: 3, fontScale: 1 }
                : { width: 951, height: 669, scale: 3, fontScale: 1 },
        );
    };

    it('the usable width and the tab icons are those of the closed phone', () => {
        open({ top: 0, bottom: 34, left: 0, right: 84 });
        expect(GetUsableWindowWidth()).toBe(382);
        const openSizes = tabSizes();
        apply({ width: 466, ratio: 3, os: '27.2', insets: { top: 0, bottom: 34, left: 0, right: 84 } });
        expect(openSizes).toEqual(tabSizes());
    });

    it('no side inset and a window about as wide as the screen: the window width, as always', () => {
        apply({ width: 469, ratio: 3, os: '27.2', insets: { top: 0, bottom: 34 } });
        (Dimensions.get as jest.Mock).mockImplementation((dim: string) =>
            dim === 'screen'
                ? { width: 466, height: 678, scale: 3, fontScale: 1 }
                : { width: 469, height: 669, scale: 3, fontScale: 1 },
        );
        expect(GetUsableWindowWidth()).toBe(469);
    });
});

describe('the vertical tab bar of the iPhone Duo', () => {
    const setEdge = (edge: unknown) => {
        NativeModules.DeviceUtilsModule.verticalBarEdge = edge;
    };

    afterEach(() => {
        delete NativeModules.DeviceUtilsModule.verticalBarEdge;
    });

    it('a phone without one: no edge, whatever the native side sends', () => {
        [undefined, null, 0, 3, -1, '2', NaN].forEach((edge) => {
            apply({ width: 390, ratio: 3, os: '27.2', insets: { top: 47, bottom: 34 } });
            setEdge(edge);
            expect(GetVerticalBarEdge()).toBe(0);
            expect(GetLayoutInsets()).toEqual({ top: 47, bottom: 34, left: 0, right: 0 });
            expect(GetUsableWindowWidth()).toBe(390);
        });
    });

    it('closed or open: the window has the safe area of the column itself, nothing is added', () => {
        apply({ width: 466, ratio: 3, os: '27.2', insets: { top: 0, bottom: 34, left: 0, right: 84 } });
        setEdge(2);
        expect(GetVerticalBarEdge()).toBe(2);
        expect(GetLayoutInsets()).toEqual({ top: 0, bottom: 34, left: 0, right: 84 });
    });

    it('started in one half of the open screen: the column is kept on the edge of the bar', () => {
        // the window has no side safe area there
        apply({ width: 469, ratio: 3, os: '27.2', insets: { top: 0, bottom: 34, left: 0, right: 0 } });
        setEdge(1);
        expect(GetLayoutInsets()).toEqual({ top: 0, bottom: 34, left: 84, right: 0 });
        expect(GetSideInsets()).toBe(84);
        setEdge(2);
        expect(GetLayoutInsets()).toEqual({ top: 0, bottom: 34, left: 0, right: 84 });
    });
});

describe('the iPhone Duo is known in every state, and no other phone is taken for one', () => {
    const state = (
        window: [number, number],
        screen: [number, number],
        insets: any,
        edge?: number,
        platform = 'ios',
    ) => {
        apply({ width: window[0], ratio: 3, os: '27.2', platform, insets });
        (Dimensions.get as jest.Mock).mockImplementation((dim: string) => {
            const [width, height] = dim === 'screen' ? screen : window;
            return { width, height, scale: 3, fontScale: 1 };
        });
        if (edge !== undefined) NativeModules.DeviceUtilsModule.verticalBarEdge = edge;
    };

    afterEach(() => {
        delete NativeModules.DeviceUtilsModule.verticalBarEdge;
    });

    it('regular iPhones: the window is the screen', () => {
        [
            [375, 667],
            [390, 844],
            [402, 874],
            [440, 956],
        ].forEach(([width, height]) => {
            state([width, height], [width, height], { top: 47, bottom: 34 });
            expect(IsFoldPhone()).toBe(false);
            expect(GetLayoutInsets()).toEqual({ top: 47, bottom: 34, left: 0, right: 0 });
        });
    });

    it('Android is never taken for one, whatever the sizes are', () => {
        state([768, 884], [400, 884], { top: 30, bottom: 16 }, 2, 'android');
        expect(IsFoldPhone()).toBe(false);
        expect(GetLayoutInsets()).toEqual({ top: 30, bottom: 16, left: 0, right: 0 });
    });

    it('closed, open, in one half: the vertical bar tells', () => {
        state([466, 678], [466, 678], { top: 0, bottom: 34, left: 0, right: 84 }, 2);
        expect(IsFoldPhone()).toBe(true);
        state([951, 669], [466, 678], { top: 0, bottom: 34, left: 0, right: 84 }, 2);
        expect(IsFoldPhone()).toBe(true);
        state([469, 669], [466, 678], { top: 0, bottom: 34, left: 0, right: 0 }, 1);
        expect(IsFoldPhone()).toBe(true);
    });

    it('open and turned a quarter: no bar, but the window is far wider than the screen of the device', () => {
        state([669, 951], [466, 678], { top: 82, bottom: 34, left: 0, right: 0 }, 0);
        expect(IsFoldPhone()).toBe(true);
        // the column is counted (on the right), and the top is the plain status bar
        expect(GetLayoutInsets()).toEqual({ top: 20, bottom: 34, left: 0, right: 84 });
        expect(GetUsableWindowWidth()).toBe(382);
    });

    it('a window a little wider than the screen is not enough', () => {
        state([469, 669], [466, 678], { top: 0, bottom: 34, left: 0, right: 0 }, 0);
        expect(IsFoldPhone()).toBe(false);
    });
});
