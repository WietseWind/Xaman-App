import { BackHandler, InteractionManager, Platform } from 'react-native';
import { Navigation } from 'react-native-navigation';
import { AppScreens } from '@common/constants';
import { Navigator } from '@common/helpers/navigator';
import { Payload } from '@common/libs/payload';
import { TrustSet } from '@common/libs/ledger/transactions';
import { CoreRepository } from '@store/repositories';
import BackendService from '@services/BackendService';
import LedgerService from '@services/LedgerService';
import NetworkService from '@services/NetworkService';
import NavigationService from '@services/NavigationService';
import AddTokenOverlay from '../AddTokenOverlay';

jest.mock('@components/General', () => ({
    ActionPanel: () => null, Button: () => null, Footer: () => null, InfoMessage: () => null,
    LoadingIndicator: () => null, Spacer: () => null, TouchableDebounce: () => null,
}));
jest.mock('@common/helpers/navigator', () => ({ Navigator: {
    showModal: jest.fn(), dismissOverlay: jest.fn(), reserveModal: jest.fn(), pendingOverlayShows: jest.fn(),
} }));
jest.mock('@common/libs/payload', () => ({ Payload: { build: jest.fn() } }));
jest.mock('@common/libs/ledger/transactions', () => ({
    TrustSet: jest.fn((json) => ({ JsonForSigning: json })),
}));
jest.mock('@store/repositories', () => ({
    AccountRepository: { hasCurrency: jest.fn(() => false) },
    CoreRepository: { getSettings: jest.fn(), on: jest.fn(), off: jest.fn() },
}));
jest.mock('@services/BackendService', () => ({ __esModule: true, default: { getCuratedIOUs: jest.fn() } }));
jest.mock('@services/LedgerService', () => ({ __esModule: true, default: { getGatewayBalances: jest.fn() } }));
jest.mock('@services/NetworkService', () => ({
    __esModule: true, default: {
        getConnectionDetails: jest.fn(), getNetworkReserve: () => ({ OwnerReserve: 1 }),
        getNativeAsset: () => 'XRP', on: jest.fn(), off: jest.fn(),
    },
}));
jest.mock('@services/NavigationService', () => ({
    __esModule: true, default: { getCurrentOverlay: jest.fn() },
}));

