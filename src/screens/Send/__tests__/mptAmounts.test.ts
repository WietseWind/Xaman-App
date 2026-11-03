import { Prompt } from '@common/helpers/interface';
import { Navigator } from '@common/helpers/navigator';
import SendView from '../SendView';
import DetailsStep from '../Steps/Details/DetailsStep';

jest.mock('../Steps', () => ({}));
jest.mock('@components/General', () => ({}));
jest.mock('@components/Modules', () => ({}));
jest.mock('../styles', () => ({}));
jest.mock('../Steps/Details/styles', () => ({}));
jest.mock('@services/LedgerService');
jest.mock('@services/NetworkService');
jest.mock('@common/helpers/interface', () => ({ Prompt: jest.fn() }));
jest.mock('@common/helpers/navigator', () => ({ Navigator: { showAlertModal: jest.fn() } }));
jest.mock('@common/libs/ledger/mixin', () => ({ SignMixin: (base: any) => base }));
jest.mock('@common/libs/ledger/transactions', () => ({
    ...jest.requireActual('@common/libs/ledger/transactions'),
    PaymentValidation: jest.fn(async () => undefined),
}));
jest.mock('@store/repositories', () => ({
    AccountRepository: { getSpendableAccounts: () => [] },
    CoreRepository: { getSettings: () => ({ account: {} }) },
}));

const ID = 'A'.repeat(48);
const tokenFor = (scale: number) => ({
    currency: { currencyCode: ID, issuer: 'rhpHaFggC92ELty3n3yDEtuFgWxXWkUFET' },
    limit_peer: `0|${JSON.stringify({ AssetScale: scale })}`,
    isMPToken: () => true,
});
const syncState = (view: any) => {
    view.setState = (state: any, callback?: () => void) => {
        Object.assign(view.state, state);
        callback?.();
    };
};
const sendView = (token: any, amount: string) => {
    const view = new SendView({ componentId: 'test' } as any);
    syncState(view);
    Object.assign(view.state, {
        token,
        amount,
        source: { address: 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY' },
        destination: { address: 'rUwaiErsYE5kibUUtaPczXZVVd73VNy4R9' },
        selectedFee: { value: '12' },
    });
    (view.state.payment as any).sign = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(view, 'submit').mockImplementation(() => undefined);
    return view;
};

afterEach(() => jest.clearAllMocks());

it.each([
    [0, '10', '10'],
    [1, '10', '100'],
    [2, '0.29', '29'],
    [6, '1.000001', '1000001'],
    [2, '90071992547409.93', '9007199254740993'],
])('quotes and signs the same exact units at scale %s for %s', async (scale, amount, raw) => {
    const view = sendView(tokenFor(scale), amount);
    expect((view.getPaymentJsonForFee().Amount as any).value).toBe(raw);
    await view.send();
    expect(view.state.payment.Amount).toEqual(expect.objectContaining({ mpt_issuance_id: ID, value: raw }));
    expect((view.state.payment as any).sign).toHaveBeenCalledTimes(1);
    expect(Navigator.showAlertModal).not.toHaveBeenCalled();
});

it.each([tokenFor(1), { ...tokenFor(2), limit_peer: '0|undefined' }])(
    'does not sign an invalid MPT draft or crash a fee render',
    async (token) => {
        const view = sendView(token, '0.01');
        expect((view.getPaymentJsonForFee().Amount as any).value).toBe('0');
        await view.send();
        expect((view.state.payment as any).sign).not.toHaveBeenCalled();
        expect(Navigator.showAlertModal).toHaveBeenCalledTimes(1);
    },
);

it.each([
    [2, '0.29', true],
    [1, '0.1', true],
    [1, '0.01', false],
    [0, '0.1', false],
    [2, '90071992547409.93', true],
])('validates exact precision before advancing: scale %s, %s', async (scale, amount, valid) => {
    const view = new DetailsStep({});
    syncState(view);
    const next = jest.fn();
    view.context = {
        token: tokenFor(scale),
        source: { balance: 10 },
        amount,
        goNext: next,
    } as any;
    jest.spyOn(view, 'getAvailableBalance').mockResolvedValue('9223372036854775807');
    await view.goNext();
    expect(next).toHaveBeenCalledTimes(valid ? 1 : 0);
    expect(Prompt).toHaveBeenCalledTimes(valid ? 0 : 1);
});

it('preserves native and IOU draft conversion', async () => {
    const native = sendView('XRP', '0.29');
    expect(native.getPaymentJsonForFee().Amount).toBe('290000');
    await native.send();
    expect(native.state.payment.Amount?.value).toBe('0.29');
    const iou = sendView(
        {
            currency: { currencyCode: 'USD', issuer: 'rhpHaFggC92ELty3n3yDEtuFgWxXWkUFET' },
            isMPToken: () => false,
        },
        '0.29',
    );
    expect(iou.getPaymentJsonForFee().Amount).toEqual({
        currency: 'USD',
        issuer: 'rhpHaFggC92ELty3n3yDEtuFgWxXWkUFET',
        value: '0.29',
    });
    await iou.send();
    expect(iou.state.payment.Amount?.value).toBe('0.29');
});
