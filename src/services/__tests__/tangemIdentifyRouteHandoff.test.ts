import { Navigation } from 'react-native-navigation';
import { Alert } from 'react-native';

import { AppScreens } from '@common/constants';
import { Navigator } from '@common/helpers/navigator';
import { Payload } from '@common/libs/payload';
import { PaymentValidation } from '@common/libs/ledger/transactions';
import { registerTangemIdentifyExit, hasTangemIdentifyExit } from '@common/utils/tangemIdentifyNavigation';
import LinkingService from '../LinkingService';
import PushNotificationsService from '../PushNotificationsService';
import NavigationService, { ComponentTypes, RootType } from '../NavigationService';

jest.mock('@common/helpers/navigator', () => ({ Navigator: {
    showModal: jest.fn(async () => 'modal'), push: jest.fn(async () => 'screen'),
    dismissOverlay: jest.fn(async () => undefined), dismissModal: jest.fn(async () => undefined),
    waitForModalReservation: jest.fn(async () => undefined),
} }));
jest.mock('@common/libs/payload', () => ({
    Payload: { build: jest.fn((json) => ({ json, meta: {} })), from: jest.fn() },
    PayloadOrigin: { DEEP_LINK: 'DEEPLINK' }, XAppOrigin: { DEEP_LINK: 'DEEPLINK' },
}));
jest.mock('@common/libs/ledger/transactions', () => ({
    Payment: jest.fn((json) => ({ JsonForSigning: json })),
    PaymentValidation: jest.fn(async () => undefined),
}));
jest.mock('@common/utils/codec', () => ({ NormalizeDestination: () => ({ to: 'rReceiver' }) }));
jest.mock('@store/repositories', () => ({
    CoreRepository: {
        getDefaultAccount: () => ({ address: 'rOwner' }), isDeveloperModeEnabled: () => true,
    },
    NetworkRepository: { findOne: () => ({ networkId: 0, key: 'MAINNET' }) },
}));
jest.mock('@services/NetworkService', () => ({ __esModule: true, default: {
    getNetwork: () => ({ networkId: 0, key: 'MAINNET' }),
    getNetworkReserve: () => ({ OwnerReserve: 1 }), getNativeAsset: () => 'XRP',
} }));

