import React from 'react';
import { Alert, AppState, BackHandler } from 'react-native';
import { Navigation } from 'react-native-navigation';
import TestRenderer, { act, ReactTestRenderer } from 'react-test-renderer';

import { CoreRepository } from '@store/repositories';
import { Clipboard } from '@common/helpers/clipboard';
import { Navigator } from '@common/helpers/navigator';
import { AppScreens } from '@common/constants';
import { Payload, PayloadOrigin } from '@common/libs/payload';
import BackendService from '@services/BackendService';
import AuthenticationService, { LockStatus } from '@services/AuthenticationService';
import Localize from '@locale';

import CameraScanner from '../CameraScanner';
import ScanModal from '../ScanModal';

jest.mock('../CameraScanner', () => {
    const ReactModule = require('react');
    return (props: any) => ReactModule.createElement('Scanner', props, props.children);
});
jest.mock('@components/General', () => ({
    Button: 'Button', Spacer: 'Spacer', Icon: 'Icon', LoadingIndicator: 'LoadingIndicator',
}));
jest.mock('@services/NetworkService');
jest.mock('@services/LedgerService');

const deferred = () => {
    let resolve: (value: any) => void = () => undefined;
    let reject: (error: Error) => void = () => undefined;
    const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
let tree: ReactTestRenderer | undefined;
let modal: ScanModal;
let handle: jest.SpyInstance;
let closeCallback: jest.Mock;
let removeBack: jest.Mock;
let removeNavigation: jest.Mock;
let locked: boolean;
const originalAppState = AppState.currentState;
const publicUuid = '00000000-0000-4000-8000-000000000001';
const flush = async () => {
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
};
const setAppState = (value: string) => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value });
};
const scanner = () => tree!.root.findByType(CameraScanner);
const mount = () => {
    act(() => { tree = TestRenderer.create(<ScanModal onClose={closeCallback} />); });
    modal = tree!.root.findByType(ScanModal).instance;
    handle = jest.spyOn(modal, 'handle').mockImplementation(() => undefined);
};
const appear = () => act(() => modal.componentDidAppear());

beforeEach(() => {
    jest.clearAllMocks();
    locked = false;
    jest.spyOn(AuthenticationService, 'isLocked', 'get').mockImplementation(() => locked);
    setAppState('active');
    removeBack = jest.fn(); removeNavigation = jest.fn(); closeCallback = jest.fn();
    jest.spyOn(CoreRepository, 'getSettings').mockReturnValue({ hapticFeedback: false } as any);
    jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove: removeBack });
    jest.spyOn(Navigation, 'events').mockReturnValue({
        bindComponent: () => ({ remove: removeNavigation }),
    } as any);
    jest.spyOn(Navigator, 'dismissModal').mockResolvedValue(undefined as any);
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => {
    act(() => tree?.unmount());
    tree = undefined;
    setAppState(originalAppState);
    jest.restoreAllMocks();
    jest.useRealTimers();
});

it('starts the camera only after native appearance and pauses it on disappearance and close', () => {
    mount();
    expect(scanner().props.visible).toBe(false);
    appear();
    expect(scanner().props.visible).toBe(true);
    act(() => modal.componentDidDisappear());
    expect(scanner().props.visible).toBe(false);
    appear();
    expect(scanner().props.visible).toBe(true);
    act(() => modal.onClose());
    expect(scanner().props.visible).toBe(false);
    appear();
    expect(scanner().props.visible).toBe(false);
    expect(closeCallback).toHaveBeenCalledTimes(1);
});

it('accepts a QR only while the screen and app are active, and blocks duplicate reads', () => {
    mount();
    act(() => scanner().props.onRead('before-appear'));
    expect(handle).not.toHaveBeenCalled();
    appear();
    setAppState('background');
    act(() => scanner().props.onRead('background'));
    expect(handle).not.toHaveBeenCalled();
    setAppState('active');
    act(() => { scanner().props.onRead('public-qr'); scanner().props.onRead('duplicate'); });
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledWith('public-qr');
    act(() => modal.setShouldRead(true));
    act(() => scanner().props.onRead('retry-qr'));
    expect(handle).toHaveBeenLastCalledWith('retry-qr');
});

