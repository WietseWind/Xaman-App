import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { InteractionManager } from 'react-native';
import { LedgerService } from '@services';
import PaymentTemplate from '../Payment';

jest.mock('@services', () => ({
    LedgerService: { getLedgerEntry: jest.fn() },
    BackendService: {},
    NetworkService: { getNativeAsset: () => 'XRP' },
    StyleService: {},
}));
jest.mock('@components/General', () => ({}));
jest.mock('@components/Modules', () => ({}));
jest.mock('@store/repositories', () => ({}));
jest.mock('@screens/Send/Steps/Summary/styles', () => ({}));
jest.mock('../../styles', () => ({}));
jest.mock('@theme', () => ({ AppStyles: {} }));
jest.mock('@common/utils/balance', () => ({}));

const ID = 'A'.repeat(48);
const OTHER = 'B'.repeat(48);
let tree: renderer.ReactTestRenderer | undefined;
const propsFor = (address = 'rA', issuance = ID) =>
    ({
        source: { address, lines: [] },
        transaction: { Amount: { mpt_issuance_id: issuance, value: '10' } },
        payload: { isPathFinding: () => false },
        setReady: jest.fn(),
    }) as any;

beforeEach(() => {
    jest.spyOn(PaymentTemplate.prototype, 'render').mockReturnValue(null);
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((task: any) => {
        task();
        return { cancel: jest.fn(), then: jest.fn(), done: jest.fn() } as any;
    });
    (LedgerService.getLedgerEntry as jest.Mock).mockReset();
});

afterEach(() => {
    if (tree) act(() => tree!.unmount());
    tree = undefined;
    jest.restoreAllMocks();
});

const mount = async (props: any) => {
    await act(async () => {
        tree = renderer.create(React.createElement(PaymentTemplate, props));
    });
    return tree!.getInstance() as any;
};

it('clears A before B completes, then accepts B having no holding object', async () => {
    let release: (value: any) => void = () => undefined;
    (LedgerService.getLedgerEntry as jest.Mock).mockImplementation(async (spec) => {
        if (!spec.mptoken) return { node: { AssetScale: 2 } };
        if (spec.mptoken.account === 'rA') return { node: { MPTAmount: '100' } };
        return new Promise((resolve) => {
            release = resolve;
        });
    });
    const a = propsFor();
    const view = await mount(a);
    expect(view.state.mptDetails.MPTAmount).toBe('100');
    const b = { ...a, source: { address: 'rB', lines: [] } };
    await act(async () => {
        tree!.update(React.createElement(PaymentTemplate, b));
    });
    expect(view.state.mptDetails).toBeUndefined();
    expect(view.state.mptLoading).toBe(true);
    expect(a.setReady).toHaveBeenLastCalledWith(false);
    await act(async () => {
        release({ error: 'entryNotFound' });
    });
    expect(view.state.account).toBe('rB');
    expect(view.state.mptDetails).toBeUndefined();
    expect(view.state.mptLoading).toBe(false);
    expect(a.setReady).toHaveBeenLastCalledWith(true);
});

it('drops a slow A response after B has completed', async () => {
    let release: (value: any) => void = () => undefined;
    (LedgerService.getLedgerEntry as jest.Mock).mockImplementation(async (spec) => {
        if (!spec.mptoken) return { node: { AssetScale: 2 } };
        if (spec.mptoken.account === 'rA') {
            return new Promise((resolve) => {
                release = resolve;
            });
        }
        return { node: { MPTAmount: '20' } };
    });
    const a = propsFor();
    const view = await mount(a);
    await act(async () => {
        tree!.update(React.createElement(PaymentTemplate, { ...a, source: { address: 'rB', lines: [] } }));
    });
    expect(view.state.mptDetails.MPTAmount).toBe('20');
    const calls = a.setReady.mock.calls.length;
    await act(async () => {
        release({ node: { MPTAmount: '100' } });
    });
    expect(view.state.mptDetails.MPTAmount).toBe('20');
    expect(a.setReady).toHaveBeenCalledTimes(calls);
});

it('refetches when an issuance changes in the same mutable transaction object', async () => {
    (LedgerService.getLedgerEntry as jest.Mock).mockImplementation(async (spec) => ({
        node: spec.mptoken
            ? { MPTAmount: spec.mptoken.mpt_issuance_id === ID ? '10' : '30' }
            : { AssetScale: 2 },
    }));
    const props = propsFor();
    const view = await mount(props);
    props.transaction.Amount.mpt_issuance_id = OTHER;
    await act(async () => {
        tree!.update(React.createElement(PaymentTemplate, props));
    });
    expect(view.state.mptDetails.MPTAmount).toBe('30');
    expect(LedgerService.getLedgerEntry).toHaveBeenCalledTimes(4);
});

it('does not enable acceptance after a holding lookup fails', async () => {
    (LedgerService.getLedgerEntry as jest.Mock).mockImplementation(async (spec) => {
        if (spec.mptoken) throw new Error('offline');
        return { node: { AssetScale: 2 } };
    });
    const props = propsFor();
    const view = await mount(props);
    expect(view.state.mptIssuanceDetails).toBeUndefined();
    expect(view.state.mptIssuanceError.error).toBe('fetch_failed');
    expect(props.setReady).toHaveBeenLastCalledWith(false);
});

it('drops responses after unmount and preserves pathfinding readiness', async () => {
    let release: (value: any) => void = () => undefined;
    (LedgerService.getLedgerEntry as jest.Mock).mockImplementation(async (spec) => {
        if (spec.mptoken) {
            return new Promise((resolve) => {
                release = resolve;
            });
        }
        return { node: { AssetScale: 2 } };
    });
    const props = propsFor();
    props.payload.isPathFinding = () => true;
    await mount(props);
    const calls = props.setReady.mock.calls.length;
    act(() => {
        tree!.unmount();
    });
    tree = undefined;
    await act(async () => {
        release({ node: { MPTAmount: '100' } });
    });
    expect(props.setReady).toHaveBeenCalledTimes(calls);
    (LedgerService.getLedgerEntry as jest.Mock).mockResolvedValue({ node: { AssetScale: 2 } });
    await mount(props);
    expect(props.setReady).toHaveBeenLastCalledWith(false);
});