const deferred = () => {
    let resolve: () => void = () => undefined;
    let reject: (error: Error) => void = () => undefined;
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const review = AppScreens.Modal.ReviewTransaction;
const services = [['link', LinkingService], ['push', PushNotificationsService]] as const;
let root: RootType;
let overlay: string | undefined;
let commands: Set<(name: string, params: any) => void>;
let owners: Array<{ cleanup: ReturnType<typeof deferred>; unregister: () => void }>;
const owner = () => {
    const cleanup = deferred();
    const requestExit = jest.fn(() => cleanup.promise);
    const unregister = registerTangemIdentifyExit(requestExit);
    owners.push({ cleanup, unregister });
    return { cleanup, requestExit, unregister };
};
const requestLock = () => {
    commands.forEach((listener) => listener('showOverlay', {
        layout: { id: AppScreens.Overlay.Lock, type: 'Component', data: { name: AppScreens.Overlay.Lock } },
    }));
};

beforeEach(() => {
    jest.useFakeTimers(); jest.clearAllMocks();
    root = RootType.DefaultRoot; overlay = undefined; commands = new Set(); owners = [];
    jest.spyOn(NavigationService, 'getCurrentRoot').mockImplementation(() => root);
    jest.spyOn(NavigationService, 'getCurrentOverlay').mockImplementation(() => overlay as any);
    jest.spyOn(NavigationService, 'getCurrentScreen').mockReturnValue(AppScreens.Account.Edit.IdentifyTangemCard);
    jest.spyOn(Navigation, 'events').mockReturnValue({
        registerCommandListener: (callback: any) => {
            commands.add(callback);
            return { remove: () => commands.delete(callback) };
        },
    } as any);
});
afterEach(async () => {
    owners.forEach(({ cleanup, unregister }) => { unregister(); cleanup.resolve(); });
    await flush(); jest.runOnlyPendingTimers(); await flush();
    expect(commands.size).toBe(0);
    expect(NavigationService.listenerCount('setRoot')).toBe(0);
    expect(hasTangemIdentifyExit()).toBe(false);
    jest.useRealTimers(); jest.restoreAllMocks();
});

it.each(services)('%s waits for the owned NFC cleanup before opening the incoming payload', async (_name, service) => {
    const pending = owner();
    const payload = { type: 'incoming' };
    const routing = service.routeUser(review, { payload }, {}, ComponentTypes.Modal);
    expect(pending.requestExit).toHaveBeenCalledTimes(1);
    await flush(); jest.advanceTimersByTime(1000);
    expect(Navigator.showModal).not.toHaveBeenCalled();
    pending.cleanup.resolve();
    await routing; jest.advanceTimersByTime(10); await flush();
    expect(Navigator.showModal).toHaveBeenCalledTimes(1);
    expect(Navigator.showModal).toHaveBeenCalledWith(review, { payload }, {});
});

it.each(services)('%s aborts after root changes away and back while NFC cleanup is pending', async (_name, service) => {
    const pending = owner();
    const routing = service.routeUser(review, {}, {}, ComponentTypes.Modal);
    root = RootType.OnboardingRoot; NavigationService.emit('setRoot', root);
    root = RootType.DefaultRoot; NavigationService.emit('setRoot', root);
    pending.cleanup.resolve(); await routing; jest.advanceTimersByTime(10); await flush();
    expect(Navigator.showModal).not.toHaveBeenCalled();
});

it.each(services)('%s aborts an actual same-root replacement before a new root appears', async (_name, service) => {
    const pending = owner();
    const routing = service.routeUser(review, {}, {}, ComponentTypes.Modal);
    commands.forEach((listener) => listener('setRoot', { layout: { id: RootType.DefaultRoot } }));
    pending.cleanup.resolve(); await routing; jest.advanceTimersByTime(10); await flush();
    expect(Navigator.showModal).not.toHaveBeenCalled();
});

it.each(services)('%s aborts a lock/unlock even before Lock appears or after it disappears', async (_name, service) => {
    const pending = owner();
    const routing = service.routeUser(review, {}, {}, ComponentTypes.Modal);
    requestLock();
    overlay = AppScreens.Overlay.Lock;
    overlay = undefined;
    pending.cleanup.resolve(); await routing; jest.advanceTimersByTime(10); await flush();
    expect(Navigator.showModal).not.toHaveBeenCalled();
});

it.each(services)('%s keeps the Lock guard until the delayed presentation actually runs', async (_name, service) => {
    const pending = owner();
    const routing = service.routeUser(review, {}, {}, ComponentTypes.Modal);
    pending.cleanup.resolve(); await routing;
    requestLock(); jest.advanceTimersByTime(10); await flush();
    expect(Navigator.showModal).not.toHaveBeenCalled();
});

it.each(services)('%s propagates exit failure and removes all temporary route observers', async (_name, service) => {
    const pending = owner();
    const routing = service.routeUser(review, {}, {}, ComponentTypes.Modal);
    const error = new Error('Identify pop failed');
    pending.cleanup.reject(error);
    await expect(routing).rejects.toBe(error);
    expect(commands.size).toBe(0);
    expect(NavigationService.listenerCount('setRoot')).toBe(0);
    // Detach this failed owner; its callback still returns the same handled rejection.
    pending.unregister();
    await flush();
});

it.each(services)('%s waits for cleanup after Identify unmounts', async (_name, service) => {
    const pending = owner(); pending.unregister();
    const routing = service.routeUser(review, {}, {}, ComponentTypes.Modal);
    await flush(); jest.advanceTimersByTime(1000);
    expect(Navigator.showModal).not.toHaveBeenCalled();
    pending.cleanup.resolve(); await routing; jest.advanceTimersByTime(10); await flush();
    expect(Navigator.showModal).toHaveBeenCalledTimes(1);
});

it.each(services)('%s preserves its ordinary route when no Identify owner exists', async (_name, service) => {
    await service.routeUser(review, {}, {}, ComponentTypes.Modal);
    jest.advanceTimersByTime(10); await flush(); await flush();
    expect(commands.size).toBe(0);
    expect(NavigationService.listenerCount('setRoot')).toBe(0);
    expect(Navigator.showModal).toHaveBeenCalledTimes(1);
});

it('coalesces cleanup without losing two independent incoming routes', async () => {
    const pending = owner();
    const modal = LinkingService.routeUser(review, { payload: 'one' }, {}, ComponentTypes.Modal);
    const screen = PushNotificationsService.routeUser(
        AppScreens.Account.Import, { seed: 'two' }, {}, ComponentTypes.Screen,
    );
    expect(pending.requestExit).toHaveBeenCalledTimes(1);
    pending.cleanup.resolve(); await Promise.all([modal, screen]); jest.advanceTimersByTime(10); await flush();
    expect(Navigator.showModal).toHaveBeenCalledWith(review, { payload: 'one' }, {});
    expect(Navigator.push).toHaveBeenCalledWith(AppScreens.Account.Import, { seed: 'two' }, {});
});

it('also gates direct payment deep links that bypassed routeUser', async () => {
    const pending = owner();
    const routing = LinkingService.handleXrplDestination({ address: 'rReceiver', amount: '1' } as any);
    await flush();
    expect(pending.requestExit).toHaveBeenCalledTimes(1);
    expect(Navigator.showModal).not.toHaveBeenCalled();
    pending.cleanup.resolve(); await routing;
    expect(Navigator.showModal).toHaveBeenCalledTimes(1);
});

it.each(['TrustSet', 'AccountSet', 'Invoke'])('gates %s templates after the existing delay', async (type) => {
    const pending = owner();
    const jsonhex = Buffer.from(JSON.stringify({ TransactionType: type }), 'utf8').toString('hex');
    LinkingService.handleTransactionTemplate({ jsonhex });
    await flush(); jest.advanceTimersByTime(1000);
    expect(Navigator.showModal).not.toHaveBeenCalled();
    expect(pending.requestExit).toHaveBeenCalledTimes(1);
    pending.cleanup.resolve(); await flush();
    expect(Navigator.showModal).toHaveBeenCalledTimes(1);
});

it.each(services)('%s rechecks a new Identify owner at actual delayed dispatch', async (_name, service) => {
    await service.routeUser(review, {}, {}, ComponentTypes.Modal, 800);
    const pending = owner();
    jest.advanceTimersByTime(800); await flush();
    expect(pending.requestExit).toHaveBeenCalledTimes(1);
    expect(Navigator.showModal).not.toHaveBeenCalled();
    pending.cleanup.resolve(); await flush();
    expect(Navigator.showModal).toHaveBeenCalledTimes(1);
});

it('rechecks a new Identify owner when the existing direct-template timer fires', async () => {
    const jsonhex = Buffer.from(JSON.stringify({ TransactionType: 'TrustSet' }), 'utf8').toString('hex');
    LinkingService.handleTransactionTemplate({ jsonhex });
    const pending = owner();
    jest.advanceTimersByTime(800); await flush();
    expect(pending.requestExit).toHaveBeenCalledTimes(1);
    expect(Navigator.showModal).not.toHaveBeenCalled();
    pending.cleanup.resolve(); await flush();
    expect(Navigator.showModal).toHaveBeenCalledTimes(1);
});

it.each(services)('%s remembers a root replacement before Identify opens during a delay', async (_name, service) => {
    await service.routeUser(review, {}, {}, ComponentTypes.Modal, 800);
    commands.forEach((listener) => listener('setRoot', {}));
    const pending = owner();
    jest.advanceTimersByTime(800); await flush();
    expect(pending.requestExit).not.toHaveBeenCalled();
    expect(Navigator.showModal).not.toHaveBeenCalled();
});

it.each(services)('%s cannot close a new Identify owner after the old route loses its root', async (_name, service) => {
    const old = owner();
    const routing = service.routeUser(review, {}, {}, ComponentTypes.Modal);
    commands.forEach((listener) => listener('setRoot', {}));
    const next = owner();
    old.cleanup.resolve(); await routing; jest.advanceTimersByTime(10); await flush();
    expect(next.requestExit).not.toHaveBeenCalled();
    expect(Navigator.showModal).not.toHaveBeenCalled();
});

it.each(services)('%s leaves the new Identify owner after Lock', async (_name, service) => {
    const old = owner();
    const routing = service.routeUser(review, {}, {}, ComponentTypes.Modal);
    requestLock();
    const next = owner();
    old.cleanup.resolve(); await routing; jest.advanceTimersByTime(10); await flush();
    expect(next.requestExit).not.toHaveBeenCalled();
    expect(Navigator.showModal).not.toHaveBeenCalled();
});

it('waits before dispatching a deep link that can show an immediate confirmation prompt', async () => {
    const handle = jest.spyOn(LinkingService, 'handle').mockImplementation(() => undefined);
    const pending = owner();
    const entry = LinkingService.handleDeepLink({ url: 'xumm://example' });
    expect(handle).not.toHaveBeenCalled();
    pending.cleanup.resolve(); await entry;
    expect(handle).toHaveBeenCalledWith('xumm://example', expect.objectContaining({ prepare: expect.any(Function) }));
});

it.each(['lock', 'root', 'success'])('keeps the actual template entry guard through its delay: %s', async (change) => {
    const jsonhex = Buffer.from(JSON.stringify({
        TransactionType: 'TrustSet', Account: 'rKymSQrwRF8DcwEzyAgNLMaaSKYSMfJNDY',
    }), 'utf8').toString('hex');
    const pending = owner();
    const entry = LinkingService.handleDeepLink({ url: `https://xaman.app/detect/${jsonhex}` });
    pending.cleanup.resolve(); await entry; await flush();
    expect(hasTangemIdentifyExit()).toBe(false);
    expect(Navigator.showModal).not.toHaveBeenCalled();
    if (change === 'lock') requestLock();
    if (change === 'root') {
        root = RootType.OnboardingRoot; NavigationService.emit('setRoot', root);
        root = RootType.DefaultRoot; NavigationService.emit('setRoot', root);
    }
    jest.advanceTimersByTime(799); await flush();
    expect(Navigator.showModal).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1); await flush();
    expect(Navigator.showModal).toHaveBeenCalledTimes(change === 'success' ? 1 : 0);
});