it('keeps the camera epoch valid after a QR is rejected and reading is enabled again', () => {
    mount(); appear();
    const cameraProps = scanner().props;
    act(() => cameraProps.onRead('rejected-public-qr'));
    act(() => modal.setShouldRead(true));
    expect(cameraProps.canUseCamera(cameraProps.activityEpoch)).toBe(true);
    act(() => cameraProps.onRead('retry-public-qr'));
    expect(handle).toHaveBeenCalledTimes(2);
    expect(handle).toHaveBeenLastCalledWith('retry-public-qr');
});

it('suppresses a queued native QR as soon as Close is pressed, before native disappearance', () => {
    mount(); appear();
    const read = scanner().props.onRead;
    act(() => modal.onClose());
    act(() => read('queued-qr'));
    expect(handle).not.toHaveBeenCalled();
    expect(Navigator.dismissModal).toHaveBeenCalledTimes(1);
    act(() => modal.setShouldRead(true));
    act(() => read('late-reenabled-qr'));
    expect(handle).not.toHaveBeenCalled();
});

it.each(['close', 'unmount', 'hide-show'])(
    'rejects a pending clipboard reply after %s', async (transition) => {
        mount(); appear();
        const pending = deferred();
        jest.spyOn(Clipboard, 'getString').mockReturnValueOnce(pending.promise);
        const reading = modal.checkClipboardContent();
        act(() => {
            if (transition === 'close') modal.onClose();
            if (transition === 'unmount') { tree!.unmount(); tree = undefined; }
            if (transition === 'hide-show') { modal.componentDidDisappear(); modal.componentDidAppear(); }
        });
        await act(async () => { pending.resolve('late-public-content'); await reading; });
        expect(handle).not.toHaveBeenCalled();
        if (transition === 'unmount') {
            expect(removeBack).toHaveBeenCalledTimes(1);
            expect(removeNavigation).toHaveBeenCalledTimes(1);
        }
    },
);

it('can read fresh clipboard content after a hide-show invalidates the previous read', async () => {
    mount(); appear();
    const old = deferred();
    jest.spyOn(Clipboard, 'getString').mockReturnValueOnce(old.promise).mockResolvedValueOnce('fresh-public-content');
    const reading = modal.checkClipboardContent();
    act(() => { modal.componentDidDisappear(); modal.componentDidAppear(); });
    await act(async () => { old.resolve('old-public-content'); await reading; });
    await act(async () => { await modal.checkClipboardContent(); });
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledWith('fresh-public-content', true);
});

it('keeps a failed clipboard read retryable without consuming or routing content', async () => {
    mount(); appear();
    jest.spyOn(Clipboard, 'getString')
        .mockRejectedValueOnce(new Error('clipboard unavailable')).mockResolvedValueOnce('retry-public-content');
    await act(async () => { await modal.checkClipboardContent(); });
    expect(handle).not.toHaveBeenCalled();
    await act(async () => { await modal.checkClipboardContent(); });
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledWith('retry-public-content', true);
});

it('rejects camera callbacks after unmount', () => {
    mount(); appear();
    const read = scanner().props.onRead;
    act(() => tree!.unmount()); tree = undefined;
    act(() => read('unmounted-public-qr'));
    expect(handle).not.toHaveBeenCalled();
});

it('removes its authentication listener on unmount', () => {
    const before = AuthenticationService.listenerCount('lockStateChange');
    mount();
    expect(AuthenticationService.listenerCount('lockStateChange')).toBe(before + 1);
    act(() => tree!.unmount()); tree = undefined;
    expect(AuthenticationService.listenerCount('lockStateChange')).toBe(before);
});

it('keeps a scanner mounted under an existing lock paused until authentication unlocks it', () => {
    locked = true;
    mount(); appear();
    expect(scanner().props.visible).toBe(false);
    expect(scanner().props.canUseCamera()).toBe(false);
    act(() => scanner().props.onRead('locked-qr'));
    expect(handle).not.toHaveBeenCalled();
    act(() => { locked = false; AuthenticationService.emit('lockStateChange', LockStatus.UNLOCKED); });
    expect(scanner().props.visible).toBe(true);
    act(() => scanner().props.onRead('unlocked-qr'));
    expect(handle).toHaveBeenCalledWith('unlocked-qr');
});

