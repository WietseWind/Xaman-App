import React from 'react';
import { AppState, Linking, PermissionsAndroid, Platform, Text, View } from 'react-native';
import TestRenderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { Camera } from 'react-native-vision-camera';

import CameraScanner from '../CameraScanner';

let mockDevice: any = { id: 'back', hasTorch: true };
jest.mock('@theme', () => ({ AppColors: { black: '#000000' }, AppStyles: { flex1: { flex: 1 } } }));
jest.mock('react-native-vision-camera', () => {
    const ReactModule = require('react');
    const Component: any = (props: any) => ReactModule.createElement('NativeCamera', props);
    Component.getCameraPermissionStatus = jest.fn();
    Component.requestCameraPermission = jest.fn();
    return {
        Camera: Component,
        useCameraDevice: () => mockDevice,
        useCodeScanner: (options: any) => options,
    };
});

const deferred = () => {
    let resolve: (value: any) => void = () => undefined;
    let reject: (error: Error) => void = () => undefined;
    const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
let tree: ReactTestRenderer | undefined;
let appStateListener: (state: string) => void;
let removeAppState: jest.Mock;
let onRead: jest.Mock;
let onTorch: jest.Mock;
const permissionView = (request: () => void, settings: boolean, busy: boolean) => (
    <View testID="permission" onTouchEnd={request} accessibilityState={{ disabled: busy }}>
        <Text>{settings ? 'Settings' : 'Approve'}</Text>
    </View>
);
const unavailable = (retry: () => void) => <View testID="unavailable" onTouchEnd={retry} />;
const mount = (visible = true) => {
    act(() => {
        tree = TestRenderer.create(
            <CameraScanner
                onRead={onRead}
                onHasTorchChange={onTorch}
                renderNotAuthorized={permissionView}
                renderUnavailable={unavailable}
                visible={visible}
            >
                <Text>Preview</Text>
            </CameraScanner>,
        );
    });
    return tree!;
};
const permission = () => tree!.root.findByProps({ testID: 'permission' });
const camera = () => tree!.root.findByType('NativeCamera' as any);
const state = (next: string) => act(() => appStateListener(next));
const setStatus = (status: string) => jest.mocked(Camera.getCameraPermissionStatus).mockReturnValue(status as any);
const approve = () => act(() => permission().props.onTouchEnd());

beforeEach(() => {
    jest.clearAllMocks();
    jest.replaceProperty(Platform, 'OS', 'android');
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    removeAppState = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener: any) => {
        appStateListener = listener;
        return { remove: removeAppState };
    });
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    jest.mocked(Camera.getCameraPermissionStatus).mockReset();
    jest.mocked(Camera.requestCameraPermission).mockReset().mockResolvedValue('granted');
    mockDevice = { id: 'back', hasTorch: true };
    onRead = jest.fn(); onTorch = jest.fn();
});
afterEach(() => {
    act(() => tree?.unmount());
    tree = undefined;
    jest.restoreAllMocks();
});

it.each(['denied', 'not-determined'])(
    'requests Android %s access once and mounts the QR preview after grant', async (status) => {
    setStatus(status);
    mount();
    expect(PermissionsAndroid.request).toHaveBeenCalledTimes(1);
    expect(PermissionsAndroid.request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.CAMERA);
    expect(Camera.requestCameraPermission).not.toHaveBeenCalled();
    expect(permission().props.accessibilityState.disabled).toBe(true);
    await flush();
    expect(camera().props.isActive).toBe(true);
    expect(camera().props.testID).toBe('scan-camera-preview');
    expect(camera().props.audio).toBe(false);
    expect(camera().props.torch).toBe('off');
    expect(camera().props.codeScanner.codeTypes).toEqual(['qr']);
    act(() => camera().props.codeScanner.onCodeScanned([{ value: 'public-qr' }]));
    expect(onRead).toHaveBeenCalledWith('public-qr');
    expect(onTorch).toHaveBeenCalledWith(true);
    },
);

it('keeps ordinary Android denial retryable without another automatic prompt or Settings jump', async () => {
    setStatus('denied');
    jest.mocked(PermissionsAndroid.request).mockResolvedValueOnce(PermissionsAndroid.RESULTS.DENIED);
    mount(); await flush();
    expect(permission().findByType(Text).props.children).toBe('Approve');
    expect(permission().props.accessibilityState.disabled).toBe(false);
    setStatus('not-determined');
    state('inactive'); state('active'); await flush();
    expect(PermissionsAndroid.request).toHaveBeenCalledTimes(1);
    expect(Linking.openSettings).not.toHaveBeenCalled();
    approve(); await flush();
    expect(PermissionsAndroid.request).toHaveBeenCalledTimes(2);
    expect(camera()).toBeDefined();
});

