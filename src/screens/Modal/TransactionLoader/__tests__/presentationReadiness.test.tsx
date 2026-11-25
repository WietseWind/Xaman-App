import { InteractionManager } from 'react-native';
import { Navigation } from 'react-native-navigation';
import NetworkService from '@services/NetworkService';
import LedgerService from '@services/LedgerService';
import { CoreRepository } from '@store/repositories';
import { TransactionFactory } from '@common/libs/ledger/factory';
import TransactionLoaderModal from '../TransactionLoaderModal';

jest.mock('@services/NetworkService', () => ({
    __esModule: true,
    default: {
        on: jest.fn(), off: jest.fn(), switchNetwork: jest.fn(),
        getConnectionDetails: jest.fn(), getNetwork: jest.fn(), getNativeAsset: () => 'XRP',
    },
}));
jest.mock('@services/LedgerService', () => ({ __esModule: true, default: { getTransaction: jest.fn() } }));
jest.mock('@common/libs/ledger/factory', () => ({ TransactionFactory: { fromLedger: jest.fn() } }));
jest.mock('@screens/Events/Details', () => ({ __esModule: true, default: () => null }));
jest.mock('@components/General', () => ({
    Button: () => null, Footer: () => null, Icon: () => null, InfoMessage: () => null,
    LoadingIndicator: () => null, Spacer: () => null,
}));

const ownId = 'loader-instance-7';
const account = { address: 'rQQQrUdN1cLdNmxH4dHfKgmX5P4kf3ZrM' };
const network = { key: 'MAINNET', name: 'Mainnet' };
const response = (hash = 'transaction') => ({
    hash, TransactionType: 'Payment', Account: account.address,
    meta: { TransactionResult: 'tesSUCCESS', AffectedNodes: [] }, validated: true, ledger_index: 1,
});
const deferred = () => {
    let resolve: (value: any) => void = () => undefined;
    let reject: (reason: Error) => void = () => undefined;
    const promise = new Promise<any>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};
const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

let removeListener: jest.Mock;
let tasks: { callback: () => void; cancelled: boolean }[];
const runInteractions = () => {
    const pending = tasks;
    tasks = [];
    pending.filter((task) => !task.cancelled).forEach((task) => task.callback());
};
const setup = (selectedNetwork = network) => {
    const view = new TransactionLoaderModal({
        componentId: ownId, hash: 'hash', account, network: selectedNetwork,
    } as any);
    jest.spyOn(view, 'setState').mockImplementation((update: any) => {
        Object.assign(view.state, typeof update === 'function' ? update(view.state, view.props) : update);
    });
    view.componentDidMount();
    return view;
};
const appear = async (view: TransactionLoaderModal) => {
    view.componentDidAppear();
    runInteractions();
    await flush();
};
const changeNetwork = (key: string) => {
    jest.mocked(NetworkService.getConnectionDetails).mockReturnValue({ networkKey: key } as any);
    const listener = jest.mocked(NetworkService.on).mock.calls.find(([event]) => event === 'networkChange')![1];
    listener({ key } as any);
};

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    tasks = [];
    removeListener = jest.fn();
    jest.spyOn(Navigation, 'events').mockReturnValue({
        bindComponent: jest.fn(() => ({ remove: removeListener })),
    } as any);
    jest.spyOn(Navigation, 'dismissModal').mockResolvedValue(ownId);
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback: any) => {
        const task = { callback, cancelled: false };
        tasks.push(task);
        return { cancel: () => { task.cancelled = true; } } as any;
    });
    jest.mocked(NetworkService.getConnectionDetails).mockReturnValue({ networkKey: 'MAINNET' } as any);
    jest.mocked(NetworkService.switchNetwork).mockResolvedValue(undefined);
    jest.mocked(LedgerService.getTransaction).mockResolvedValue(response() as any);
    jest.mocked(TransactionFactory.fromLedger).mockImplementation((item) => item as any);
    jest.spyOn(CoreRepository, 'getSettings').mockReturnValue({ account: { address: 'other-account' } } as any);
    jest.spyOn(CoreRepository, 'saveSettings').mockResolvedValue(undefined as any);
});
afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
});

it('waits for the React view to render before native modal presentation', () => {
    expect(TransactionLoaderModal.options().animations.showModal.enter.waitForRender).toBe(true);
});

it('starts the read during presentation and holds parsing, account and UI writes until native appearance', async () => {
    const view = setup();
    runInteractions();
    await flush();
    expect(LedgerService.getTransaction).toHaveBeenCalledTimes(1);
    expect(TransactionFactory.fromLedger).not.toHaveBeenCalled();
    expect(CoreRepository.saveSettings).not.toHaveBeenCalled();
    expect(view.setState).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(2_000);
    await flush();
    expect(view.state.transactionInstance).toBeUndefined();
    view.componentDidAppear();
    await flush();
    expect(view.state.transactionInstance).toBeDefined();
    expect(LedgerService.getTransaction).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    view.componentWillUnmount();
});