it.each(['lock', 'root', 'success', 'failure'])('keeps the payload entry guard during fetch: %s', async (change) => {
    const result = deferred();
    jest.mocked(Payload.from).mockReturnValueOnce(result.promise as any);
    const pending = owner();
    const entry = LinkingService.handleDeepLink({
        url: 'https://xaman.app/sign/12345678-1234-4234-8234-123456789012',
    });
    pending.cleanup.resolve(); await entry; await flush();
    expect(Payload.from).toHaveBeenCalledTimes(1);
    expect(hasTangemIdentifyExit()).toBe(false);
    if (change === 'lock') requestLock();
    if (change === 'root') {
        commands.forEach((listener) => listener('setRoot', {}));
        const next = owner();
        expect(next.requestExit).not.toHaveBeenCalled();
    }
    if (change === 'failure') {
        result.reject(new Error('Fetch failed'));
    } else result.resolve();
    await flush(); jest.advanceTimersByTime(10); await flush();
    expect(Navigator.showModal).toHaveBeenCalledTimes(change === 'success' ? 1 : 0);
});

it('keeps the entry guard during payment validation after Identify has closed', async () => {
    const validation = deferred();
    jest.mocked(PaymentValidation).mockReturnValueOnce(validation.promise as any);
    jest.spyOn(LinkingService, 'handle').mockImplementation((_url, identify) => {
        LinkingService.handleXrplDestination({ address: 'rReceiver', amount: '1' } as any, identify);
    });
    const pending = owner();
    const entry = LinkingService.handleDeepLink({ url: 'payment-link' });
    pending.cleanup.resolve(); await entry; await flush();
    expect(PaymentValidation).toHaveBeenCalledTimes(1);
    requestLock(); validation.resolve(); await flush();
    expect(Navigator.showModal).not.toHaveBeenCalled();
});

