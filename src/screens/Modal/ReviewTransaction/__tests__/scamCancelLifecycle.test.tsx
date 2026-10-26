import { Navigation } from 'react-native-navigation';
import { Navigator } from '@common/helpers/navigator';
import { resolveScamSignRequest } from '../scamRejectAction';
import ReviewStep from '../Steps/Review/ReviewStep';

jest.mock('@services', () => ({
    BackendService: {},
    LedgerService: {},
    PushNotificationsService: { emit: jest.fn() },
    ResolverService: {},
    StyleService: {},
}));
jest.mock('@components/General', () => ({}));
jest.mock('@components/Modules', () => ({}));
jest.mock('@components/Modules/ReviewTransaction', () => ({}));
jest.mock('@screens/Modal/ReviewTransaction/Shared', () => ({}));
jest.mock('@common/helpers/navigator', () => ({
    Navigator: {
        currentModal: jest.fn(() => 'initiating-review'),
        showModal: jest.fn(),
    },
}));
jest.mock('react-native-navigation', () => ({
    Navigation: { dismissModal: jest.fn(async () => undefined) },
    OptionsModalPresentationStyle: { fullScreen: 'fullScreen' },
}));
jest.mock('@common/libs/payload', () => ({ Payload: { build: jest.fn((tx) => tx) } }));
jest.mock('../scamRejectAction', () => ({
    resolveScamSignRequest: jest.fn(),
}));
jest.mock('../Steps/Review/Templates/genuine', () => ({}));
jest.mock('../Steps/Review/Templates/pseudo', () => ({}));
jest.mock('../Steps/Review/Templates/fallback', () => ({}));
jest.mock('../Steps/Review/styles', () => ({}));
jest.mock('@theme', () => ({ AppStyles: {} }));

const setup = () => {
    const step = new ReviewStep({}) as any;
    const reject = jest.fn();
    const setLoading = jest.fn();
    step.context = { payload: { reject }, source: { address: 'rSelf' }, transaction: {}, setLoading, isLoading: false };
    step.mounted = true;
    let finish: (value: any) => void = () => undefined;
    (resolveScamSignRequest as jest.Mock).mockImplementation(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    return {
        step,
        reject,
        setLoading,
        release: () =>
            finish({
                isScam: true,
                cancelCraft: { txJson: { TransactionType: 'CheckCancel', CheckID: 'CHECK' } },
            }),
    };
};

beforeEach(() => {
    jest.clearAllMocks();
    (Navigator.currentModal as jest.Mock).mockReturnValue('initiating-review');
    (Navigation.dismissModal as jest.Mock).mockImplementation(async () => {
        (Navigator.currentModal as jest.Mock).mockReturnValue(undefined);
    });
});

it.each(['unmount', 'source', 'payload', 'covered'])('drops a pending cancellation after %s', async (change) => {
    const { step, release, reject } = setup();
    const pending = step.onScamCancelPress();
    if (change === 'unmount') step.componentWillUnmount();
    if (change === 'covered') (Navigator.currentModal as jest.Mock).mockReturnValue('unrelated-modal');
    if (change === 'source') step.context = { ...step.context, source: { address: 'rOther' } };
    if (change === 'payload') step.context = { ...step.context, payload: { reject: jest.fn() } };
    release();
    await pending;
    expect(reject).not.toHaveBeenCalled();
    expect(Navigation.dismissModal).not.toHaveBeenCalled();
    expect(Navigator.showModal).not.toHaveBeenCalled();
});

it('latches duplicate presses and dismisses the initiating modal by identity', async () => {
    const { step, release, reject, setLoading } = setup();
    const pending = step.onScamCancelPress();
    await step.onScamCancelPress();
    expect(resolveScamSignRequest).toHaveBeenCalledTimes(1);
    release();
    await pending;
    expect(reject).toHaveBeenCalledTimes(1);
    expect(Navigation.dismissModal).toHaveBeenCalledWith('initiating-review');
    expect(Navigator.showModal).toHaveBeenCalledTimes(1);
    expect(setLoading.mock.calls).toEqual([[true], [false]]);
});