it('offers Settings after permanent Android denial, then refreshes only on an active return', async () => {
    setStatus('denied');
    jest.mocked(PermissionsAndroid.request).mockResolvedValueOnce(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
    mount(); await flush();
    expect(permission().findByType(Text).props.children).toBe('Settings');
    expect(Linking.openSettings).not.toHaveBeenCalled();
    approve(); await flush();
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
    expect(PermissionsAndroid.request).toHaveBeenCalledTimes(1);
    setStatus('granted');
    state('background');
    expect(tree!.root.findAllByType('NativeCamera' as any)).toHaveLength(0);
    state('active'); await flush();
    expect(camera().props.isActive).toBe(true);
    expect(PermissionsAndroid.request).toHaveBeenCalledTimes(1);
});

it('deduplicates explicit presses while a native request is pending', async () => {
    setStatus('denied');
    jest.mocked(PermissionsAndroid.request).mockResolvedValueOnce(PermissionsAndroid.RESULTS.DENIED);
    mount(); await flush();
    const pending = deferred();
    jest.mocked(PermissionsAndroid.request).mockReturnValueOnce(pending.promise);
    const request = permission().props.onTouchEnd;
    act(() => { request(); request(); request(); });
    expect(PermissionsAndroid.request).toHaveBeenCalledTimes(2);
    expect(permission().props.accessibilityState.disabled).toBe(true);
    await act(async () => pending.resolve('granted'));
    expect(camera()).toBeDefined();
});

it('retains permanent-denial metadata when the foreground status arrives before the request result', async () => {
    setStatus('not-determined');
    jest.mocked(PermissionsAndroid.request).mockResolvedValueOnce(PermissionsAndroid.RESULTS.DENIED);
    mount(); await flush();
    state('inactive'); state('active');
    const pending = deferred();
    jest.mocked(PermissionsAndroid.request).mockReturnValueOnce(pending.promise);
    approve();
    setStatus('denied'); state('inactive'); state('active');
    await act(async () => pending.resolve(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN));
    expect(permission().findByType(Text).props.children).toBe('Settings');
    expect(Linking.openSettings).not.toHaveBeenCalled();
    expect(PermissionsAndroid.request).toHaveBeenCalledTimes(2);
});

it('catches a native request rejection and permits an explicit retry', async () => {
    setStatus('denied');
    jest.mocked(PermissionsAndroid.request).mockRejectedValueOnce(new Error('NO_ACTIVITY'));
    mount(); await flush();
    expect(permission().props.accessibilityState.disabled).toBe(false);
    expect(Linking.openSettings).not.toHaveBeenCalled();
    approve(); await flush();
    expect(camera()).toBeDefined();
    expect(PermissionsAndroid.request).toHaveBeenCalledTimes(2);
});

it('catches Settings failure and permits an explicit retry', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    setStatus('denied');
    jest.mocked(Linking.openSettings).mockRejectedValueOnce(new Error('unavailable'));
    mount(); approve(); await flush();
    expect(permission().props.accessibilityState.disabled).toBe(false);
    approve(); await flush();
    expect(Linking.openSettings).toHaveBeenCalledTimes(2);
    expect(Camera.requestCameraPermission).not.toHaveBeenCalled();
});

it.each(['denied', 'restricted'])('does not automatically request iOS %s access', async (status) => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    setStatus(status);
    mount(); await flush();
    expect(Camera.requestCameraPermission).not.toHaveBeenCalled();
    expect(PermissionsAndroid.request).not.toHaveBeenCalled();
    expect(permission().findByType(Text).props.children).toBe('Settings');
    approve(); await flush();
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
});

it('requests iOS not-determined once and keeps denial on Settings without repeating', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    setStatus('not-determined');
    jest.mocked(Camera.requestCameraPermission).mockResolvedValueOnce('denied');
    mount(); await flush();
    setStatus('denied');
    state('inactive'); state('active'); await flush();
    expect(Camera.requestCameraPermission).toHaveBeenCalledTimes(1);
    expect(permission().findByType(Text).props.children).toBe('Settings');
    expect(Linking.openSettings).not.toHaveBeenCalled();
});

it('defers the single automatic request until the app becomes active', async () => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' });
    setStatus('denied'); mount(); await flush();
    expect(PermissionsAndroid.request).not.toHaveBeenCalled();
    state('active'); await flush();
    expect(PermissionsAndroid.request).toHaveBeenCalledTimes(1);
});