const ownId = 'own-add-token-overlay';
const reviewId = AppScreens.Modal.ReviewTransaction;
const account = { address: 'rAccount' };
const currency = { id: 2, issuer: 'rIssuer', currency: 'USD' };
const details = { issuer: { id: 1, currencies: { usd: currency } } };
const connection = { networkKey: 'MAINNET', node: 'wss://node' };
const deferred = () => {
    let resolve: (value: any) => void = () => undefined;
    let reject: (reason: Error) => void = () => undefined;
    const promise = new Promise<any>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

let components: Set<any>;
let willAppearListeners: Set<any>;
let backHandlers: Set<any>;
let modalDismissed: Set<any>;
let commands: Set<any>;
let completed: Set<any>;
let mountTasks: { callback: () => void; cancel: jest.Mock }[];
let show: ReturnType<typeof deferred>;
let removeListeners: jest.Mock[];
let platform: PropertyDescriptor | undefined;
let releaseReservation: jest.Mock;
const listen = (set: Set<any>, callback: any) => {
    set.add(callback);
    const remove = jest.fn(() => set.delete(callback));
    removeListeners.push(remove);
    return { remove };
};
const command = (name: string, params: any = {}) => [...commands].forEach((callback) => {
    callback(name, { commandId: `${name}-command`, ...params });
});
const showCommand = (props: any) => command('showModal', {
    layout: { children: [{ data: { name: reviewId, passProps: props } }] },
});
const appear = (props = jest.mocked(Navigator.showModal).mock.calls[0]?.[1]) => {
    [...components].forEach((listener) => listener({
        componentId: reviewId, componentName: reviewId, passProps: props,
    }));
};
const willAppear = (props = jest.mocked(Navigator.showModal).mock.calls[0]?.[1]) => {
    [...willAppearListeners].forEach((listener) => listener({ componentId: reviewId, passProps: props }));
};
const navigationListenerCount = () => components.size + willAppearListeners.size + modalDismissed.size +
    commands.size + completed.size;
const pressBack = () => [...backHandlers].reverse().some((handler) => handler());
const settingsChange = () => {
    jest.mocked(CoreRepository.on).mock.calls.find(([event]) => event === 'updateSettings')![1]();
};
const networkChange = () => {
    jest.mocked(NetworkService.on).mock.calls.find(([event]) => event === 'networkChange')![1]({} as any);
};
const setup = () => {
    const view = new AddTokenOverlay({ account, componentId: ownId } as any);
    jest.spyOn(view, 'setState').mockImplementation((update: any) => { Object.assign(view.state, update); });
    const slideDown = jest.fn(() => view.onPanelCloseRequest());
    (view as any).actionPanelRef = { current: { slideDown } };
    view.componentDidMount();
    Object.assign(view.state, {
        dataSource: details, selectedPartyId: 1, selectedCurrencyId: 2, isLoading: false,
    });
    return { view, slideDown };
};
const startPresentation = async () => {
    const result = setup();
    await result.view.onAddPress();
    result.view.onPanelSlideDown();
    return result;
};

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    components = new Set(); modalDismissed = new Set(); commands = new Set(); completed = new Set();
    willAppearListeners = new Set(); backHandlers = new Set();
    mountTasks = []; removeListeners = []; show = deferred();
    releaseReservation = jest.fn();
    platform = Object.getOwnPropertyDescriptor(Platform, 'OS');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    jest.spyOn(Navigation, 'events').mockReturnValue({
        registerComponentDidAppearListener: (listener: any) => listen(components, listener),
        registerComponentWillAppearListener: (listener: any) => listen(willAppearListeners, listener),
        registerModalDismissedListener: (listener: any) => listen(modalDismissed, listener),
        registerCommandListener: (listener: any) => listen(commands, listener),
        registerCommandCompletedListener: (listener: any) => listen(completed, listener),
    } as any);
    jest.spyOn(Navigation, 'dismissModal').mockImplementation(async (id) => {
        command('dismissModal', { componentId: id });
        return id;
    });
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
        backHandlers.add(handler);
        return { remove: jest.fn(() => backHandlers.delete(handler)) };
    });
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback: any) => {
        const task = { callback, cancel: jest.fn() }; mountTasks.push(task); return task as any;
    });
    jest.mocked(CoreRepository.getSettings).mockReturnValue({ account } as any);
    jest.mocked(NetworkService.getConnectionDetails).mockReturnValue(connection as any);
    jest.mocked(NavigationService.getCurrentOverlay).mockReturnValue(AppScreens.Overlay.AddToken);
    jest.mocked(LedgerService.getGatewayBalances).mockResolvedValue({ obligations: { USD: '2000000000' } } as any);
    jest.mocked(BackendService.getCuratedIOUs).mockResolvedValue({ details } as any);
    jest.mocked(Payload.build).mockImplementation((json) => ({ json } as any));
    jest.spyOn(Navigation, 'dismissOverlay').mockResolvedValue(ownId);
    jest.mocked(Navigator.pendingOverlayShows).mockReturnValue([]);
    jest.mocked(Navigator.reserveModal).mockReturnValue({ token: Symbol('reservation'), release: releaseReservation });
    jest.mocked(Navigator.showModal).mockImplementation((_id, props) => { showCommand(props); return show.promise; });
});
afterEach(() => {
    jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks();
    if (platform) Object.defineProperty(Platform, 'OS', platform);
});

it('opens Review at real close completion, with the same TrustSet and no navigation timer', async () => {
    const { view, slideDown } = setup();
    await view.onAddPress();
    expect(slideDown).toHaveBeenCalledTimes(1);
    expect(Navigator.showModal).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    expect(TrustSet).toHaveBeenCalledWith({
        TransactionType: 'TrustSet', Account: account.address, Flags: 131072,
        LimitAmount: { issuer: currency.issuer, currency: 'USD', value: '2000000000' },
    });
    view.onPanelSlideDown();
    expect(Navigator.showModal).toHaveBeenCalledTimes(1);
    expect(Navigator.showModal).toHaveBeenCalledWith(reviewId, expect.objectContaining({
        payload: expect.anything(), addTokenHandoffId: expect.any(String),
    }), { modalPresentationStyle: 'fullScreen', animations: { showModal: { enter: { waitForRender: true } } } },
    expect.any(Symbol));
    expect(Navigation.dismissOverlay).not.toHaveBeenCalled();
    appear();
    expect(Navigation.dismissOverlay).toHaveBeenCalledWith(ownId);
    expect(navigationListenerCount()).toBe(0);
    expect(releaseReservation).toHaveBeenCalledTimes(1);
    view.componentWillUnmount();
});