it('pauses on lock, turns off the torch and invalidates the captured camera epoch even in one batch', () => {
    mount(); appear();
    act(() => { modal.onHasTorchChange(true); });
    act(() => modal.toggleTorch());
    expect(modal.state.torchEnabled).toBe(true);
    const old = scanner().props;
    expect(old.canUseCamera(old.activityEpoch)).toBe(true);
    act(() => {
        locked = true; AuthenticationService.emit('lockStateChange', LockStatus.LOCKED);
        expect(old.canUseCamera()).toBe(false);
        old.onRead('locked-qr');
        locked = false; AuthenticationService.emit('lockStateChange', LockStatus.UNLOCKED);
        expect(old.canUseCamera(old.activityEpoch)).toBe(false);
    });
    expect(handle).not.toHaveBeenCalled();
    expect(modal.state.torchEnabled).toBe(false);
    expect(scanner().props.activityEpoch).not.toBe(old.activityEpoch);
    expect(scanner().props.canUseCamera(scanner().props.activityEpoch)).toBe(true);
});

it('does not restart a hidden or closing scanner when authentication unlocks', () => {
    mount(); appear();
    act(() => {
        locked = true; AuthenticationService.emit('lockStateChange', LockStatus.LOCKED);
        modal.componentDidDisappear();
        locked = false; AuthenticationService.emit('lockStateChange', LockStatus.UNLOCKED);
    });
    expect(scanner().props.visible).toBe(false);
    appear();
    act(() => modal.onClose());
    act(() => AuthenticationService.emit('lockStateChange', LockStatus.UNLOCKED));
    expect(scanner().props.visible).toBe(false);
});

it('rejects clipboard content from before a lock even after authentication unlocks', async () => {
    mount(); appear();
    const pending = deferred();
    jest.spyOn(Clipboard, 'getString').mockReturnValueOnce(pending.promise);
    const reading = modal.checkClipboardContent();
    act(() => {
        locked = true; AuthenticationService.emit('lockStateChange', LockStatus.LOCKED);
        locked = false; AuthenticationService.emit('lockStateChange', LockStatus.UNLOCKED);
    });
    await act(async () => { pending.resolve('pre-lock-content'); await reading; });
    expect(handle).not.toHaveBeenCalled();
});

it.each(['resolve', 'reject'])(
    'cancels a payload %s across lock and unlock, then permits a fresh read', async (outcome) => {
    mount(); appear();
    const pending = deferred();
    jest.spyOn(Payload, 'from').mockReturnValueOnce(pending.promise);
    const route = jest.spyOn(modal, 'routeUser');
    let reading: Promise<void>;
    act(() => { reading = modal.handlePayloadReference(publicUuid); });
    expect(modal.state.isLoading).toBe(true);
    act(() => {
        locked = true; AuthenticationService.emit('lockStateChange', LockStatus.LOCKED);
        locked = false; AuthenticationService.emit('lockStateChange', LockStatus.UNLOCKED);
    });
    expect(modal.state.isLoading).toBe(false);
    await act(async () => {
        if (outcome === 'resolve') pending.resolve({ request_json: {} });
        else pending.reject(new Error('late payload failure'));
        await reading!;
    });
    expect(route).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
    act(() => scanner().props.onRead('fresh-after-unlock'));
    expect(handle).toHaveBeenCalledWith('fresh-after-unlock');
    },
);

