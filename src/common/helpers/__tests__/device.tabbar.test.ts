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

    it('uses the same @3x paint factor on SE 3rd gen (no notch) as on 17 Pro', () => {
        apply({ width: 375, ratio: 3, bottom: 0, os: '26.5' });
        const se = GetBottomTabScale(0.65);

        apply({ width: 402, ratio: 3, bottom: 34, os: '26.5' });
        const pro = GetBottomTabScale(0.65);

        // Larger scale → smaller painted icon. SE must not jump to the old
        // 5.49 “no-notch @3x” bucket that made Xaman-se tiny vs e2e.
        expect(se).toBeCloseTo(4.65, 1);
        expect(pro).toBeCloseTo(3.88, 1);
        expect(se).toBeLessThan(5.2);
        expect(se).toBeGreaterThan(pro);
    });

    it('keeps the iPhone 8 @2x iOS 16 compensation', () => {
        apply({ width: 375, ratio: 2, bottom: 0, os: '16.7.1' });
        expect(GetBottomTabScale(0.65)).toBeCloseTo(3.46, 1);
    });

    it('does not apply iOS scale on Android', () => {
        apply({ width: 411, ratio: 2.625, bottom: 24, os: '14', platform: 'android' });
        expect(GetBottomTabScale(0.65)).toBe(0);
    });
});