it.each(['lock', 'root'])('suppresses an invalidated payload fetch error after %s', async (change) => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const result = deferred();
    jest.mocked(Payload.from).mockReturnValueOnce(result.promise as any);
    const pending = owner();
    const entry = LinkingService.handleDeepLink({
        url: 'https://xaman.app/sign/12345678-1234-4234-8234-123456789012',
    });
    pending.cleanup.resolve(); await entry; await flush();
    if (change === 'lock') requestLock();
    else commands.forEach((listener) => listener('setRoot', {}));
    result.reject(new Error('Fetch failed')); await flush();
    expect(alert).not.toHaveBeenCalled();
});

it('shows a navigation failure after transferring a fetched payload to a new Identify owner', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const result = deferred();
    jest.mocked(Payload.from).mockReturnValueOnce(result.promise as any);
    const pending = owner();
    const entry = LinkingService.handleDeepLink({
        url: 'https://xaman.app/sign/12345678-1234-4234-8234-123456789012',
    });
    pending.cleanup.resolve(); await entry; await flush();
    const next = owner();
    result.resolve(); await flush();
    expect(next.requestExit).toHaveBeenCalledTimes(1);
    next.cleanup.reject(new Error('Identify pop failed')); await flush();
    expect(alert).toHaveBeenCalledWith(
        expect.any(String), 'Identify pop failed', [{ text: 'OK' }], { cancelable: false },
    );
    expect(Navigator.showModal).not.toHaveBeenCalled();
});

