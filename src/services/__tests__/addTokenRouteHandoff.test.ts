import { InteractionManager, Platform } from 'react-native';
import { Navigation } from 'react-native-navigation';

import { AppScreens } from '@common/constants';
import { Payload } from '@common/libs/payload';
import AddTokenOverlay from '@screens/Overlay/AddToken/AddTokenOverlay';
import LinkingService from '../LinkingService';
import PushNotificationsService from '../PushNotificationsService';
import NavigationService, { ComponentTypes, RootType } from '../NavigationService';

jest.mock('@components/General', () => ({ ActionPanel: () => null }));
jest.mock('@common/libs/payload', () => ({ Payload: { build: jest.fn((json) => ({ json })) } }));
jest.mock('@common/libs/ledger/transactions', () => ({
    TrustSet: jest.fn((json) => ({ JsonForSigning: json })),
}));
jest.mock('@store/repositories', () => ({
    AccountRepository: { hasCurrency: () => false },
    CoreRepository: { getSettings: () => ({ account: { address: 'rOwner' } }), on: jest.fn(), off: jest.fn() },
}));
jest.mock('@services/BackendService', () => ({ __esModule: true, default: { getCuratedIOUs: jest.fn() } }));
jest.mock('@services/LedgerService', () => ({
    __esModule: true, default: { getGatewayBalances: async () => ({}) },
}));
jest.mock('@services/NetworkService', () => ({
    __esModule: true, default: {
        getNetwork: () => ({ id: 'network-model' }),
        getConnectionDetails: () => ({ networkId: 0, networkKey: 'MAINNET' }),
        getNetworkReserve: () => ({ OwnerReserve: 1 }), getNativeAsset: () => 'XRP',
        on: jest.fn(), off: jest.fn(),
    },
}));

const deferred = () => {
    let resolve: (value: string) => void = () => undefined;
    const promise = new Promise<string>((yes) => { resolve = yes; });
    return { promise, resolve };
};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const review = AppScreens.Modal.ReviewTransaction;
let overlay: string | undefined;
let modal: string | undefined;
let root: RootType;
let appeared: Set<(event: any) => void>;
let subscriptions: Set<() => void>;
let show: ReturnType<typeof deferred>;
let close: ReturnType<typeof deferred>;
let view: AddTokenOverlay;
const listen = (callback?: (event: any) => void) => {
    if (callback) appeared.add(callback);
    const remove = () => { if (callback) appeared.delete(callback); subscriptions.delete(remove); };
    subscriptions.add(remove);
    return { remove };
};
const beginAddToken = async () => {
    view = new AddTokenOverlay({ account: { address: 'rOwner' }, componentId: AppScreens.Overlay.AddToken } as any);
    jest.spyOn(view, 'setState').mockImplementation((update: any) => { Object.assign(view.state, update); });
    (view as any).actionPanelRef = { current: { slideDown: () => view.onPanelCloseRequest() } };
    view.componentDidMount();
    Object.assign(view.state, {
        dataSource: { issuer: { id: 1, currencies: { usd: { id: 2, issuer: 'rIssuer', currency: 'USD' } } } },
        selectedPartyId: 1, selectedCurrencyId: 2, isLoading: false,
    });
    await view.onAddPress();
    view.onPanelSlideDown();
    expect(Navigation.showModal).toHaveBeenCalledTimes(1);
    expect(Payload.build).toHaveBeenCalledTimes(1);
};
const finishCancelledAddToken = async () => {
    const layout = jest.mocked(Navigation.showModal).mock.calls[0][0] as any;
    const { passProps } = layout.stack.children[0].component;
    appeared.forEach((listener) => listener({ componentId: review, passProps }));
    show.resolve(review);
    await flush();
    close.resolve(review);
    await flush();
};

beforeEach(() => {
    jest.useFakeTimers(); jest.clearAllMocks();
    jest.replaceProperty(Platform, 'OS', 'ios');
    overlay = AppScreens.Overlay.AddToken; modal = undefined; root = RootType.DefaultRoot;
    appeared = new Set(); subscriptions = new Set(); show = deferred(); close = deferred();
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockReturnValue({ cancel: jest.fn() } as any);
    jest.spyOn(NavigationService, 'getCurrentOverlay').mockImplementation(() => overlay as any);
    jest.spyOn(NavigationService, 'getCurrentModal').mockImplementation(() => modal);
    jest.spyOn(NavigationService, 'getCurrentRoot').mockImplementation(() => root);
    jest.spyOn(Navigation, 'events').mockReturnValue({
        registerComponentDidAppearListener: (callback: any) => listen(callback),
        registerComponentWillAppearListener: () => listen(),
        registerModalDismissedListener: () => listen(),
        registerCommandListener: () => listen(),
        registerCommandCompletedListener: () => listen(),
    } as any);
    jest.spyOn(Navigation, 'showModal').mockReturnValueOnce(show.promise).mockResolvedValue(review);
    jest.spyOn(Navigation, 'dismissOverlay').mockImplementation(async () => {
        overlay = undefined;
        view.componentWillUnmount();
        return AppScreens.Overlay.AddToken;
    });
    jest.spyOn(Navigation, 'dismissModal').mockReturnValue(close.promise);
});
afterEach(async () => {
    view?.componentWillUnmount();
    await finishCancelledAddToken();
    jest.clearAllTimers();
    expect(subscriptions.size).toBe(0);
    expect(NavigationService.listenerCount('setRoot')).toBe(0);
    jest.useRealTimers(); jest.restoreAllMocks();
});