it('retains the input cover through a slow native entry and ignores another Review marker', async () => {
    const { view } = await startPresentation();
    appear({ addTokenHandoffId: 'another-operation' } as any);
    jest.advanceTimersByTime(30_000);
    expect(Navigation.dismissOverlay).not.toHaveBeenCalled();
    expect(Navigation.dismissModal).not.toHaveBeenCalled();
    appear();
    expect(Navigation.dismissOverlay).toHaveBeenCalledTimes(1);
    show.resolve(reviewId); await flush();
    expect(Navigation.dismissModal).not.toHaveBeenCalled();
    view.componentWillUnmount();
});

it('keeps waiting if iOS show completion arrives before its appearance event', async () => {
    const { view } = await startPresentation();
    show.resolve(reviewId); await flush();
    expect(Navigation.dismissOverlay).not.toHaveBeenCalled();
    expect(Navigation.dismissModal).not.toHaveBeenCalled();
    appear();
    expect(Navigation.dismissOverlay).toHaveBeenCalledTimes(1);
    view.componentWillUnmount();
});

it('allows only one gateway request, payload and modal despite repeated Add/close events', async () => {
    const gateway = deferred();
    jest.mocked(LedgerService.getGatewayBalances).mockReturnValue(gateway.promise);
    const { view } = setup();
    const first = view.onAddPress();
    await view.onAddPress();
    gateway.resolve({}); await first;
    await view.onAddPress();
    view.onPanelSlideDown(); view.onPanelSlideDown();
    expect(LedgerService.getGatewayBalances).toHaveBeenCalledTimes(1);
    expect(Payload.build).toHaveBeenCalledTimes(1);
    expect(Navigator.showModal).toHaveBeenCalledTimes(1);
    appear(); view.componentWillUnmount();
});

it.each(['cancel', 'backdrop', 'unmount'])('ignores the gateway reply after %s', async (close) => {
    const gateway = deferred();
    jest.mocked(LedgerService.getGatewayBalances).mockReturnValue(gateway.promise);
    const { view } = setup();
    const adding = view.onAddPress();
    if (close === 'cancel') view.onCancelPress();
    else if (close === 'backdrop') view.onPanelCloseRequest();
    else view.componentWillUnmount();
    if (close !== 'unmount') view.onPanelSlideDown();
    const stateWrites = jest.mocked(view.setState).mock.calls.length;
    gateway.resolve({}); await adding;
    expect(view.setState).toHaveBeenCalledTimes(stateWrites);
    expect(Payload.build).not.toHaveBeenCalled();
    expect(Navigator.showModal).not.toHaveBeenCalled();
    if (close !== 'unmount') {
        expect(Navigation.dismissOverlay).toHaveBeenCalledWith(ownId);
        view.componentWillUnmount();
    }
});

it.each(['account', 'network', 'missing-account', 'invalid-account'])('cancels lookup on %s change', async (change) => {
    const gateway = deferred();
    jest.mocked(LedgerService.getGatewayBalances).mockReturnValue(gateway.promise);
    const { view, slideDown } = setup();
    const adding = view.onAddPress();
    if (change === 'network') {
        jest.mocked(NetworkService.getConnectionDetails).mockReturnValue({
            ...connection, networkKey: 'TESTNET',
        } as any);
        networkChange();
    } else {
        if (change === 'invalid-account') {
            jest.mocked(CoreRepository.getSettings).mockImplementation(() => {
                throw new Error('invalid Realm object');
            });
        } else {
            jest.mocked(CoreRepository.getSettings).mockReturnValue({
                account: change === 'missing-account' ? undefined : { address: 'rAnotherAccount' },
            } as any);
        }
        expect(settingsChange).not.toThrow();
    }
    gateway.resolve({}); await adding;
    expect(slideDown).toHaveBeenCalledTimes(1);
    view.onPanelSlideDown();
    expect(Navigator.showModal).not.toHaveBeenCalled();
    expect(Navigation.dismissOverlay).toHaveBeenCalledWith(ownId);
    view.componentWillUnmount();
});

it('rechecks context after gateway completion even without a settings event', async () => {
    const gateway = deferred();
    jest.mocked(LedgerService.getGatewayBalances).mockReturnValue(gateway.promise);
    const { view } = setup(); const adding = view.onAddPress();
    jest.mocked(NetworkService.getConnectionDetails).mockReturnValue({ ...connection, node: 'wss://other-node' } as any);
    gateway.resolve({}); await adding;
    view.onPanelSlideDown();
    expect(Navigator.showModal).not.toHaveBeenCalled();
    expect(Navigation.dismissOverlay).toHaveBeenCalledTimes(1);
    view.componentWillUnmount();
});

