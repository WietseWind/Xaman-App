import { Dimensions, NativeModules, PixelRatio, Platform } from 'react-native';

import { GetBottomTabScale } from '../device';

describe('GetBottomTabScale', () => {
    const originalOS = Platform.OS;

    const apply = ({
        width,
        ratio,
        bottom,
        os,
        platform = 'ios',
        itemHeight = 49,
    }: {
        width: number;
        ratio: number;
        bottom: number;
        os: string;
        platform?: string;
        itemHeight?: number;
    }) => {
        Object.defineProperty(Platform, 'OS', { configurable: true, get: () => platform });
        NativeModules.DeviceUtilsModule.osVersion = os;
        NativeModules.DeviceUtilsModule.layoutInsets = { top: 20, bottom };
        NativeModules.DeviceUtilsModule.tabBarMetrics = {
            itemHeight,
            height: itemHeight + bottom,
        };
        jest.spyOn(Dimensions, 'get').mockReturnValue({
            width,
            height: 800,
            scale: ratio,
            fontScale: 1,
        } as any);
        jest.spyOn(PixelRatio, 'get').mockReturnValue(ratio);
    };

    afterEach(() => {
        Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
        jest.restoreAllMocks();
    });

    it('shrinks SE 3rd gen (iOS 26) a touch vs iPhone 8, leaves Pro alone', () => {
        apply({ width: 375, ratio: 2, bottom: 0, os: '26.5' });
        const seCenter = GetBottomTabScale(0.65);
        const seSide = GetBottomTabScale(0.9);

        apply({ width: 375, ratio: 2, bottom: 0, os: '16.7.1' });
        const eightCenter = GetBottomTabScale(0.65);
        const eightSide = GetBottomTabScale(0.9);

        apply({ width: 402, ratio: 3, bottom: 34, os: '26.5' });
        const pro = GetBottomTabScale(0.65);

        // Larger scale → smaller painted icon. SE iOS 18+ @2x only.
        expect(eightCenter).toBeCloseTo(3.46, 1);
        expect(seCenter).toBeCloseTo(4.32, 1);
        expect(seCenter).toBeGreaterThan(eightCenter);
        expect(seSide).toBeGreaterThan(eightSide);
        expect(seCenter / eightCenter).toBeGreaterThan(seSide / eightSide);
        expect(pro).toBeCloseTo(3.88, 1);
        // Stay below the old iOS 26 paint=1 scale (~5.08) that made SE tiny.
        expect(seCenter).toBeLessThan(5.0);
    });

    it('keeps the iPhone 8 @2x compensation', () => {
        apply({ width: 375, ratio: 2, bottom: 0, os: '16.7.1' });
        expect(GetBottomTabScale(0.65)).toBeCloseTo(3.46, 1);
    });

    it('does not apply iOS scale on Android', () => {
        apply({ width: 411, ratio: 2.625, bottom: 24, os: '14', platform: 'android' });
        expect(GetBottomTabScale(0.65)).toBe(0);
    });
});