it.each(['lock', 'root', 'success'])('keeps the xApp entry guard during its close delay: %s', async (change) => {
    jest.spyOn(NavigationService, 'getCurrentModal').mockReturnValue(AppScreens.Modal.XAppBrowser);
    const pending = owner();
    const entry = LinkingService.handleDeepLink({ url: 'https://xaman.app/detect/xapp:xaman.swapper' });
    pending.cleanup.resolve(); await entry; await flush();
    expect(Navigator.dismissModal).toHaveBeenCalledTimes(1);
    if (change === 'lock') requestLock();
    if (change === 'root') commands.forEach((listener) => listener('setRoot', {}));
    jest.advanceTimersByTime(299); await flush();
    expect(Navigator.showModal).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1); await flush();
    jest.advanceTimersByTime(10); await flush();
    expect(Navigator.showModal).toHaveBeenCalledTimes(change === 'success' ? 1 : 0);
});

it('drops a delayed invalid-template prompt after the interrupted entry loses its context', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const jsonhex = Buffer.from(JSON.stringify({
        TransactionType: 'Payment', Account: 'rKymSQrwRF8DcwEzyAgNLMaaSKYSMfJNDY',
    }), 'utf8').toString('hex');
    const pending = owner();
    const entry = LinkingService.handleDeepLink({ url: `https://xaman.app/detect/${jsonhex}` });
    pending.cleanup.resolve(); await entry; await flush();
    requestLock(); jest.advanceTimersByTime(800); await flush();
    expect(alert).not.toHaveBeenCalled();
});

it('drops a waiting deep-link entry after a lock/unlock', async () => {
    const handle = jest.spyOn(LinkingService, 'handle').mockImplementation(() => undefined);
    const pending = owner();
    const entry = LinkingService.handleDeepLink({ url: 'xumm://example' });
    requestLock(); pending.cleanup.resolve(); await entry;
    expect(handle).not.toHaveBeenCalled();
});

it('cleans partially registered context observers if native listener registration throws', async () => {
    owner();
    jest.mocked(Navigation.events).mockImplementation(() => { throw new Error('Native listener unavailable'); });
    await expect(LinkingService.routeUser(review, {}, {}, ComponentTypes.Modal)).rejects.toThrow('Native listener');
    expect(NavigationService.listenerCount('setRoot')).toBe(0);
});