it.each(['account', 'network', 'cancel', 'unmount'])('defers native dismissal after %s', async (change) => {
    const { view } = await startPresentation();
    if (change === 'account') {
        jest.mocked(CoreRepository.getSettings).mockReturnValue({ account: { address: 'rOther' } } as any);
        settingsChange();
    } else if (change === 'network') networkChange();
    else if (change === 'cancel') view.onCancelPress();
    else view.componentWillUnmount();
    expect(Navigation.dismissModal).not.toHaveBeenCalled();
    expect(Navigation.dismissOverlay).not.toHaveBeenCalled();
    appear(); await flush();
    expect(Navigation.dismissModal).toHaveBeenCalledTimes(1);
    expect(Navigation.dismissModal).toHaveBeenCalledWith(reviewId);
    expect(navigationListenerCount()).toBe(0);
    if (change !== 'unmount') {
        expect(Navigation.dismissOverlay).toHaveBeenCalledWith(ownId);
        view.componentWillUnmount();
    }
});

it('does not lose its cancellation watcher when native dismiss reports before appearance', async () => {
    const { view } = await startPresentation();
    command('dismissModal', { componentId: reviewId });
    [...modalDismissed].forEach((listener) => listener({ componentId: reviewId }));
    expect(components.size).toBe(1);
    expect(Navigation.dismissOverlay).not.toHaveBeenCalled();
    appear(); await flush();
    expect(Navigation.dismissModal).toHaveBeenCalledTimes(1);
    expect(Navigation.dismissOverlay).toHaveBeenCalledTimes(1);
    view.componentWillUnmount();
});

it.each(['false', 'reject', 'throw'])('cleans %s show without closing another Review', async (failure) => {
    if (failure === 'false') jest.mocked(Navigator.showModal).mockResolvedValue(false);
    if (failure === 'reject') jest.mocked(Navigator.showModal).mockRejectedValue(new Error('native rejection'));
    if (failure === 'throw') {jest.mocked(Navigator.showModal).mockImplementation(() => {
        throw new Error('invalid layout');
    });}
    const { view } = await startPresentation(); await flush();
    appear({ addTokenHandoffId: 'existing-review' } as any);
    expect(Navigation.dismissModal).not.toHaveBeenCalled();
    expect(Navigation.dismissOverlay).toHaveBeenCalledTimes(1);
    expect(navigationListenerCount()).toBe(0);
    view.componentWillUnmount();
});

it('cleans a canceled Android enter that completes without appearance', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const { view } = await startPresentation();
    show.resolve(reviewId); await flush();
    expect(Navigation.dismissModal).toHaveBeenCalledWith(reviewId);
    expect(Navigation.dismissOverlay).toHaveBeenCalledWith(ownId);
    expect(navigationListenerCount()).toBe(0);
    view.componentWillUnmount();
});

it('yields to a competing Review command without dismissing its reused static ID', async () => {
    const { view } = await startPresentation();
    showCommand({ addTokenHandoffId: 'push-review' });
    show.resolve(reviewId); await flush();
    appear({ addTokenHandoffId: 'push-review' } as any);
    expect(Navigation.dismissModal).not.toHaveBeenCalled();
    expect(Navigation.dismissOverlay).toHaveBeenCalledTimes(1);
    expect(navigationListenerCount()).toBe(0);
    view.componentWillUnmount();
});

it('removes its overlay only after a newer overlay has closed', async () => {
    const { view } = await startPresentation();
    jest.mocked(NavigationService.getCurrentOverlay).mockReturnValue(AppScreens.Overlay.Alert);
    appear();
    expect(Navigation.dismissOverlay).not.toHaveBeenCalled();
    expect(completed.size).toBe(1);
    jest.mocked(NavigationService.getCurrentOverlay).mockReturnValue(AppScreens.Overlay.AddToken);
    [...completed].forEach((listener) => listener({ commandName: 'dismissOverlay' }));
    expect(Navigation.dismissOverlay).toHaveBeenCalledWith(ownId);
    expect(completed.size).toBe(0);
    view.componentWillUnmount();
});

