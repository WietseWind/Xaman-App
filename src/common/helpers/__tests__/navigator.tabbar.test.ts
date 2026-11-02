type Runtime = {
    Navigator: typeof import('../navigator').Navigator;
    Navigation: typeof import('react-native-navigation').Navigation;
    StyleService: typeof import('@services/StyleService').default;
    screens: typeof import('@common/constants/screens').default;
    device: typeof import('../device');
    interactions: (() => Promise<void>)[];
    frames: FrameRequestCallback[];
    pixelRatio: number;
};

jest.mock('@services/LoggerService', () => ({
    __esModule: true,
    default: { logEvent: jest.fn() },
    LogEvents: { LaunchingNavigator: 'LaunchingNavigator' },
}));
jest.mock('@services/NavigationService', () => ({
    __esModule: true,
    default: {
        getCurrentScreen: () => 'app.TabBar.XApps',
        getCurrentModal: () => undefined,
        getCurrentOverlay: () => undefined,
    },
    RootType: { DefaultRoot: 'DefaultRoot' },
    ComponentTypes: {},
}));

const makeRuntime = (
    os: 'ios' | 'android',
    version: string,
    profile = { width: 402, height: 874, scale: 3, bottom: 34 },
): Runtime => {
    let runtime: Runtime;
    jest.isolateModules(() => {
        const native = require('react-native');
        const { Platform, NativeModules, Dimensions, PixelRatio, InteractionManager } = native;
        // React Native exports lazy getters. Retain this isolated runtime after import.
        ['Platform', 'NativeModules', 'Dimensions', 'PixelRatio', 'InteractionManager'].forEach((name) => {
            const value = native[name];
            jest.spyOn(native, name, 'get').mockReturnValue(value);
        });
        Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
        Object.defineProperty(Platform, 'Version', { configurable: true, get: () => version });
        NativeModules.DeviceUtilsModule.osVersion = version;
        NativeModules.DeviceUtilsModule.layoutInsets = { top: 59, bottom: profile.bottom };
        NativeModules.DeviceUtilsModule.tabBarMetrics = { itemHeight: 49, height: 49 + profile.bottom };
        jest.spyOn(Dimensions, 'get').mockReturnValue({
            width: profile.width, height: profile.height, scale: profile.scale, fontScale: 1,
        });
        jest.spyOn(PixelRatio, 'get').mockReturnValue(profile.scale);
        const interactions: (() => Promise<void>)[] = [];
        const frames: FrameRequestCallback[] = [];
        jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback: any) => {
            interactions.push(callback);
            return { cancel: jest.fn() };
        });
        jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
            frames.push(callback);
            return frames.length;
        });
        const { Navigation } = require('react-native-navigation');
        Navigation.setRoot.mockResolvedValue(undefined);
        Navigation.setDefaultOptions = jest.fn();
        Navigation.updateProps = jest.fn();
        runtime = {
            Navigator: require('../navigator').Navigator,
            Navigation,
            StyleService: require('@services/StyleService').default,
            screens: require('@common/constants/screens').default,
            device: require('../device'),
            interactions,
            frames,
            pixelRatio: profile.scale,
        };
    });
    return runtime!;
};

const start = async (runtime: Runtime) => {
    runtime.StyleService.setTheme('light');
    runtime.Navigator.startDefault();
    expect(runtime.interactions).toHaveLength(1);
    await runtime.interactions.shift()!();
    expect(runtime.Navigation.setRoot).toHaveBeenCalledTimes(1);
    const [{ root }] = jest.mocked(runtime.Navigation.setRoot).mock.calls[0];
    const { children } = (root as any).bottomTabs;
    expect(children).toHaveLength(5);
    return Object.fromEntries(children.map(({ stack }: any) => [stack.id, stack.options.bottomTab]));
};

const refresh = (runtime: Runtime) => {
    jest.mocked(runtime.Navigation.mergeOptions).mockClear();
    runtime.Navigator.reRender();
    while (runtime.frames.length) runtime.frames.shift()!(0);
    return Object.fromEntries(jest.mocked(runtime.Navigation.mergeOptions).mock.calls
        .filter(([, options]) => options.bottomTab)
        .map(([id, options]) => [id, options.bottomTab]));
};

const expectTab = (runtime: Runtime, options: any, tab: string, glass: boolean, android: boolean) => {
    const center = tab === 'Actions';
    const factor = center ? 0.65 : 0.9;
    const names: Record<string, string> = { Home: 'Home', Events: 'Events', Actions: 'Actions',
        XApps: 'Xapp', Settings: 'Settings' };
    const image = `IconTabBar${names[tab]}`;
    const baseScale = runtime.device.GetBottomTabScale(factor);
    const scale = glass && !center ? Math.min(baseScale / 0.72, (64 * runtime.pixelRatio) / 21) : baseScale;
    expect(options.icon).toEqual({ ...runtime.StyleService.getImage(image), scale });
    expect(options.selectedIcon).toEqual({
        ...runtime.StyleService.getImage(center ? image : `${image}Selected`), scale,
    });
    const muted = runtime.StyleService.isDarkMode() ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';
    expect(options.textColor).toBe(glass ? muted : runtime.StyleService.value('$grey'));
    expect(options.selectedTextColor).toBe(runtime.StyleService.value('$textPrimary'));
    if (glass) expect(options.fontSize).toBe(10);
    else expect(options).not.toHaveProperty('fontSize');
    expect(options.selectTabOnPress).toBe(!center);
    expect(options.testID).toBe(`tab-${tab}`);
    if (glass && !center) {
        expect(options.iconColor).toBe(muted);
        expect(options.selectedIconColor).toBe(runtime.StyleService.value('$textPrimary'));
    } else {
        expect(options).not.toHaveProperty('iconColor');
        expect(options).not.toHaveProperty('selectedIconColor');
    }
    if (android) {
        expect(options.iconWidth).toBe(runtime.device.GetBottomTabIconDp(factor));
        expect(options.iconHeight).toBe(runtime.device.GetBottomTabIconDp(factor));
    } else {
        expect(options).not.toHaveProperty('iconWidth');
        expect(options).not.toHaveProperty('iconHeight');
    }
};