it('applies a later RPC reply immediately when presentation has already finished', async () => {
    const reply = deferred();
    jest.mocked(LedgerService.getTransaction).mockReturnValueOnce(reply.promise);
    const view = setup();
    runInteractions();
    expect(LedgerService.getTransaction).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1_500);
    view.componentDidAppear();
    await flush();
    expect(view.state.transactionInstance).toBeUndefined();
    reply.resolve(response());
    await flush();
    expect(view.state.transactionInstance).toBeDefined();
    expect(jest.getTimerCount()).toBe(0);
    view.componentWillUnmount();
});

it.each(['rpc-error', 'rejection', 'throw'])('holds an early failure until native appearance (%s)', async (failure) => {
    if (failure === 'rpc-error') {
        jest.mocked(LedgerService.getTransaction).mockResolvedValueOnce({ error: 'txnNotFound' } as any);
    } else if (failure === 'rejection') {
        jest.mocked(LedgerService.getTransaction).mockRejectedValueOnce(new Error('Offline'));
    } else {
        jest.mocked(LedgerService.getTransaction).mockImplementationOnce(() => { throw new Error('Offline'); });
    }
    const view = setup();
    runInteractions();
    await flush();
    expect(view.state.error).toBe(false);
    expect(view.setState).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    view.componentDidAppear();
    await flush();
    expect(view.state.error).toBe(true);
    expect(view.state.isLoading).toBe(false);
    view.componentWillUnmount();
});

it('settles a held early reply on Cancel without waiting for appearance or applying the reply', async () => {
    const view = setup();
    const load = jest.spyOn(view, 'loadTransaction');
    runInteractions();
    await flush();
    expect(LedgerService.getTransaction).toHaveBeenCalledTimes(1);
    expect(TransactionFactory.fromLedger).not.toHaveBeenCalled();
    const pending = load.mock.results[0].value as Promise<void>;
    view.dismiss();
    await pending;
    expect(Navigation.dismissModal).not.toHaveBeenCalled();
    view.componentDidAppear();
    await flush();
    expect(TransactionFactory.fromLedger).not.toHaveBeenCalled();
    expect(CoreRepository.saveSettings).not.toHaveBeenCalled();
    expect(view.setState).not.toHaveBeenCalled();
    expect(Navigation.dismissModal).toHaveBeenCalledTimes(1);
    expect(Navigation.dismissModal).toHaveBeenCalledWith(ownId);
    expect(jest.getTimerCount()).toBe(0);
    view.componentWillUnmount();
});

it('does not parse or write after Cancel at any reply/presentation microtask boundary', async () => {
    for (let turns = 0; turns < 13; turns++) {
        let closed = false;
        const writesAfterClose: string[] = [];
        const reply = deferred();
        jest.mocked(LedgerService.getTransaction).mockReturnValue(reply.promise);
        jest.mocked(TransactionFactory.fromLedger).mockImplementation((item) => {
            if (closed) writesAfterClose.push('parse');
            return item as any;
        });
        jest.mocked(CoreRepository.saveSettings).mockImplementation(() => {
            if (closed) writesAfterClose.push('account');
            return undefined as any;
        });
        const view = setup();
        const load = jest.spyOn(view, 'loadTransaction');
        const update = jest.mocked(view.setState).getMockImplementation()!;
        jest.mocked(view.setState).mockImplementation((...args) => {
            if (closed) writesAfterClose.push('UI');
            update(...args);
        });
        await appear(view);
        const pending = load.mock.results[0].value as Promise<void>;
        reply.resolve(response());
        for (let tick = 0; tick < turns; tick++) await Promise.resolve();
        closed = true;
        view.dismiss();
        await pending;
        expect(writesAfterClose).toEqual([]);
        view.componentWillUnmount();
    }
});

it('preserves a pending switch choice when the target changes before appearance', async () => {
    const view = setup({ key: 'TESTNET', name: 'Testnet' });
    runInteractions();
    await flush();
    expect(view.setState).not.toHaveBeenCalled();
    changeNetwork('TESTNET');
    expect(view.setState).not.toHaveBeenCalled();
    view.componentDidAppear();
    await flush();
    expect(view.state.requiresSwitchNetwork).toBe(true);
    expect(view.state.error).toBe(false);
    expect(LedgerService.getTransaction).not.toHaveBeenCalled();
    await view.onSwitchNetworkPress();
    expect(view.state.transactionInstance).toBeDefined();
    expect(LedgerService.getTransaction).toHaveBeenCalledTimes(1);
    expect(view.setState).not.toHaveBeenCalledWith(expect.objectContaining({ error: true }));
    view.componentWillUnmount();
});