it('waits for pending newer overlay shows, including rejected shows and further pending shows', async () => {
    const { view } = await startPresentation();
    const first = deferred(); const failed = deferred(); const later = deferred();
    jest.mocked(Navigator.pendingOverlayShows).mockReturnValue([first.promise, failed.promise]);
    appear();
    expect(Navigation.dismissOverlay).not.toHaveBeenCalled();
    first.resolve('overlay'); failed.reject(new Error('overlay rejected'));
    jest.mocked(Navigator.pendingOverlayShows).mockReturnValue([later.promise]);
    await flush();
    expect(Navigation.dismissOverlay).not.toHaveBeenCalled();
    jest.mocked(Navigator.pendingOverlayShows).mockReturnValue([]);
    later.resolve('later-overlay'); await flush();
    expect(Navigation.dismissOverlay).toHaveBeenCalledWith(ownId);
    view.componentWillUnmount();
});

it('keeps a native responder input cover while preparing the handoff', async () => {
    const { view } = setup(); await view.onAddPress();
    const cover = view.render().props.children[1];
    expect(cover.props.testID).toBe('add-token-handoff-cover');
    expect(cover.props.collapsable).toBe(false);
    expect(cover.props.onStartShouldSetResponder()).toBe(true);
    expect(cover.props.onResponderTerminationRequest()).toBe(false);
    view.onCancelPress(); view.onPanelSlideDown(); view.componentWillUnmount();
});

it('owns Back after Review mounts until the retained cover can close safely', async () => {
    const { view } = await startPresentation();
    const reviewBack = jest.fn(() => true);
    BackHandler.addEventListener('hardwareBackPress', reviewBack);
    willAppear(); willAppear();
    expect(backHandlers.size).toBe(2);
    expect(pressBack()).toBe(true);
    expect(reviewBack).not.toHaveBeenCalled();
    expect(Navigation.dismissModal).not.toHaveBeenCalled();
    appear(); await flush();
    expect(Navigation.dismissModal).toHaveBeenCalledTimes(1);
    expect(backHandlers.size).toBe(1);
    view.componentWillUnmount();
});

it('restores normal Review Back behavior immediately after transfer', async () => {
    const { view } = await startPresentation();
    const reviewBack = jest.fn(() => true);
    BackHandler.addEventListener('hardwareBackPress', reviewBack);
    willAppear(); appear();
    expect(backHandlers.size).toBe(1);
    pressBack();
    expect(reviewBack).toHaveBeenCalledTimes(1);
    expect(Navigation.dismissModal).not.toHaveBeenCalled();
    view.componentWillUnmount();
});

it('removes temporary Back ownership on unmount while retaining only cancellation observers', async () => {
    const { view } = await startPresentation();
    willAppear(); expect(backHandlers.size).toBe(1);
    view.componentWillUnmount();
    expect(backHandlers.size).toBe(0);
    appear(); await flush();
    expect(navigationListenerCount()).toBe(0);
});

it('recognizes a confirmed canceled entry after unmount clears its stored props', async () => {
    const { view } = await startPresentation();
    willAppear();
    view.componentWillUnmount();
    appear({} as any); await flush();
    expect(Navigation.dismissModal).toHaveBeenCalledWith(reviewId);
    expect(releaseReservation).toHaveBeenCalledTimes(1);
    expect(navigationListenerCount()).toBe(0);
});

it('ignores completion of a root command that started before this handoff', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const { view } = await startPresentation();
    [...completed].forEach((listener) => listener({ commandName: 'setRoot', commandId: 'earlier-root' }));
    expect(Navigation.dismissOverlay).not.toHaveBeenCalled();
    expect(releaseReservation).not.toHaveBeenCalled();
    command('setRoot', { commandId: 'new-root' });
    [...completed].forEach((listener) => listener({ commandName: 'setRoot', commandId: 'earlier-root' }));
    expect(releaseReservation).not.toHaveBeenCalled();
    [...completed].forEach((listener) => listener({ commandName: 'setRoot', commandId: 'new-root' }));
    expect(releaseReservation).toHaveBeenCalledTimes(1);
    view.componentWillUnmount();
});

it('releases an Android pending presentation when a new root completes', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const { view } = await startPresentation();
    command('setRoot');
    [...completed].forEach((listener) => listener({ commandName: 'setRoot', commandId: 'setRoot-command' }));
    expect(releaseReservation).toHaveBeenCalledTimes(1);
    expect(navigationListenerCount()).toBe(0);
    expect(Navigation.dismissModal).not.toHaveBeenCalled();
    show.resolve(reviewId); await flush();
    appear({ addTokenHandoffId: 'new-root-review' } as any);
    expect(Navigation.dismissModal).not.toHaveBeenCalled();
    view.componentWillUnmount();
});

