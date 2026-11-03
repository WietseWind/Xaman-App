import React from 'react';
import { InteractionManager } from 'react-native';

import { Prompt } from '@common/helpers/interface';
import NetworkService from '@services/NetworkService';
import { AccountRepository, CoreRepository, NetworkRepository } from '@store/repositories';
import { NetworkType } from '@store/types';
import PreflightStep from '../Steps/Preflight/PreflightStep';

jest.mock('@common/helpers/interface', () => ({ Prompt: jest.fn() }));
jest.mock('@common/helpers/navigator', () => ({ Navigator: { dismissModal: jest.fn(), push: jest.fn() } }));
jest.mock('@components/General', () => ({
    Button: 'Button', Icon: 'Icon', Spacer: 'Spacer', InfoMessage: 'InfoMessage',
}));
jest.mock('@screens/Modal/ReviewTransaction/Shared', () => ({ ReviewHeader: 'ReviewHeader' }));
jest.mock('@services/NetworkService', () => ({
    __esModule: true, default: {
        getNetwork: jest.fn(), switchNetwork: jest.fn(), updateNetworkDefinitions: jest.fn(),
        getNetworkDefinitions: jest.fn(),
    },
}));
jest.mock('@store/repositories', () => ({
    AccountRepository: { getSignableAccounts: jest.fn(), getFullAccessAccounts: jest.fn() },
    CoreRepository: { getDefaultAccount: jest.fn() }, NetworkRepository: { findOne: jest.fn() },
}));
jest.mock('@theme', () => ({ AppStyles: {} }));
jest.mock('../Steps/Preflight/styles', () => ({}));

const deferred = () => {
    let resolve: () => void = () => undefined;
    let reject: (error: Error) => void = () => undefined;
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const main = { key: 'MAINNET', name: 'Mainnet', type: NetworkType.Main };
const test = { key: 'TESTNET', name: 'Testnet', type: NetworkType.Test };
const account = { address: 'rSigner', hidden: false };
const elements = (value: any): any[] => {
    if (Array.isArray(value)) return value.flatMap(elements);
    if (!React.isValidElement(value)) return [];
    return [value, ...elements((value.props as any).children)];
};
const button = (view: PreflightStep) => elements(view.render()).find((node) =>
    node.props.testID === 'preflight-switch-network');
const header = (view: PreflightStep) => elements(view.render()).find((node) => node.type === 'ReviewHeader');
const alert = (index = jest.mocked(Prompt).mock.calls.length - 1) => {
    const call = jest.mocked(Prompt).mock.calls[index];
    return { buttons: call[2] as any[], options: call[3] as any };
};
let connected: typeof main;
let network: ReturnType<typeof deferred>;
let definitions: ReturnType<typeof deferred>;
let mount: { callback?: () => void; cancel: jest.Mock };
let views: PreflightStep[];
const setup = async (developerMode = true) => {
    const transaction = { TransactionType: 'Payment', Account: account.address, assertSigningContext: jest.fn() };
    const payload = {
        getForcedNetwork: jest.fn(() => test.key), isPseudoTransaction: () => false,
        getTransactionType: () => 'Payment', getTransaction: jest.fn(() => transaction), getSigners: () => undefined,
    };
    const context: any = {
        payload, coreSettings: { developerMode }, transaction: undefined,
        setTransaction: jest.fn((value) => { context.transaction = value; }),
        setSource: jest.fn(), setAccounts: jest.fn(), setError: jest.fn(),
        onPreflightPass: jest.fn(), onClose: jest.fn(),
    };
    const view = new PreflightStep({});
    view.context = context;
    jest.spyOn(view, 'setState').mockImplementation((value: any) => { Object.assign(view.state, value); });
    view.componentDidMount(); views.push(view);
    await view.runPreFlight();
    expect(view.state.requiredActionData.network).toBe(test);
    return { view, context, payload, transaction };
};
const confirm = (index?: number) => alert(index).buttons[1].onPress() as Promise<void>;

beforeEach(() => {
    jest.clearAllMocks(); views = []; connected = main; network = deferred(); definitions = deferred();
    mount = { cancel: jest.fn() };
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback: any) => {
        mount.callback = callback;
        return mount as any;
    });
    jest.mocked(NetworkService.getNetwork).mockImplementation(() => connected as any);
    jest.mocked(NetworkService.switchNetwork).mockImplementation(async (target: any) => {
        await network.promise; connected = target;
    });
    jest.mocked(NetworkService.updateNetworkDefinitions).mockReturnValue(definitions.promise as any);
    jest.mocked(NetworkService.getNetworkDefinitions).mockReturnValue({ transactionNames: ['Payment'] } as any);
    jest.mocked(NetworkRepository.findOne).mockImplementation(({ key }: any) =>
        ({ MAINNET: main, TESTNET: test }[key as 'MAINNET' | 'TESTNET']) as any);
    jest.mocked(AccountRepository.getSignableAccounts).mockReturnValue([account] as any);
    jest.mocked(AccountRepository.getFullAccessAccounts).mockReturnValue([account] as any);
    jest.mocked(CoreRepository.getDefaultAccount).mockReturnValue(account);
});
afterEach(() => { views.forEach((view) => view.componentWillUnmount()); jest.restoreAllMocks(); });