it('coalesces pre-appearance network changes and rejects a held reply after A-B-A', async () => {
    const view = setup();
    runInteractions();
    await flush();
    changeNetwork('TESTNET');
    changeNetwork('MAINNET');
    await flush();
    expect(view.setState).not.toHaveBeenCalled();
    view.componentDidAppear();
    await flush();
    expect(TransactionFactory.fromLedger).not.toHaveBeenCalled();
    expect(CoreRepository.saveSettings).not.toHaveBeenCalled();
    expect(view.state.error).toBe(true);
    expect(view.state.isLoading).toBe(false);
    expect(LedgerService.getTransaction).toHaveBeenCalledTimes(1);
    view.componentWillUnmount();
});

it('loads once when native appearance repeats after foregrounding or closing a child modal', async () => {
    const view = setup();
    await appear(view);
    await appear(view);
    expect(LedgerService.getTransaction).toHaveBeenCalledTimes(1);
    view.componentWillUnmount();
    expect(removeListener).toHaveBeenCalledTimes(1);
    expect(NetworkService.off).toHaveBeenCalledWith('networkChange', expect.any(Function));
});

it('does not load after unmounting before the native appearance event', async () => {
    const view = setup();
    view.componentWillUnmount();
    await appear(view);
    expect(LedgerService.getTransaction).not.toHaveBeenCalled();
});

it('cancels a deferred initial task when the modal unmounts', async () => {
    const view = setup();
    view.componentDidAppear();
    view.componentWillUnmount();
    runInteractions();
    await flush();
    expect(LedgerService.getTransaction).not.toHaveBeenCalled();
});

it('early Cancel waits for appearance before targeting this modal and does not start deferred work', async () => {
    const view = setup();
    view.dismiss();
    expect(Navigation.dismissModal).not.toHaveBeenCalled();
    await appear(view);
    expect(Navigation.dismissModal).toHaveBeenCalledWith(ownId);
    expect(LedgerService.getTransaction).not.toHaveBeenCalled();
    view.componentWillUnmount();
});

it('sends one native dismissal when Cancel is pressed again during dismissal', async () => {
    const view = setup();
    view.dismiss();
    view.dismiss();
    expect(Navigation.dismissModal).not.toHaveBeenCalled();
    await appear(view);
    view.dismiss();
    await appear(view);
    expect(Navigation.dismissModal).toHaveBeenCalledTimes(1);
    expect(Navigation.dismissModal).toHaveBeenCalledWith(ownId);
    expect(LedgerService.getTransaction).not.toHaveBeenCalled();
    view.componentWillUnmount();
});

it('drops an early cancellation when another navigation unmounts the modal before appearance', async () => {
    const view = setup();
    view.dismiss();
    view.componentWillUnmount();
    await appear(view);
    expect(Navigation.dismissModal).not.toHaveBeenCalled();
    expect(LedgerService.getTransaction).not.toHaveBeenCalled();
    expect(removeListener).toHaveBeenCalledTimes(1);
    expect(NetworkService.off).toHaveBeenCalledWith('networkChange', expect.any(Function));
    expect(jest.getTimerCount()).toBe(0);
});

it('dismisses an appeared modal immediately and only once', async () => {
    const view = setup();
    await appear(view);
    view.dismiss();
    expect(Navigation.dismissModal).toHaveBeenCalledTimes(1);
    expect(Navigation.dismissModal).toHaveBeenCalledWith(ownId);
    view.dismiss();
    view.componentDidAppear();
    expect(Navigation.dismissModal).toHaveBeenCalledTimes(1);
    view.componentWillUnmount();
});

it('keeps the prompt and never shows an error while the explicit network switch succeeds', async () => {
    const view = setup({ key: 'TESTNET', name: 'Testnet' });
    await appear(view);
    expect(view.state.requiresSwitchNetwork).toBe(true);
    expect(LedgerService.getTransaction).not.toHaveBeenCalled();
    const reply = deferred();
    jest.mocked(LedgerService.getTransaction).mockReturnValueOnce(reply.promise);
    jest.mocked(NetworkService.switchNetwork).mockImplementation(async () => { changeNetwork('TESTNET'); });
    const switching = view.onSwitchNetworkPress();
    await flush();
    expect(view.setState).not.toHaveBeenCalledWith(expect.objectContaining({ error: true }));
    expect(view.state.isLoading).toBe(true);
    expect(view.state.error).toBe(false);
    reply.resolve(response());
    await switching;
    expect(NetworkService.switchNetwork).toHaveBeenCalledWith(view.props.network);
    expect(LedgerService.getTransaction).toHaveBeenCalledTimes(1);
    expect(view.state.transactionInstance).toBeDefined();
    expect(view.state.requiresSwitchNetwork).toBe(false);
    expect(view.setState).not.toHaveBeenCalledWith(expect.objectContaining({ error: true }));
    view.componentWillUnmount();
});

