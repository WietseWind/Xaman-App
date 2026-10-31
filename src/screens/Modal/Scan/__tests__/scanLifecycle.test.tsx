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
