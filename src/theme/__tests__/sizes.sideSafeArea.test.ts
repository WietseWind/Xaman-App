/**
 * AppSizes and a safe area on a side of the screen (issue 544, iPhone Duo).
 *
 * The rule that matters most: a phone WITHOUT a safe area on a side gets exactly the sizes it had before. Only a
 * phone with one (the iPhone Duo: the status area and the tab bar are on the right) gets other sizes: those of a
 * phone as wide as the rest of its screen.
 */
import { PixelRatio } from 'react-native';

type Insets = { top: number; bottom: number; left?: unknown; right?: unknown };
type Phone = {
    name: string;
    os: 'ios' | 'android';
    width: number;
    height: number;
    insets: Insets;
    // the screen of the device, when it is not the size of the window
    screen?: { width: number; height: number };
    // iPad: what the native side tells about it
    pad?: { isPadDevice?: unknown; padLayout?: unknown };
    android?: { supportsAndroidWindowLayout?: unknown; androidFoldLayout?: unknown; androidWindowLayout?: unknown };
};

/** AppSizes as the app makes it at start, for one phone */
const sizesFor = ({ os, width, height, insets, screen, pad, android }: Phone): any => {
    let sizes: any;
    // a fresh copy of the module and of react-native: AppSizes is made once, when the module loads
    jest.isolateModules(() => {
        /* eslint-disable global-require */
        const RN = require('react-native');
        Object.defineProperty(RN.Platform, 'OS', { configurable: true, get: () => os });
        RN.Platform.select = (spec: any) => (os in spec ? spec[os] : spec.default);
        RN.NativeModules.DeviceUtilsModule.layoutInsets = insets;
        RN.NativeModules.DeviceUtilsModule.supportsAndroidWindowLayout = android?.supportsAndroidWindowLayout;
        RN.NativeModules.DeviceUtilsModule.androidFoldLayout = android?.androidFoldLayout;
        RN.NativeModules.DeviceUtilsModule.androidWindowLayout = android?.androidWindowLayout;
        if (pad) {
            Object.assign(RN.NativeModules.DeviceUtilsModule, pad);
        }
        RN.Dimensions.get = (dim: string) =>
            dim === 'screen' && screen
                ? { ...screen, scale: 3, fontScale: 1 }
                : { width, height, scale: 3, fontScale: 1 };
        sizes = require('../sizes').default;
        /* eslint-enable global-require */
    });
    return sizes;
};

/**
 * The sizes as the app made them BEFORE the side safe area was known (the code of 5.4.0, copied). `width` here is
 * the window width.
 */
const sizesBefore = ({ os, width, height, insets }: Phone) => {
    const { top: topInset, bottom: bottomInset } = insets;
    const xyFactor = width / height;
    const factor = xyFactor > 0.85 ? 2 : 1;
    const statusBarHeight = topInset > 0 ? topInset : os === 'ios' ? 20 : 0;
    const scale = (size: number) => ((width / 350) * size) / factor;
    return {
        screen: {
            height,
            width: width / factor,
            uncorrectedWidth: width,
            screenHeight: height,
            heightHalf: height * 0.5,
            heightThird: height * 0.333,
            heightTwoThirds: height * 0.666,
            heightQuarter: height * 0.25,
            heightThreeQuarters: height * 0.75,
            widthHalf: width * 0.5,
            widthThird: width * 0.333,
            widthTwoThirds: width * 0.666,
            widthQuarter: width * 0.25,
            widthThreeQuarters: width * 0.75,
            isSmallDevice: width <= 375,
        },
        statusBarHeight,
        tabbarHeight: os === 'ios' ? bottomInset + 50 : 60,
        bottomInset,
        topInset,
        safeAreaBottomInset: os === 'android' ? (bottomInset > 0 ? bottomInset : 0) : bottomInset,
        safeAreaTopInset: statusBarHeight,
        padding: 30,
        paddingSml: 20,
        paddingMid: 15,
        paddingExtraSml: 10,
        paddingList: 20,
        borderRadius: 8,
        extraKeyBoardPadding: 20,
        scale,
        verticalScale: (size: number) => (height / 680) * size,
        moderateScale: (size: number, f = 0.5) => size + (scale(size) - size) * f,
        widthPercentageToDP: (percent: number) => PixelRatio.roundToNearestPixel((width * percent) / 100),
        heightPercentageToDP: (percent: number) => PixelRatio.roundToNearestPixel((height * percent) / 100),
    };
};

