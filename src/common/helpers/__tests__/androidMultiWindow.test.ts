import { Dimensions, NativeEventEmitter, NativeModules, Platform } from 'react-native';

jest.mock('react-native', () => ({
    Dimensions: { addEventListener: jest.fn() },
    NativeEventEmitter: jest.fn(),
    NativeModules: { DeviceUtilsModule: {} },
    Platform: { OS: 'android' },
}));

let api: typeof import('../androidMultiWindow');
let nativeEvent: (value: unknown) => void;
let dimensionsChanged: () => void;
const nativeRemove = jest.fn();
const dimensionsRemove = jest.fn();
const addListener = jest.fn();
const snapshot = (revision: number, split = false, width = 411, height = 914) => ({
    revision, isInMultiWindowMode: split, width, height,
});
const flush = async () => { for (let n = 0; n < 8; n += 1) await Promise.resolve(); };

beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    NativeModules.DeviceUtilsModule = {
        supportsAndroidMultiWindowLayout: true,
        androidWindowState: snapshot(0),
        getAndroidWindowState: jest.fn().mockResolvedValue(snapshot(1)),
    };
    addListener.mockImplementation((name, listener) => {
        expect(name).toBe('androidWindowStateChanged');
        nativeEvent = listener;
        return { remove: nativeRemove };
    });
    (NativeEventEmitter as jest.Mock).mockImplementation(() => ({ addListener }));
    (Dimensions.addEventListener as jest.Mock).mockImplementation((name, listener) => {
        dimensionsChanged = listener;
        return { remove: dimensionsRemove };
    });
    jest.isolateModules(() => { api = require('../androidMultiWindow'); });
});

it('requires a new Android capability and never infers split from the window dimensions', () => {
    delete NativeModules.DeviceUtilsModule.supportsAndroidMultiWindowLayout;
    expect(api.getAndroidMultiWindowState()).toBeUndefined();
    const sub = api.subscribeAndroidMultiWindowState(jest.fn());
    sub.remove();
    expect(NativeEventEmitter).not.toHaveBeenCalled();
    NativeModules.DeviceUtilsModule.supportsAndroidMultiWindowLayout = true;
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    expect(api.getAndroidMultiWindowState()).toBeUndefined();
});

it('accepts a true native split flag with unchanged width and height', async () => {
    const listener = jest.fn();
    const sub = api.subscribeAndroidMultiWindowState(listener);
    await flush();
    nativeEvent(snapshot(2, true));
    expect(listener).toHaveBeenCalledWith(snapshot(2, true));
    nativeEvent(snapshot(3, false));
    expect(listener).toHaveBeenLastCalledWith(snapshot(3, false));
    sub.remove();
});

it('shares one native subscription and coalesces size-change queries for all mounted screens', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    const getter = NativeModules.DeviceUtilsModule.getAndroidWindowState as jest.Mock;
    getter.mockReturnValueOnce(new Promise((done) => { resolve = done; }))
        .mockResolvedValueOnce(snapshot(3, true, 430, 400));
    const a = jest.fn();
    const b = jest.fn();
    const first = api.subscribeAndroidMultiWindowState(a);
    const second = api.subscribeAndroidMultiWindowState(b);
    await flush();
    dimensionsChanged(); dimensionsChanged(); dimensionsChanged();
    nativeEvent(snapshot(2, true, 420, 400));
    resolve(snapshot(1));
    await flush();
    expect(NativeEventEmitter).toHaveBeenCalledTimes(1);
    expect(getter).toHaveBeenCalledTimes(2);
    expect(a.mock.calls.map(([value]) => value.width)).toEqual([420, 430]);
    expect(b).toHaveBeenLastCalledWith(snapshot(3, true, 430, 400));
    first.remove();
    expect(nativeRemove).not.toHaveBeenCalled();
    second.remove(); second.remove();
    expect(nativeRemove).toHaveBeenCalledTimes(1);
    expect(dimensionsRemove).toHaveBeenCalledTimes(1);
});

it('rejects stale events, malformed payloads and notifications which only change the revision', async () => {
    const listener = jest.fn();
    const sub = api.subscribeAndroidMultiWindowState(listener);
    await flush();
    nativeEvent(snapshot(4, true, 420, 400));
    nativeEvent(snapshot(3, false));
    nativeEvent({ ...snapshot(5), isInMultiWindowMode: 'true' });
    nativeEvent(snapshot(5, false, Number.NaN));
    nativeEvent(snapshot(4, false));
    nativeEvent(snapshot(6, true, 420, 400));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(api.getAndroidMultiWindowState()).toEqual(snapshot(6, true, 420, 400));
    sub.remove();
    nativeEvent(snapshot(7, false));
    expect(listener).toHaveBeenCalledTimes(1);
});

it('ignores an old getter after unmount even when a new subscription exists', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    const getter = NativeModules.DeviceUtilsModule.getAndroidWindowState as jest.Mock;
    getter.mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValueOnce(snapshot(2));
    const old = api.subscribeAndroidMultiWindowState(jest.fn());
    await flush();
    const staleEvent = nativeEvent;
    old.remove();
    const listener = jest.fn();
    const next = api.subscribeAndroidMultiWindowState(listener);
    await flush();
    resolve(snapshot(100, true));
    staleEvent(snapshot(101, true));
    await flush();
    expect(listener).not.toHaveBeenCalled();
    nativeEvent(snapshot(3, true));
    expect(listener).toHaveBeenCalledWith(snapshot(3, true));
    next.remove();
});

it('keeps the last good snapshot when a native query fails', async () => {
    (NativeModules.DeviceUtilsModule.getAndroidWindowState as jest.Mock).mockRejectedValue(new Error('not ready'));
    const listener = jest.fn();
    const sub = api.subscribeAndroidMultiWindowState(listener);
    await flush();
    expect(api.getAndroidMultiWindowState()).toEqual(snapshot(0));
    expect(listener).not.toHaveBeenCalled();
    sub.remove();
});

it('owns duplicate callback subscriptions separately and does not notify a newly added lease mid-event', async () => {
    const listener = jest.fn();
    const first = api.subscribeAndroidMultiWindowState(listener);
    const second = api.subscribeAndroidMultiWindowState(listener);
    await flush();
    expect(NativeEventEmitter).toHaveBeenCalledTimes(1);
    first.remove();
    nativeEvent(snapshot(2, true));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(nativeRemove).not.toHaveBeenCalled();
    second.remove();
    const newcomer = jest.fn();
    let added: { remove: () => void } | undefined;
    const existing = api.subscribeAndroidMultiWindowState(() => {
        added = api.subscribeAndroidMultiWindowState(newcomer);
    });
    nativeEvent(snapshot(3, false));
    expect(newcomer).not.toHaveBeenCalled();
    existing.remove();
    added?.remove();
});