it('allows accepting the existing prompt after the target network was selected externally', async () => {
    const view = setup({ key: 'TESTNET', name: 'Testnet' });
    await appear(view);
    changeNetwork('TESTNET');
    expect(view.state.requiresSwitchNetwork).toBe(true);
    expect(view.state.error).toBe(false);
    expect(LedgerService.getTransaction).not.toHaveBeenCalled();
    await view.onSwitchNetworkPress();
    expect(LedgerService.getTransaction).toHaveBeenCalledTimes(1);
    expect(view.state.transactionInstance).toBeDefined();
    expect(view.state.requiresSwitchNetwork).toBe(false);
    view.componentWillUnmount();
});

it('drops a late first reply when a retry is already in flight', async () => {
    const first = deferred();
    const second = deferred();
    jest.mocked(LedgerService.getTransaction).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = setup();
    await appear(view);
    const retry = view.loadTransaction();
    first.resolve(response('old'));
    await flush();
    expect(TransactionFactory.fromLedger).not.toHaveBeenCalled();
    expect(CoreRepository.saveSettings).not.toHaveBeenCalled();
    second.resolve(response('current'));
    await retry;
    expect(TransactionFactory.fromLedger).toHaveBeenCalledTimes(1);
    expect((view.state.transactionInstance as any).tx.hash).toBe('current');
    expect(jest.getTimerCount()).toBe(0);
    view.componentWillUnmount();
});

it('cancels a pending lookup and prevents account changes after the modal closes', async () => {
    const reply = deferred();
    jest.mocked(LedgerService.getTransaction).mockReturnValue(reply.promise);
    const view = setup();
    await appear(view);
    view.dismiss();
    const updatesBeforeNetworkChange = jest.mocked(view.setState).mock.calls.length;
    changeNetwork('TESTNET');
    expect(jest.getTimerCount()).toBe(0);
    reply.resolve(response());
    await flush();
    expect(TransactionFactory.fromLedger).not.toHaveBeenCalled();
    expect(CoreRepository.saveSettings).not.toHaveBeenCalled();
    expect(view.setState).toHaveBeenCalledTimes(updatesBeforeNetworkChange);
    view.componentWillUnmount();
});

it('rejects late work after switching away and back to the same network', async () => {
    const reply = deferred();
    jest.mocked(LedgerService.getTransaction).mockReturnValue(reply.promise);
    const view = setup();
    await appear(view);
    changeNetwork('TESTNET');
    expect(view.state.requiresSwitchNetwork).toBe(true);
    changeNetwork('MAINNET');
    expect(view.state.requiresSwitchNetwork).toBe(true);
    expect(view.state.error).toBe(false);
    expect(LedgerService.getTransaction).toHaveBeenCalledTimes(1);
    reply.resolve(response());
    await flush();
    expect(TransactionFactory.fromLedger).not.toHaveBeenCalled();
    expect(CoreRepository.saveSettings).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    view.componentWillUnmount();
});

it('retains the ten-second timeout and permits a later retry', async () => {
    const reply = deferred();
    jest.mocked(LedgerService.getTransaction).mockReturnValueOnce(reply.promise);
    const view = setup();
    await appear(view);
    jest.advanceTimersByTime(9_999);
    await flush();
    expect(view.state.error).toBe(false);
    jest.advanceTimersByTime(1);
    await flush();
    expect(view.state.error).toBe(true);
    expect(view.state.isLoading).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
    await view.loadTransaction();
    expect(view.state.transactionInstance).toBeDefined();
    reply.resolve(response('late'));
    await flush();
    expect(TransactionFactory.fromLedger).toHaveBeenCalledTimes(1);
    view.componentWillUnmount();
});

it.each(['rpc-error', 'rejection'])('keeps the failure path and clears the timeout (%s)', async (failure) => {
    if (failure === 'rpc-error') {
        jest.mocked(LedgerService.getTransaction).mockResolvedValue({ error: 'txnNotFound' } as any);
    }
    else jest.mocked(LedgerService.getTransaction).mockRejectedValue(new Error('Offline'));
    const view = setup();
    await appear(view);
    expect(view.state.error).toBe(true);
    expect(view.state.isLoading).toBe(false);
    expect(view.state.requiresSwitchNetwork).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
    view.componentWillUnmount();
});