const SAMPLES = [0, 1, 4, 10, 12.5, 16, 24, 33, 50, 75, 100, 250];

/** Every number of AppSizes, and every function of it for a row of inputs, as one plain object */
const numbersOf = (sizes: any) => {
    const out: Record<string, unknown> = {};
    Object.keys(sizes).forEach((key) => {
        const value = sizes[key];
        if (typeof value === 'function') {
            out[key] = SAMPLES.map((n) => value(n));
            if (key === 'moderateScale') {
                out[`${key}(0.25)`] = SAMPLES.map((n) => value(n, 0.25));
            }
        } else if (value && typeof value === 'object') {
            Object.keys(value).forEach((inner) => {
                out[`${key}.${inner}`] = value[inner];
            });
        } else {
            out[key] = value;
        }
    });
    return out;
};

// the fields that this change adds: they are not in the sizes of before
const NEW_FIELDS = [
    'leftInset',
    'rightInset',
    'sideInsets',
    'screen.windowWidth',
    'padLayout',
    'padLayout.width',
    'padLayout.height',
];
const withoutNew = (numbers: Record<string, unknown>) => {
    const copy = { ...numbers };
    NEW_FIELDS.forEach((field) => delete copy[field]);
    return copy;
};

const PHONES: Phone[] = [
    { name: 'iPhone SE (3rd)', os: 'ios', width: 375, height: 667, insets: { top: 20, bottom: 0 } },
    { name: 'iPhone 13 mini', os: 'ios', width: 375, height: 812, insets: { top: 50, bottom: 34 } },
    { name: 'iPhone 12', os: 'ios', width: 390, height: 844, insets: { top: 47, bottom: 34 } },
    { name: 'iPhone 17 Pro', os: 'ios', width: 402, height: 874, insets: { top: 62, bottom: 34 } },
    { name: 'iPhone 17 Pro Max', os: 'ios', width: 440, height: 956, insets: { top: 62, bottom: 34 } },
    { name: 'iPhone Air', os: 'ios', width: 420, height: 912, insets: { top: 68, bottom: 34 } },
    { name: 'Android small', os: 'android', width: 360, height: 640, insets: { top: 24, bottom: 0 } },
    { name: 'Samsung M21', os: 'android', width: 411.4, height: 891.4, insets: { top: 32, bottom: 0 } },
    { name: 'Pixel 9 (edge to edge)', os: 'android', width: 411.4, height: 923.4, insets: { top: 52, bottom: 24 } },
    { name: 'Android fold, open', os: 'android', width: 768.2, height: 884.6, insets: { top: 30, bottom: 16 } },
    { name: 'Android tablet', os: 'android', width: 800, height: 1280, insets: { top: 24, bottom: 0 } },
];

// what the native side can send for a side that has no safe area, or does not send at all
const NO_SIDE: Array<[string, Partial<Insets>]> = [
    ['no left / right at all (Android, older native code)', {}],
    ['left 0, right 0 (iOS on every phone without a side area)', { left: 0, right: 0 }],
    ['values that are no positive number', { left: -3, right: Number.NaN }],
    ['values of another type', { left: '84', right: null }],
];

describe('a phone without a safe area on a side: the sizes of before, to the last number', () => {
    PHONES.forEach((phone) => {
        NO_SIDE.forEach(([what, side]) => {
            it(`${phone.name} (${phone.width} x ${phone.height}), ${what}`, () => {
                const now = sizesFor({ ...phone, insets: { ...phone.insets, ...side } });
                expect(withoutNew(numbersOf(now))).toEqual(numbersOf(sizesBefore(phone)));
                expect([now.leftInset, now.rightInset, now.sideInsets, now.screen.windowWidth]).toEqual([
                    0,
                    0,
                    0,
                    phone.width,
                ]);
            });
        });
    });
});