it('waits for the native scan screen to become visible and rejects reads while hidden', async () => {
    setStatus('denied'); mount(false); await flush();
    expect(PermissionsAndroid.request).not.toHaveBeenCalled();
    const render = (visible: boolean) => (
        <CameraScanner
            onRead={onRead}
            renderNotAuthorized={permissionView}
            renderUnavailable={unavailable}
            visible={visible}
        />
    );
    act(() => tree!.update(render(true))); await flush();
    expect(PermissionsAndroid.request).toHaveBeenCalledTimes(1);
    const native = camera().props;
    act(() => tree!.update(render(false)));
    expect(camera().props.isActive).toBe(false);
    act(() => native.codeScanner.onCodeScanned([{ value: 'hidden-qr' }]));
    expect(onRead).not.toHaveBeenCalled();
    act(() => tree!.update(render(true)));
    expect(camera().props.isActive).toBe(true);
    expect(PermissionsAndroid.request).toHaveBeenCalledTimes(1);
});

it('recognizes Android revocation and pauses the preview without automatically requesting again', async () => {
    setStatus('granted'); mount();
    const oldCodeScanner = camera().props.codeScanner;
    state('background');
    expect(camera().props.isActive).toBe(false);
    act(() => oldCodeScanner.onCodeScanned([{ value: 'background-qr' }]));
    expect(onRead).not.toHaveBeenCalled();
    setStatus('not-determined'); state('active'); await flush();
    expect(tree!.root.findAllByType('NativeCamera' as any)).toHaveLength(0);
    expect(permission()).toBeDefined();
    expect(PermissionsAndroid.request).not.toHaveBeenCalled();
    act(() => oldCodeScanner.onCodeScanned([{ value: 'revoked-qr' }]));
    expect(onRead).not.toHaveBeenCalled();
});

it('preserves the iOS transient not-determined grant guard', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    setStatus('granted'); mount();
    setStatus('not-determined'); state('inactive'); state('active'); await flush();
    expect(camera().props.isActive).toBe(true);
    expect(Camera.requestCameraPermission).not.toHaveBeenCalled();
});

it('ignores a stale request result after a newer Settings status refresh', async () => {
    setStatus('denied');
    const pending = deferred();
    jest.mocked(PermissionsAndroid.request).mockReturnValueOnce(pending.promise);
    mount();
    setStatus('granted'); state('active');
    await act(async () => pending.resolve(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN));
    expect(camera()).toBeDefined();
    expect(PermissionsAndroid.request).toHaveBeenCalledTimes(1);
});

it('ignores a late request result after unmount and removes the AppState listener', async () => {
    setStatus('denied');
    const pending = deferred();
    jest.mocked(PermissionsAndroid.request).mockReturnValueOnce(pending.promise);
    mount(); act(() => tree!.unmount()); tree = undefined;
    await act(async () => pending.resolve('granted'));
    expect(removeAppState).toHaveBeenCalledTimes(1);
    expect(onRead).not.toHaveBeenCalled();
    expect(Linking.openSettings).not.toHaveBeenCalled();
});

it('keeps the no-device fallback and retries a failed preview without accepting stale camera callbacks', () => {
    setStatus('granted');
    mockDevice = undefined; mount();
    expect(tree!.root.findByProps({ testID: 'unavailable' })).toBeDefined();
    expect(PermissionsAndroid.request).not.toHaveBeenCalled();
    mockDevice = { id: 'back', hasTorch: false };
    act(() => tree!.update(
        <CameraScanner onRead={onRead} renderNotAuthorized={permissionView} renderUnavailable={unavailable} />,
    ));
    const old = camera().props;
    act(() => old.onError(new Error('preview stopped')));
    expect(tree!.root.findByProps({ testID: 'unavailable' })).toBeDefined();
    act(() => tree!.root.findByProps({ testID: 'unavailable' }).props.onTouchEnd());
    expect(camera().props.torch).toBe('off');
    act(() => { old.onStarted(); old.codeScanner.onCodeScanned([{ value: 'stale-qr' }]); });
    expect(onRead).not.toHaveBeenCalled();
    expect(tree!.root.findByProps({ testID: 'unavailable' })).toBeDefined();
    act(() => camera().props.onStarted());
    expect(tree!.root.findAllByProps({ testID: 'unavailable' })).toHaveLength(0);
    act(() => old.onError(new Error('stale error')));
    expect(tree!.root.findAllByProps({ testID: 'unavailable' })).toHaveLength(0);
    const latest = camera().props;
    act(() => tree!.unmount()); tree = undefined;
    act(() => latest.codeScanner.onCodeScanned([{ value: 'unmounted-qr' }]));
    expect(onRead).not.toHaveBeenCalled();
});