it('keeps watching for an iOS render that presents late after root completion', async () => {
    const { view } = await startPresentation();
    command('setRoot');
    [...completed].forEach((listener) => listener({ commandName: 'setRoot', commandId: 'setRoot-command' }));
    expect(Navigation.dismissOverlay).toHaveBeenCalledWith(ownId);
    expect(releaseReservation).not.toHaveBeenCalled();
    expect(components.size).toBe(1);
    view.componentWillUnmount();
    appear(); await flush();
    expect(Navigation.dismissModal).toHaveBeenCalledWith(reviewId);
    expect(releaseReservation).toHaveBeenCalledTimes(1);
    expect(navigationListenerCount()).toBe(0);
});

it('cleans partial listener setup if a later registration throws', async () => {
    const events = Navigation.events();
    events.registerCommandListener = () => { throw new Error('listener setup failed'); };
    const { view } = await startPresentation();
    expect(Navigator.showModal).not.toHaveBeenCalled();
    expect(Navigation.dismissOverlay).toHaveBeenCalledWith(ownId);
    expect(releaseReservation).toHaveBeenCalledTimes(1);
    expect(navigationListenerCount()).toBe(0);
    view.componentWillUnmount();
});

it('releases the cover after dismiss-all but keeps a watcher for late native entry', async () => {
    const { view } = await startPresentation();
    command('dismissAllModals');
    [...completed].forEach((listener) => listener({
        commandName: 'dismissAllModals', commandId: 'dismissAllModals-command',
    }));
    expect(Navigation.dismissOverlay).toHaveBeenCalledWith(ownId);
    expect(components.size).toBe(1);
    view.componentWillUnmount();
    appear(); await flush();
    expect(Navigation.dismissModal).toHaveBeenCalledWith(reviewId);
    expect(releaseReservation).toHaveBeenCalledTimes(1);
    expect(navigationListenerCount()).toBe(0);
});

it('invalidates a gateway request through an A-B-A network change', async () => {
    const gateway = deferred();
    jest.mocked(LedgerService.getGatewayBalances).mockReturnValue(gateway.promise);
    const { view } = setup(); const adding = view.onAddPress();
    networkChange(); networkChange();
    gateway.resolve({}); await adding;
    view.onPanelSlideDown();
    expect(Payload.build).not.toHaveBeenCalled();
    expect(Navigator.showModal).not.toHaveBeenCalled();
    view.componentWillUnmount();
});

it('does not enter Review when another caller already owns its reservation', async () => {
    jest.mocked(Navigator.reserveModal).mockReturnValue(undefined);
    const { view } = await startPresentation();
    expect(Navigator.showModal).not.toHaveBeenCalled();
    expect(Navigation.dismissModal).not.toHaveBeenCalled();
    expect(Navigation.dismissOverlay).toHaveBeenCalledWith(ownId);
    view.componentWillUnmount();
});

it('preserves the default line limit when gateway lookup fails', async () => {
    jest.mocked(LedgerService.getGatewayBalances).mockRejectedValue(new Error('offline'));
    const { view } = setup(); await view.onAddPress();
    expect(TrustSet).toHaveBeenCalledWith(expect.objectContaining({
        LimitAmount: expect.objectContaining({ value: '1000000000' }),
    }));
    view.onCancelPress(); view.onPanelSlideDown(); view.componentWillUnmount();
});

it('cancels deferred initialization and ignores late curated-token replies on unmount', async () => {
    const curated = deferred();
    jest.mocked(BackendService.getCuratedIOUs).mockReturnValue(curated.promise);
    const { view } = setup();
    mountTasks[0].callback();
    view.componentWillUnmount();
    const writes = jest.mocked(view.setState).mock.calls.length;
    curated.resolve({ details }); await flush();
    expect(view.setState).toHaveBeenCalledTimes(writes);
    expect(CoreRepository.off).toHaveBeenCalledWith('updateSettings', expect.any(Function));
    expect(NetworkService.off).toHaveBeenCalledWith('networkChange', expect.any(Function));
    expect(navigationListenerCount()).toBe(0);
    const other = setup(); other.view.componentWillUnmount();
    expect(mountTasks[1].cancel).toHaveBeenCalledTimes(1);
    mountTasks[1].callback();
    expect(BackendService.getCuratedIOUs).toHaveBeenCalledTimes(1);
});