describe('a phone without a safe area on a side: the size of the screen changes nothing', () => {
    // A screen that is larger than the window (Android multi window), unknown, or a little smaller. A window that is
    // far wider than the screen of the device is the mark of the open iPhone Duo; no other phone has that (and it
    // is not looked at on Android at all).
    [
        { width: 2000, height: 3000 },
        { width: 0, height: 0 },
        { width: 359, height: 600 },
    ].forEach((screen) => {
        it(`a screen of ${screen.width} x ${screen.height}`, () => {
            PHONES.filter((phone) => phone.os === 'android' || phone.width <= screen.width * 1.2).forEach((phone) => {
                const now = sizesFor({ ...phone, screen });
                const expected: any = numbersOf(sizesBefore(phone));
                // the one number that is the height of the screen, as it always was
                expected['screen.screenHeight'] = screen.height;
                expect(withoutNew(numbersOf(now))).toEqual(expected);
            });
        });
    });

    it('Android: a screen far smaller than the window changes nothing either', () => {
        PHONES.filter((phone) => phone.os === 'android').forEach((phone) => {
            const now = sizesFor({ ...phone, screen: { width: 200, height: 300 } });
            const expected: any = numbersOf(sizesBefore(phone));
            expected['screen.screenHeight'] = 300;
            expect(withoutNew(numbersOf(now))).toEqual(expected);
        });
    });
});

describe('iPhone Duo: 466 x 678 with a safe area of 84 on the right', () => {
    const DUO: Phone = {
        name: 'iPhone Duo',
        os: 'ios',
        width: 466,
        height: 678,
        insets: { top: 20, bottom: 34, left: 0, right: 84 },
    };

    it('has the sizes of a phone that is 382 wide (the rest of its screen), not of one that is 466 wide', () => {
        const duo = sizesFor(DUO);
        const asNarrow = sizesBefore({ ...DUO, width: 382 });
        expect(withoutNew(numbersOf(duo))).toEqual(numbersOf(asNarrow));
        expect(duo.screen.width).toBe(382);
        expect(duo.scale(100)).toBeCloseTo((382 / 350) * 100, 6);
        // before the fix: 133 for 100 (466 / 350), more than on the widest phone, on a screen that is not high
        expect(duo.scale(100)).toBeLessThan(sizesBefore({ ...DUO, width: 440 }).scale(100));
    });

    it('is close to the iPhone SE, the smallest phone the app is made for', () => {
        const duo = sizesFor(DUO);
        const se = sizesFor(PHONES[0]);
        expect(duo.scale(100) / se.scale(100)).toBeCloseTo(382 / 375, 6);
        expect(duo.screen.isSmallDevice).toBe(false);
        expect(se.screen.isSmallDevice).toBe(true);
    });

    it('knows the safe area and the whole window', () => {
        const duo = sizesFor(DUO);
        expect([duo.leftInset, duo.rightInset, duo.sideInsets, duo.screen.windowWidth]).toEqual([0, 84, 84, 466]);
    });

    it('a safe area on the left counts the same', () => {
        const left = sizesFor({ ...DUO, insets: { top: 20, bottom: 34, left: 84, right: 0 } });
        const both = sizesFor({ ...DUO, insets: { top: 20, bottom: 34, left: 40, right: 44 } });
        expect(left.screen.width).toBe(382);
        expect(both.screen.width).toBe(382);
        expect([both.leftInset, both.rightInset, both.sideInsets]).toEqual([40, 44, 84]);
    });
});