afterEach(() => jest.restoreAllMocks());

it.each(['26.5', '27.0.1'])(
    'uses smaller text-coloured side icons on iOS %s, including after a theme change', async (version) => {
        const runtime = makeRuntime('ios', version);
        const initial = await start(runtime);
        expect(jest.mocked(runtime.Navigation.setDefaultOptions).mock.calls.at(-1)?.[0].bottomTabs?.barStyle)
            .toBe('default');
        Object.keys(runtime.screens.TabBar).forEach((tab) => {
            expectTab(runtime, initial[`bottomTab-${tab}`], tab, true, false);
        });
        const lightColor = initial['bottomTab-Home'].iconColor;
        const lightCenter = initial['bottomTab-Actions'];
        runtime.StyleService.setTheme('dark');
        const updated = refresh(runtime);
        expect(jest.mocked(runtime.Navigation.setDefaultOptions).mock.calls.at(-1)?.[0].bottomTabs?.barStyle)
            .toBe('black');
        Object.keys(runtime.screens.TabBar).forEach((tab) => {
            expectTab(runtime, updated[(runtime.screens.TabBar as any)[tab]], tab, true, false);
        });
        expect(updated[runtime.screens.TabBar.Home].iconColor).not.toBe(lightColor);
        expect(updated[runtime.screens.TabBar.Actions].icon.scale).toBe(lightCenter.icon.scale);
        expect(updated[runtime.screens.TabBar.Actions].text).toBe('');
        runtime.StyleService.setTheme('light');
        const restored = refresh(runtime);
        expect(jest.mocked(runtime.Navigation.setDefaultOptions).mock.calls.at(-1)?.[0].bottomTabs?.barStyle)
            .toBe('default');
        Object.keys(runtime.screens.TabBar).forEach((tab) => {
            expectTab(runtime, restored[(runtime.screens.TabBar as any)[tab]], tab, true, false);
            expect(restored[(runtime.screens.TabBar as any)[tab]].icon.scale)
                .toBe(initial[`bottomTab-${tab}`].icon.scale);
            expect(restored[(runtime.screens.TabBar as any)[tab]].fontSize)
                .toBe(initial[`bottomTab-${tab}`].fontSize);
        });
        ['moonlight', 'royal'].forEach((theme) => {
            runtime.StyleService.setTheme(theme as any);
            const themed = refresh(runtime);
            Object.keys(runtime.screens.TabBar).forEach((tab) => {
                expectTab(runtime, themed[(runtime.screens.TabBar as any)[tab]], tab, true, false);
            });
            expect(jest.mocked(runtime.Navigation.setDefaultOptions).mock.calls.at(-1)?.[0].bottomTabs?.barStyle)
                .toBe('black');
        });
    },
);

it.each([
    ['ios', '18.5'],
    ['ios', '25.0'],
    ['android', '36'],
] as const)('preserves regular tab icon sizing and colours on %s %s', async (os, version) => {
    const runtime = makeRuntime(os, version);
    const initial = await start(runtime);
    expect(jest.mocked(runtime.Navigation.setDefaultOptions).mock.calls.at(-1)?.[0].bottomTabs)
        .not.toHaveProperty('barStyle');
    Object.keys(runtime.screens.TabBar).forEach((tab) => {
        expectTab(runtime, initial[`bottomTab-${tab}`], tab, false, os === 'android');
    });
    runtime.StyleService.setTheme('dark');
    const updated = refresh(runtime);
    Object.keys(runtime.screens.TabBar).forEach((tab) => {
        expectTab(runtime, updated[(runtime.screens.TabBar as any)[tab]], tab, false, os === 'android');
    });
});

it.each([
    { width: 375, height: 667, scale: 2, bottom: 0 },
    { width: 393, height: 852, scale: 3, bottom: 34 },
    { width: 430, height: 932, scale: 3, bottom: 34 },
])('keeps every iOS navbar glyph at least 2pt thick on $width pt screens', async (profile) => {
    const assets = require('../../../../scripts/xapp-store-assets/asset-map.json');
    const runtime = makeRuntime('ios', '27.0.1', profile);
    const options = await start(runtime);
    const iconScale = options['bottomTab-Home'].icon.scale;
    const sideAssets = Object.entries(assets).filter(([name]) => name.startsWith('IconTabBar'));
    expect(sideAssets).toHaveLength(12);
    sideAssets.forEach(([, asset]: any) => {
        expect(asset.ios_native_stroke_width * profile.scale / iconScale).toBeGreaterThanOrEqual(2);
        expect(asset.native_stroke_width).toBe(3.2);
    });
});
