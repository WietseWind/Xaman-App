import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AccessibilityInfo, InteractionManager, LayoutAnimation } from 'react-native';
import HomeView from '../HomeView';

jest.mock('@store/repositories', () => ({
    CoreRepository: { getSettings: () => ({ account: {}, network: {} }), on: jest.fn(), off: jest.fn() },
    AccountRepository: { on: jest.fn(), off: jest.fn() },
}));
jest.mock('@common/libs/preferences', () => ({
    __esModule: true,
    default: { get: () => Promise.resolve('false'), keys: { EXPERIMENTAL_SIMPLICITY_UI: 'test' } },
}));
jest.mock('react-native-navigation', () => ({
    Navigation: { events: () => ({ bindComponent: () => ({ remove: jest.fn() }) }) },
}));
jest.mock('@common/helpers/navigator', () => ({ Navigator: {} }));
jest.mock('tangem-sdk-react-native', () => ({
    __esModule: true, default: { stopSession: () => Promise.resolve() },
}));

let tree: renderer.ReactTestRenderer | undefined;
let changed: (enabled: boolean) => void;
let remove: jest.Mock;
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const mount = async () => {
    await act(async () => { tree = renderer.create(<HomeView timestamp={1} />); await flush(); });
    return tree!.getInstance() as HomeView;
};

beforeEach(() => {
    remove = jest.fn();
    jest.spyOn(HomeView.prototype, 'render').mockReturnValue(null);
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockReturnValue({ cancel: jest.fn() } as any);
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_event, listener: any) => {
        changed = listener; return { remove };
    });
    jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
});
afterEach(async () => {
    act(() => { tree?.unmount(); }); tree = undefined;
    await flush(); jest.restoreAllMocks();
});

it('animates both collapse and restore using one short native layout transition per change', async () => {
    const home = await mount();
    act(() => home.hideTopElements(true));
    expect(home.state.hideTopElements).toBe(true);
    expect(LayoutAnimation.configureNext).toHaveBeenLastCalledWith({
        duration: 160,
        update: { type: LayoutAnimation.Types.easeInEaseOut },
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });
    act(() => home.hideTopElements(false));
    expect(home.state.hideTopElements).toBe(false);
    expect(LayoutAnimation.configureNext).toHaveBeenCalledTimes(2);
});

it('ignores the settings overlay repeating the same hide request', async () => {
    const home = await mount();
    act(() => { home.hideTopElements(true); home.hideTopElements(true); });
    expect(LayoutAnimation.configureNext).toHaveBeenCalledTimes(1);
    expect(home.state.hideTopElements).toBe(true);
});

it('keeps rapid collapse/restore requests in order even within the same batched event', async () => {
    const home = await mount();
    act(() => { home.hideTopElements(true); home.hideTopElements(false); });
    expect(home.state.hideTopElements).toBe(false);
    expect(LayoutAnimation.configureNext).toHaveBeenCalledTimes(2);
});

it('respects Reduce Motion while still changing the visible header state', async () => {
    const home = await mount(); changed(true);
    act(() => home.hideTopElements(true));
    expect(home.state.hideTopElements).toBe(true);
    expect(LayoutAnimation.configureNext).not.toHaveBeenCalled();
    changed(false); act(() => home.hideTopElements(false));
    expect(LayoutAnimation.configureNext).toHaveBeenCalledTimes(1);
});

it('does not overwrite a newer accessibility event with a delayed initial query', async () => {
    let finish!: (enabled: boolean) => void;
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const home = await mount(); changed(true);
    await act(async () => { finish(false); await flush(); });
    act(() => home.hideTopElements(true));
    expect(LayoutAnimation.configureNext).not.toHaveBeenCalled();
});

it('removes its accessibility listener and ignores late overlay callbacks after unmount', async () => {
    const home = await mount(); const update = jest.spyOn(home, 'setState');
    act(() => tree!.unmount()); tree = undefined; update.mockClear();
    home.hideTopElements(true);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expect(LayoutAnimation.configureNext).not.toHaveBeenCalled();
});