describe('iPhone Duo, open: a window of 951 x 669, the screen of the device stays the cover screen', () => {
    const OPEN: Phone = {
        name: 'iPhone Duo, open',
        os: 'ios',
        width: 951,
        height: 669,
        screen: { width: 466, height: 678 },
        insets: { top: 20, bottom: 34, left: 0, right: 84 },
    };

    it('keeps the layout width of the cover screen', () => {
        const open = sizesFor(OPEN);
        expect(open.screen.width).toBe(382);
        expect(open.screen.uncorrectedWidth).toBe(382);
        expect(open.screen.windowWidth).toBe(951);
        expect(open.screen.height).toBe(669);
        expect(open.scale(100)).toBeCloseTo((382 / 350) * 100, 6);
    });

    it('has the same sizes from the width as the closed phone, so the app is the same on both screens', () => {
        const open = sizesFor(OPEN);
        const closed = sizesFor({ ...OPEN, width: 466, height: 678 });
        ['scale', 'moderateScale', 'widthPercentageToDP'].forEach((fn) => {
            expect(SAMPLES.map((n) => open[fn](n))).toEqual(SAMPLES.map((n) => closed[fn](n)));
        });
        expect(open.screen.widthHalf).toBe(closed.screen.widthHalf);
        expect(open.screen.isSmallDevice).toBe(closed.screen.isSmallDevice);
    });

    it('is not taken for a square fold screen (no half sizes)', () => {
        const open = sizesFor(OPEN);
        expect(open.screen.width).toBe(open.screen.uncorrectedWidth);
    });
});

describe('iPhone Duo, open and turned a quarter: a window of 669 x 951, no vertical bar, no side safe area', () => {
    const TURNED: Phone = {
        name: 'iPhone Duo, open, turned',
        os: 'ios',
        width: 669,
        height: 951,
        screen: { width: 466, height: 678 },
        insets: { top: 82, bottom: 34, left: 0, right: 0 },
    };

    it('started in this state: still the layout of the cover screen (the window is far wider than the screen)', () => {
        const turned = sizesFor(TURNED);
        expect(turned.sideInsets).toBe(84);
        expect(turned.screen.width).toBe(382);
        expect(turned.screen.height).toBe(678);
        expect(turned.screen.windowWidth).toBe(669);
        // the plain status bar: the app is a box clear of the status area of 82 there
        expect(turned.statusBarHeight).toBe(20);
        expect(turned.scale(100)).toBeCloseTo((382 / 350) * 100, 6);
    });

    it('has the sizes of the closed phone', () => {
        const turned = sizesFor(TURNED);
        const closed = sizesFor({
            ...TURNED,
            width: 466,
            height: 678,
            insets: { top: 0, bottom: 34, left: 0, right: 84 },
        });
        ['scale', 'moderateScale', 'widthPercentageToDP', 'verticalScale', 'heightPercentageToDP'].forEach((fn) => {
            expect(SAMPLES.map((n) => turned[fn](n))).toEqual(SAMPLES.map((n) => closed[fn](n)));
        });
        expect(turned.screen.height).toBe(closed.screen.height);
    });
});

describe('iPad (issue 553): one phone layout, whatever the window is', () => {
    // iPad Pro 13: the screen is 1032 x 1376; the window the system gives is 516 wide and as high as the screen
    const PRO: Phone = {
        name: 'iPad Pro 13',
        os: 'ios',
        width: 516,
        height: 1376,
        insets: { top: 47, bottom: 34, left: 0, right: 0 },
        screen: { width: 1032, height: 1376 },
        pad: { isPadDevice: true, padLayout: { width: 430, height: 932 } },
    };
    const PRO_MAX: Phone = { name: 'phone', os: 'ios', width: 430, height: 932, insets: { top: 47, bottom: 34 } };

    it('has the sizes of a phone of the layout size, to the last number', () => {
        const pad = sizesFor(PRO);
        const expected: any = numbersOf(sizesBefore(PRO_MAX));
        expected['screen.screenHeight'] = 1376;
        expect(withoutNew(numbersOf(pad))).toEqual(expected);
        expect(pad.padLayout).toEqual({ width: 430, height: 932 });
        expect([pad.leftInset, pad.rightInset, pad.sideInsets]).toEqual([0, 0, 0]);
    });

    it('has the same sizes in every window: in landscape, resized, small', () => {
        const portrait = numbersOf(sizesFor(PRO));
        [
            { width: 516, height: 1032, insets: { top: 20, bottom: 20, left: 47, right: 47 } },
            { width: 430, height: 1183, insets: PRO.insets },
            { width: 430, height: 932, insets: PRO.insets },
            { width: 375, height: 486, insets: PRO.insets },
        ].forEach((state) => {
            const now: any = numbersOf(sizesFor({ ...PRO, ...state }));
            // the one number that is the width of the window itself
            now['screen.windowWidth'] = portrait['screen.windowWidth'];
            expect(now).toEqual(portrait);
        });
    });

    it('an iPad whose system gives the app the screen of a phone: the sizes of that phone', () => {
        const old: Phone = {
            name: 'iPad, older iPadOS',
            os: 'ios',
            width: 390,
            height: 844,
            insets: { top: 20, bottom: 25, left: 0, right: 0 },
            pad: { isPadDevice: true, padLayout: { width: 0, height: 0 } },
        };
        const now = sizesFor(old);
        expect(withoutNew(numbersOf(now))).toEqual(numbersOf(sizesBefore(old)));
        expect(now.padLayout).toBeUndefined();
    });

    it('a phone: no layout size, also when the native side sends a size of 0', () => {
        PHONES.forEach((phone) => {
            const now = sizesFor({ ...phone, pad: { isPadDevice: false, padLayout: { width: 0, height: 0 } } });
            expect(withoutNew(numbersOf(now))).toEqual(numbersOf(sizesBefore(phone)));
            expect(now.padLayout).toBeUndefined();
        });
    });
});

