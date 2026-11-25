import { Alert } from 'react-native';
import ReviewTransactionModal from '../ReviewTransactionModal';

jest.mock('@services', () => ({ NetworkService: {}, PushNotificationsService: {}, ResolverService: {} }));
jest.mock('@store/repositories', () => ({ CoreRepository: { getSettings: () => ({}) } }));
jest.mock('@common/libs/ledger/factory/validation', () => ({}));
jest.mock('@common/libs/payload', () => ({}));
jest.mock('@common/helpers/interface', () => ({}));
jest.mock('@common/helpers/navigator', () => ({}));
jest.mock('@services/LedgerService', () => ({}));
jest.mock('@services/BackendService', () => ({}));
jest.mock('../Steps', () => ({}));
jest.mock('../Shared/ErrorView', () => ({}));

const pending = () => {
    let resolve!: (value?: any) => void;
    let reject!: (error?: any) => void;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
};
const setup = () => {
    const auth = pending();
    const sign = jest.fn(() => auth.promise);
    const view = new ReviewTransactionModal({ payload: { isMultiSign: () => false } } as any);
    (view as any).mounted = true;
    Object.assign(view.state, { source: { address: 'rSource' }, transaction: { sign } });
    // Simulate React delaying its state update while a native autofill event arrives.
    view.setState = jest.fn();
    view.submit = jest.fn().mockResolvedValue(undefined);
    return { view, sign, auth };
};

afterEach(() => jest.restoreAllMocks());

it('locks amount edits synchronously and prevents a second signing flow', async () => {
    const { view, sign, auth } = setup();
    expect(view.canEditAmount()).toBe(true);
    const first = view.prepareAndSignTransaction();
    expect(view.state.isLoading).toBe(false);
    expect(view.canEditAmount()).toBe(false);
    await view.prepareAndSignTransaction();
    expect(sign).toHaveBeenCalledTimes(1);
    // An unrelated loader completing cannot unlock the signing session.
    view.setLoading(false);
    expect(view.canEditAmount()).toBe(false);
    auth.reject();
    await first;
    expect(view.canEditAmount()).toBe(true);
    expect(view.submit).not.toHaveBeenCalled();
});

it('restores editing after authentication fails', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { view, auth } = setup();
    const job = view.prepareAndSignTransaction();
    auth.reject(new Error('Wrong password'));
    await job;
    expect(view.canEditAmount()).toBe(true);
    expect(view.setState).toHaveBeenCalledWith(expect.objectContaining({ isLoading: false }));
});

it('keeps edits locked until signing and submission both finish', async () => {
    const { view, auth } = setup();
    const submitted = pending();
    view.submit = jest.fn(() => submitted.promise) as any;
    const job = view.prepareAndSignTransaction();
    auth.resolve({ signed: true });
    await Promise.resolve();
    expect(view.submit).toHaveBeenCalled();
    expect(view.canEditAmount()).toBe(false);
    submitted.resolve();
    await job;
    expect(view.canEditAmount()).toBe(true);
});