it.each([['link', LinkingService], ['push', PushNotificationsService]] as const)(
    '%s waits for canceled AddToken native cleanup, then opens the incoming payload once', async (_name, service) => {
        await beginAddToken();
        const payload = { kind: 'incoming-payment' };
        const routing = service.routeUser(
            review, { payload }, { modalPresentationStyle: 'fullScreen' }, ComponentTypes.Modal,
        );
        await flush(); jest.advanceTimersByTime(20); await flush();
        expect(Navigation.showModal).toHaveBeenCalledTimes(1);
        const original = jest.mocked(Navigation.showModal).mock.calls[0][0] as any;
        const { passProps } = original.stack.children[0].component;
        appeared.forEach((listener) => listener({ componentId: review, passProps }));
        show.resolve(review); await flush();
        expect(Navigation.dismissModal).toHaveBeenCalledTimes(1);
        expect(Navigation.showModal).toHaveBeenCalledTimes(1);
        close.resolve(review); await routing; jest.advanceTimersByTime(10); await flush();
        expect(Navigation.showModal).toHaveBeenCalledTimes(2);
        const incoming = jest.mocked(Navigation.showModal).mock.calls[1][0] as any;
        expect(incoming.stack.children[0].component.passProps.payload).toBe(payload);
        expect(incoming.stack.children[0].component.passProps.addTokenHandoffId).toBeUndefined();
    },
);

it.each([['link', LinkingService], ['push', PushNotificationsService]] as const)(
    '%s blocks a new lock or changed root while waiting or before dispatch', async (_name, service) => {
        await beginAddToken();
        const routing = service.routeUser(review, { payload: 'incoming' }, {}, ComponentTypes.Modal);
        await flush();
        root = RootType.OnboardingRoot;
        NavigationService.emit('setRoot', root);
        root = RootType.DefaultRoot;
        NavigationService.emit('setRoot', root);
        await finishCancelledAddToken(); await routing; jest.advanceTimersByTime(10); await flush();
        expect(Navigation.showModal).toHaveBeenCalledTimes(1);
    },
);

it.each([['link', LinkingService], ['push', PushNotificationsService]] as const)(
    '%s rechecks the lock after cleanup and before delayed dispatch', async (_name, service) => {
        await beginAddToken();
        const routing = service.routeUser(review, { payload: 'incoming' }, {}, ComponentTypes.Modal);
        await flush(); await finishCancelledAddToken(); await routing;
        overlay = AppScreens.Overlay.Lock;
        jest.advanceTimersByTime(10); await flush();
        expect(Navigation.showModal).toHaveBeenCalledTimes(1);
    },
);

it.each([['link', LinkingService], ['push', PushNotificationsService]] as const)(
    '%s refuses a Lock shown while native cleanup is pending', async (_name, service) => {
        await beginAddToken();
        const routing = service.routeUser(review, { payload: 'incoming' }, {}, ComponentTypes.Modal);
        await flush();
        overlay = AppScreens.Overlay.Lock;
        await finishCancelledAddToken(); await routing; jest.advanceTimersByTime(10); await flush();
        expect(Navigation.showModal).toHaveBeenCalledTimes(1);
    },
);

it.each([['link', LinkingService], ['push', PushNotificationsService]] as const)(
    '%s releases its root observer when overlay dismissal fails', async (_name, service) => {
        await beginAddToken();
        const error = new Error('Native overlay dismissal failed');
        jest.mocked(Navigation.dismissOverlay).mockRejectedValueOnce(error);
        await expect(service.routeUser(review, { payload: 'incoming' }, {}, ComponentTypes.Modal)).rejects.toBe(error);
        expect(NavigationService.listenerCount('setRoot')).toBe(0);
        expect(Navigation.showModal).toHaveBeenCalledTimes(1);
    },
);

it.each([['link', LinkingService], ['push', PushNotificationsService]] as const)(
    '%s retains the visible Review refusal after reservation cleanup', async (_name, service) => {
        await beginAddToken();
        const routing = service.routeUser(review, { payload: 'incoming' }, {}, ComponentTypes.Modal);
        await flush(); await finishCancelledAddToken(); await routing;
        modal = review;
        jest.advanceTimersByTime(10); await flush();
        expect(Navigation.showModal).toHaveBeenCalledTimes(1);
    },
);