it('latches taps and confirmation synchronously before React commits busy state', async () => {
    const { view } = await setup();
    jest.mocked(view.setState).mockImplementation(() => {});
    const press = button(view).props.onPress;
    press(); press(); press();
    expect(view.state.networkSwitchStatus).toBe('idle');
    expect(Prompt).toHaveBeenCalledTimes(1);
    const switching = confirm(); await confirm();
    alert().options.onDismiss(); press();
    expect(NetworkService.switchNetwork).toHaveBeenCalledTimes(1);
    expect(Prompt).toHaveBeenCalledTimes(1);
    view.componentWillUnmount(); network.resolve(); await switching;
});

it.each(['cancel', 'native-dismiss'])('allows retry after %s and ignores the retained old Confirm', async (cancel) => {
    const { view } = await setup();
    button(view).props.onPress();
    const old = alert();
    if (cancel === 'cancel') old.buttons[0].onPress(); else old.options.onDismiss();
    expect(button(view).props.isDisabled).toBe(false);
    button(view).props.onPress();
    await old.buttons[1].onPress();
    expect(NetworkService.switchNetwork).not.toHaveBeenCalled();
    expect(Prompt).toHaveBeenCalledTimes(2);
    const switching = confirm();
    expect(NetworkService.switchNetwork).toHaveBeenCalledTimes(1);
    view.componentWillUnmount(); network.resolve(); await switching;
});

it('keeps the rendered button busy through network, definitions and real preflight', async () => {
    const { view, context, transaction } = await setup();
    button(view).props.onPress();
    expect(button(view).props.isDisabled).toBe(true);
    expect(button(view).props.isLoading).toBe(false);
    const switching = confirm();
    alert().options.onDismiss();
    expect(button(view).props.isLoading).toBe(true);
    network.resolve(); await flush();
    expect(NetworkService.updateNetworkDefinitions).toHaveBeenCalledTimes(1);
    expect(button(view).props.isDisabled).toBe(true);
    expect(button(view).props.isLoading).toBe(true);
    expect(context.onPreflightPass).not.toHaveBeenCalled();
    definitions.resolve(); await switching;
    expect(transaction.assertSigningContext).toHaveBeenCalledTimes(1);
    expect(context.setTransaction).toHaveBeenCalledWith(transaction);
    expect(context.setSource).toHaveBeenCalledWith(account);
    expect(context.onPreflightPass).toHaveBeenCalledTimes(1);
    expect(button(view).props.isDisabled).toBe(false);
    expect(button(view).props.isLoading).toBe(false);
});

it('keeps busy during the forced definition refresh for a new transaction type', async () => {
    const { view, context, transaction } = await setup();
    const refreshed = deferred();
    jest.mocked(NetworkService.getNetworkDefinitions).mockReturnValue({ transactionNames: [] } as any);
    jest.mocked(NetworkService.updateNetworkDefinitions).mockImplementation((force) =>
        (force ? refreshed.promise : definitions.promise) as any);
    button(view).props.onPress(); const switching = confirm();
    network.resolve(); await flush(); definitions.resolve(); await flush();
    expect(NetworkService.updateNetworkDefinitions).toHaveBeenLastCalledWith(true);
    expect(button(view).props.isLoading).toBe(true);
    expect(transaction.assertSigningContext).not.toHaveBeenCalled();
    refreshed.resolve(); await switching;
    expect(transaction.assertSigningContext).toHaveBeenCalledTimes(1);
    expect(context.onPreflightPass).toHaveBeenCalledTimes(1);
});

it('shows a network failure, unlocks the button and allows one fresh retry', async () => {
    const { view, context } = await setup();
    button(view).props.onPress(); const first = confirm();
    network.reject(new Error('Connection failed')); await first;
    expect(Prompt).toHaveBeenLastCalledWith(expect.any(String), 'Connection failed');
    expect(context.onPreflightPass).not.toHaveBeenCalled();
    expect(button(view).props.isDisabled).toBe(false);
    network = deferred(); button(view).props.onPress(); const retry = confirm();
    expect(NetworkService.switchNetwork).toHaveBeenCalledTimes(2);
    network.resolve(); definitions.resolve(); await retry;
    expect(context.onPreflightPass).toHaveBeenCalledTimes(1);
});