it.each(['resolve', 'reject'])('ignores a translation %s from before lock and unlock', async (outcome) => {
    mount(); appear();
    const pending = deferred();
    jest.spyOn(BackendService, 'getTranslation').mockReturnValueOnce(pending.promise);
    jest.spyOn(Localize, 'setLocaleBundle').mockImplementation(() => undefined);
    jest.spyOn(Navigator, 'reRender').mockImplementation(() => undefined);
    act(() => modal.loadTranslation(publicUuid));
    act(() => {
        locked = true; AuthenticationService.emit('lockStateChange', LockStatus.LOCKED);
        locked = false; AuthenticationService.emit('lockStateChange', LockStatus.UNLOCKED);
    });
    const writes = jest.spyOn(modal, 'setState');
    if (outcome === 'resolve') pending.resolve({ meta: { valid: true, language: 'NL' }, translation: {} });
    else pending.reject(new Error('late translation failure'));
    await flush();
    expect(Localize.setLocaleBundle).not.toHaveBeenCalled();
    expect(Navigator.reRender).not.toHaveBeenCalled();
    expect(Navigator.dismissModal).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
    expect(modal.state.isLoading).toBe(false);
});

it.each(['resolve', 'reject'])('ignores a late payload %s after Close', async (outcome) => {
    mount(); appear();
    const pending = deferred();
    jest.spyOn(Payload, 'from').mockReturnValueOnce(pending.promise);
    const route = jest.spyOn(modal, 'routeUser');
    const writes = jest.spyOn(modal, 'setState');
    let reading: Promise<void>;
    act(() => { reading = modal.handlePayloadReference(publicUuid); });
    expect(Payload.from).toHaveBeenCalledWith(publicUuid, PayloadOrigin.QR);
    act(() => modal.onClose());
    const writesAtClose = writes.mock.calls.length;
    await act(async () => {
        if (outcome === 'resolve') pending.resolve({ request_json: { TransactionType: 'Payment' } });
        else pending.reject(new Error('payload unavailable'));
        await reading!;
    });
    expect(route).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(writes).toHaveBeenCalledTimes(writesAtClose);
    expect(Navigator.dismissModal).toHaveBeenCalledTimes(1);
});

it.each(['resolve', 'reject'])('ignores a late translation %s after Close', async (outcome) => {
    mount(); appear();
    const pending = deferred();
    jest.spyOn(BackendService, 'getTranslation').mockReturnValueOnce(pending.promise);
    jest.spyOn(Localize, 'setLocaleBundle').mockImplementation(() => undefined);
    jest.spyOn(Navigator, 'reRender').mockImplementation(() => undefined);
    const writes = jest.spyOn(modal, 'setState');
    act(() => modal.loadTranslation(publicUuid));
    expect(BackendService.getTranslation).toHaveBeenCalledWith(publicUuid);
    act(() => modal.onClose());
    const writesAtClose = writes.mock.calls.length;
    if (outcome === 'resolve') pending.resolve({ meta: { valid: true, language: 'NL' }, translation: {} });
    else pending.reject(new Error('translation unavailable'));
    await flush();
    expect(Localize.setLocaleBundle).not.toHaveBeenCalled();
    expect(Navigator.reRender).not.toHaveBeenCalled();
    expect(Navigator.dismissModal).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(writes).toHaveBeenCalledTimes(writesAtClose);
});

it('routes a normal payload through its owned dismissal even when that dismissal unmounts Scan', async () => {
    jest.useFakeTimers();
    const listenersBefore = AuthenticationService.listenerCount('lockStateChange');
    mount(); appear();
    const payload = { request_json: { TransactionType: 'Payment' } } as Payload;
    jest.spyOn(Payload, 'from').mockResolvedValueOnce(payload);
    jest.spyOn(Navigator, 'popToRoot').mockResolvedValue(undefined as any);
    jest.spyOn(Navigator, 'showModal').mockResolvedValue(undefined as any);
    jest.mocked(Navigator.dismissModal).mockImplementationOnce(async () => {
        tree!.unmount(); tree = undefined;
        return undefined as any;
    });
    await act(async () => { await modal.handlePayloadReference(publicUuid); });
    expect(Navigator.popToRoot).toHaveBeenCalledTimes(1);
    expect(Navigator.showModal).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(10));
    expect(Navigator.showModal).toHaveBeenCalledTimes(1);
    expect(Navigator.showModal).toHaveBeenCalledWith(
        AppScreens.Modal.ReviewTransaction, { payload }, { modalPresentationStyle: 'fullScreen' },
    );
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(AuthenticationService.listenerCount('lockStateChange')).toBe(listenersBefore);
});

