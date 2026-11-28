/**
 * The orientation the navigation asks for (issue 553).
 * A phone, and an iPad that gives the app the screen of a phone: portrait, as it always was, and an overlay says
 * nothing about it. An iPad that gives the app a window of its own: the app turns with the iPad, and every overlay
 * says so itself (an overlay that is shown before the default options are set never gets them:
 * the lock screen at the start of the app).
 */
import { NativeModules, Platform } from 'react-native';
import { Navigation } from 'react-native-navigation';

import { AppScreens } from '@common/constants';

import { Navigator } from '../navigator';

const originalOS = Platform.OS;

const device = (isPad: boolean | undefined, padLayout?: { width: number; height: number }) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' });
    if (isPad === undefined) {
        delete NativeModules.DeviceUtilsModule.isPadDevice;
    } else {
        NativeModules.DeviceUtilsModule.isPadDevice = isPad;
    }
    if (padLayout === undefined) {
        delete NativeModules.DeviceUtilsModule.padLayout;
    } else {
        NativeModules.DeviceUtilsModule.padLayout = padLayout;
    }
};

const overlayLayout = (overlay: any) => {
    const spy = jest.spyOn(Navigation, 'showOverlay').mockResolvedValue(overlay);
    Navigator.showOverlay(overlay, {});
    const { layout } = (spy.mock.calls[0][0] as any).component.options;
    spy.mockRestore();
    return layout;
};

const defaultOrientation = () => {
    // the mock of the navigation library has no setDefaultOptions of its own
    const setDefaultOptions = jest.fn();
    const before = (Navigation as any).setDefaultOptions;
    (Navigation as any).setDefaultOptions = setDefaultOptions;
    Navigator.startOnboarding();
    (Navigation as any).setDefaultOptions = before;
    const { layout } = setDefaultOptions.mock.calls[0][0];
    return layout.orientation;
};

afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
    delete NativeModules.DeviceUtilsModule.isPadDevice;
    delete NativeModules.DeviceUtilsModule.padLayout;
    jest.restoreAllMocks();
});

const PORTRAIT_ONLY = { backgroundColor: 'transparent', componentBackgroundColor: 'transparent' };

describe('a phone', () => {
    it('the screens are in portrait, and an overlay has no orientation of its own', () => {
        [undefined, false].forEach((isPad) => {
            device(isPad, { width: 0, height: 0 });
            expect(defaultOrientation()).toEqual(['portrait']);
            expect(overlayLayout(AppScreens.Overlay.Alert)).toEqual(PORTRAIT_ONLY);
        });
    });
});

describe('an iPad that gives the app the screen of a phone (older iPadOS)', () => {
    it('is as a phone: portrait, the system turns that screen itself', () => {
        device(true, { width: 0, height: 0 });
        expect(defaultOrientation()).toEqual(['portrait']);
        expect(overlayLayout(AppScreens.Overlay.HomeActions)).toEqual(PORTRAIT_ONLY);
    });
});

describe('an iPad that gives the app a window of its own (iPadOS 27)', () => {
    it('the screens turn with the iPad, and every overlay says the same itself', () => {
        device(true, { width: 430, height: 932 });
        expect(defaultOrientation()).toEqual(['all']);
        expect(overlayLayout(AppScreens.Overlay.SwitchAccount)).toEqual({ ...PORTRAIT_ONLY, orientation: ['all'] });
    });
});