describe('Android fold native layout', () => {
    const cover = { width: 884 / 2.625, height: 2208 / 2.625 };
    const insets = { top: 55, bottom: 24 };
    const android = { supportsAndroidWindowLayout: true, androidFoldLayout: cover };
    const states = [
        ['cover', cover],
        ['cold inner', { width: 1768 / 2.625, height: 2208 / 2.625 }],
        ['rotated inner', { width: 2208 / 2.625, height: 1768 / 2.625 }],
        ['split left', { width: 1091 / 2.625, height: 1768 / 2.625 }],
        ['split right', { width: 1117 / 2.625, height: 1768 / 2.625 }],
    ] as const;

    states.forEach(([name, window]) => {
        it(`keeps the phone metrics on ${name}, including a cold start`, () => {
            const now = sizesFor({ name, os: 'android', ...window, insets, android });
            const before = sizesBefore({ name: 'cover', os: 'android', ...cover, insets });
            const actual = withoutNew(numbersOf(now));
            const expected = numbersOf(before);
            // This remains the physical display measurement, not a layout metric.
            delete actual['screen.screenHeight'];
            delete expected['screen.screenHeight'];
            expect(actual).toEqual(expected);
        });
    });

    PHONES.filter((phone) => phone.os === 'android').forEach((phone) => {
        it(`keeps every existing metric on ${phone.name} with the new native build`, () => {
            const now = sizesFor({ ...phone, android: { supportsAndroidWindowLayout: true } });
            expect(withoutNew(numbersOf(now))).toEqual(numbersOf(sizesBefore(phone)));
        });
    });

    it('does not apply Android native metadata to iOS', () => {
        const phone = PHONES[2];
        const now = sizesFor({ ...phone, android });
        expect(withoutNew(numbersOf(now))).toEqual(numbersOf(sizesBefore(phone)));
    });
});


describe('ordinary Android cold multi-window layout', () => {
    const model = { width: 1080 / 2.625, height: 2400 / 2.625 };
    const full: Phone = {
        name: 'ordinary full-size phone', os: 'android', ...model,
        screen: model, insets: { top: 24, bottom: 24 },
        android: { supportsAndroidWindowLayout: true },
    };

    it('keeps the full phone sizes on a cold split or JS reload, then can fill fullscreen', () => {
        const ordinary = sizesFor(full);
        const split = sizesFor({
            ...full, width: 200, height: 600,
            android: { supportsAndroidWindowLayout: true, androidWindowLayout: model },
        });
        const actual = numbersOf(split);
        actual['screen.windowWidth'] = ordinary.screen.windowWidth;
        expect(actual).toEqual(numbersOf(ordinary));
        expect(split.sideInsets).toBe(0);
    });
});