it.each(['dismiss', 'pop', 'timer'])(
    'cancels a queued route when lock and unlock occur during %s', async (stage) => {
        jest.useFakeTimers();
        mount(); appear();
        const before = AuthenticationService.listenerCount('lockStateChange');
        const pending = deferred();
        if (stage === 'dismiss') jest.mocked(Navigator.dismissModal).mockReturnValueOnce(pending.promise);
        const pop = jest.spyOn(Navigator, 'popToRoot').mockResolvedValue(undefined as any);
        if (stage === 'pop') pop.mockReturnValueOnce(pending.promise);
        jest.spyOn(Navigator, 'showModal').mockResolvedValue(undefined as any);
        let routing: Promise<void>;
        act(() => { routing = modal.routeUser(AppScreens.Modal.ReviewTransaction, { publicFixture: true }); });
        if (stage !== 'dismiss') await flush();
        act(() => {
            locked = true; AuthenticationService.emit('lockStateChange', LockStatus.LOCKED);
            locked = false; AuthenticationService.emit('lockStateChange', LockStatus.UNLOCKED);
        });
        expect(AuthenticationService.listenerCount('lockStateChange')).toBe(before);
        await act(async () => { pending.resolve('dismissed'); await routing!; });
        act(() => jest.advanceTimersByTime(10));
        expect(Navigator.showModal).not.toHaveBeenCalled();
        if (stage === 'dismiss') expect(pop).not.toHaveBeenCalled();
        expect(AuthenticationService.listenerCount('lockStateChange')).toBe(before);
    },
);

it('releases the owned route listener after native dismissal fails', async () => {
    mount(); appear();
    const before = AuthenticationService.listenerCount('lockStateChange');
    jest.mocked(Navigator.dismissModal).mockRejectedValueOnce(new Error('native dismiss failed'));
    await expect(modal.routeUser(AppScreens.Modal.ReviewTransaction)).rejects.toThrow('native dismiss failed');
    expect(AuthenticationService.listenerCount('lockStateChange')).toBe(before);
});

it('applies a normal translation reply and retains the existing re-render and close flow', async () => {
    mount(); appear();
    const translation = { global: { done: 'Klaar' } };
    jest.spyOn(BackendService, 'getTranslation').mockResolvedValueOnce({
        meta: { valid: true, language: 'NL' }, translation,
    });
    jest.spyOn(Localize, 'setLocaleBundle').mockImplementation(() => undefined);
    jest.spyOn(Navigator, 'reRender').mockImplementation(() => undefined);
    act(() => modal.loadTranslation(publicUuid));
    await flush();
    expect(Localize.setLocaleBundle).toHaveBeenCalledWith('NL', translation);
    expect(Navigator.reRender).toHaveBeenCalledTimes(1);
    expect(Navigator.dismissModal).toHaveBeenCalledTimes(1);
    expect(modal.state.isLoading).toBe(false);
    expect(Alert.alert).not.toHaveBeenCalled();
});

it.each([false, true])('forwards the owned permission action and correct label (Settings=%s)', (settings) => {
    mount();
    const request = jest.fn();
    let permissionTree: ReactTestRenderer;
    act(() => {
        permissionTree = TestRenderer.create(scanner().props.renderNotAuthorized(request, settings, true));
    });
    const button = permissionTree!.root.findByProps({ testID: 'scan-permission-approve-button' });
    expect(button.props.label).toBe(Localize.t(settings ? 'global.settings' : 'global.approvePermissions'));
    expect(button.props.onPress).toBe(request);
    expect(button.props.isDisabled).toBe(true);
    expect(button.props.isLoading).toBe(true);
    act(() => permissionTree!.update(scanner().props.renderNotAuthorized(request, settings, false)));
    const ready = permissionTree!.root.findByProps({ testID: 'scan-permission-approve-button' });
    expect(ready.props.isDisabled).toBe(false);
    expect(ready.props.isLoading).toBe(false);
    act(() => ready.props.onPress());
    expect(request).toHaveBeenCalledTimes(1);
    act(() => permissionTree!.unmount());
});