it.each(['definitions', 'forced-network', 'signing-context'])(
    'surfaces a %s failure once and settles busy state', async (failure) => {
        const { view, context, transaction } = await setup();
        const error = new Error(failure);
        button(view).props.onPress(); const switching = confirm();
        network.resolve(); await flush();
        if (failure === 'definitions') definitions.reject(error);
        else {
            if (failure === 'forced-network') {
                jest.mocked(NetworkRepository.findOne).mockImplementation(() => { throw error; });
            }
            else transaction.assertSigningContext.mockImplementation(() => { throw error; });
            definitions.resolve();
        }
        await switching;
        expect(context.setError).toHaveBeenCalledTimes(1);
        expect(context.setError).toHaveBeenCalledWith(error);
        expect(context.setTransaction).not.toHaveBeenCalled();
        expect(context.onPreflightPass).not.toHaveBeenCalled();
        expect(button(view).props.isLoading).toBe(false);
    },
);

it.each(['close', 'unmount'])('rejects a retained Confirm after %s before native removal', async (stop) => {
    const { view, context } = await setup();
    button(view).props.onPress(); const retained = alert();
    if (stop === 'close') { header(view).props.onClose(); header(view).props.onClose(); }
    else view.componentWillUnmount();
    const writes = jest.mocked(view.setState).mock.calls.length;
    await retained.buttons[1].onPress();
    expect(NetworkService.switchNetwork).not.toHaveBeenCalled();
    expect(view.setState).toHaveBeenCalledTimes(writes);
    expect(context.onClose).toHaveBeenCalledTimes(stop === 'close' ? 1 : 0);
    expect(mount.cancel).toHaveBeenCalled();
});

it.each(['close-network', 'unmount-network', 'close-definitions', 'unmount-definitions'])(
    'does not apply background work after %s', async (stop) => {
        const { view, context, transaction } = await setup();
        button(view).props.onPress(); const switching = confirm();
        if (stop.endsWith('definitions')) { network.resolve(); await flush(); }
        if (stop.startsWith('close')) header(view).props.onClose(); else view.componentWillUnmount();
        const writes = jest.mocked(view.setState).mock.calls.length;
        network.resolve(); definitions.resolve(); await switching;
        expect(view.setState).toHaveBeenCalledTimes(writes);
        expect(transaction.assertSigningContext).not.toHaveBeenCalled();
        expect(context.setTransaction).not.toHaveBeenCalled();
        expect(context.setSource).not.toHaveBeenCalled();
        expect(context.setAccounts).not.toHaveBeenCalled();
        expect(context.onPreflightPass).not.toHaveBeenCalled();
        expect(context.setError).not.toHaveBeenCalled();
    },
);

it.each(['payload', 'required-network', 'required-action'])(
    'ignores stale confirmation after %s changes', async (change) => {
    const { view, context } = await setup();
    button(view).props.onPress();
    if (change === 'payload') view.context = { ...context, payload: { ...context.payload } };
    else if (change === 'required-network') view.state.requiredActionData = { network: main };
    else view.state.requiredAction = undefined;
    await confirm();
    expect(NetworkService.switchNetwork).not.toHaveBeenCalled();
    expect(context.onPreflightPass).not.toHaveBeenCalled();
    expect(view.state.networkSwitchStatus).toBe('idle');
    },
);

it('ignores a replaced payload while definitions are pending', async () => {
    const { view, context, transaction } = await setup();
    button(view).props.onPress(); const switching = confirm(); network.resolve(); await flush();
    view.context = { ...context, payload: { ...context.payload } };
    definitions.resolve(); await switching;
    expect(transaction.assertSigningContext).not.toHaveBeenCalled();
    expect(context.setTransaction).not.toHaveBeenCalled();
    expect(context.onPreflightPass).not.toHaveBeenCalled();
});

it('rechecks forced network after definitions before capturing signing context', async () => {
    const { view, context, transaction } = await setup();
    button(view).props.onPress(); const switching = confirm(); network.resolve(); await flush();
    connected = main;
    definitions.resolve(); await switching;
    expect(view.state.requiredActionData.network).toBe(test);
    expect(transaction.assertSigningContext).not.toHaveBeenCalled();
    expect(context.setTransaction).not.toHaveBeenCalled();
    expect(context.onPreflightPass).not.toHaveBeenCalled();
});

it.each([[NetworkType.Main, false, true], [NetworkType.Test, false, false], [NetworkType.Test, true, true]])(
    'keeps switch visibility for network type %s, developer mode %s', async (type, developer, visible) => {
        const { view } = await setup(developer);
        view.state.requiredActionData = { network: { ...test, type } };
        expect(Boolean(button(view))).toBe(visible);
    },
);

it('does not restart canceled deferred initialization after unmount', async () => {
    const { view, context } = await setup();
    view.componentWillUnmount();
    const writes = jest.mocked(view.setState).mock.calls.length;
    mount.callback?.(); await flush();
    expect(NetworkService.updateNetworkDefinitions).not.toHaveBeenCalled();
    expect(view.setState).toHaveBeenCalledTimes(writes);
    expect(context.onPreflightPass).not.toHaveBeenCalled();
    expect(mount.cancel).toHaveBeenCalled();
});
