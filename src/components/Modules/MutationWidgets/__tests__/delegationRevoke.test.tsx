import { LedgerObjectFactory } from '@common/libs/ledger/factory';
import { Navigator } from '@common/helpers/navigator';
import { Payload } from '@common/libs/payload';
import NetworkService from '@services/NetworkService';
import { AccountRepository } from '@store/repositories';
import ActionButtons from '../ActionButtons';

jest.mock('@services/NetworkService');
jest.mock('@components/General', () => ({ Button: () => null }));
jest.mock('@common/helpers/navigator', () => ({
    Navigator: { showModal: jest.fn(), showAlertModal: jest.fn(), pop: jest.fn() },
}));

const owner = 'rQQQrUdN1cLdNmxH4dHfKgmX5P4kf3ZrM';
const delegate = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const entry = { LedgerEntryType: 'Delegate', Account: owner, Authorize: delegate,
    Permissions: [{ Permission: { PermissionValue: 'NFTokenModify' } }],
    Flags: 0, OwnerNode: '0', index: 'A'.repeat(64) };
let networkKey = 'TESTNET';
const create = (address = owner) => {
    const item = LedgerObjectFactory.fromLedger(entry as any)!;
    const view = new ActionButtons({ item, account: { address } } as any);
    jest.spyOn(view, 'setState').mockImplementation((update: any) => Object.assign(view.state, update));
    return view;
};
beforeEach(() => {
    networkKey = 'TESTNET';
    jest.clearAllMocks();
    jest.spyOn(NetworkService, 'getConnectionDetails').mockImplementation(() => ({
        networkKey, networkId: networkKey === 'TESTNET' ? 1 : 0, type: 'xrpl', node: '',
    } as any));
    jest.spyOn(AccountRepository, 'getSpendableAccounts')
        .mockReturnValue([{ address: owner }, { address: delegate }] as any);
});
afterEach(() => jest.restoreAllMocks());

it('opens a review for the exact principal and delegate with an empty permission list', async () => {
    const view = create();
    const payload = {} as { revokedPermissions?: unknown[] };
    const build = jest.spyOn(Payload, 'build').mockReturnValue(payload as any);
    await view.setAvailableActions();
    expect(view.state.availableActions).toEqual(['REMOVE_DELEGATION']);
    await view.onActionButtonPress('REMOVE_DELEGATION' as any);
    expect(build).toHaveBeenCalledWith({ TransactionType: 'DelegateSet', Account: owner,
        Authorize: delegate, Permissions: [] });
    expect(payload.revokedPermissions).toEqual(entry.Permissions);
    expect(Navigator.showModal).toHaveBeenCalledTimes(1);
});

it('does not offer revocation to the receiving account and rejects a forced action', async () => {
    const view = create(delegate);
    await view.setAvailableActions();
    expect(view.state.availableActions).toEqual([]);
    await view.onActionButtonPress('REMOVE_DELEGATION' as any);
    expect(Navigator.showModal).not.toHaveBeenCalled();
});

it('does not offer or start revocation from a watch-only account', async () => {
    jest.mocked(AccountRepository.getSpendableAccounts).mockReturnValue([] as any);
    const view = create();
    await view.setAvailableActions();
    expect(view.state.availableActions).toBeUndefined();
    await view.onActionButtonPress('REMOVE_DELEGATION' as any);
    expect(Navigator.showModal).not.toHaveBeenCalled();
});

it('blocks a stale revoke button after a network switch', async () => {
    const view = create();
    await view.setAvailableActions();
    expect(view.state.availableActions).toEqual(['REMOVE_DELEGATION']);
    networkKey = 'MAINNET';
    await view.onActionButtonPress('REMOVE_DELEGATION' as any);
    expect(Navigator.showModal).not.toHaveBeenCalled();
    expect(Navigator.showAlertModal).toHaveBeenCalledTimes(1);
    await view.setAvailableActions();
    expect(view.state.availableActions).toEqual([]);
});

it('rechecks ownership if the selected account changes before the action', async () => {
    const view = create();
    await view.setAvailableActions();
    view.props.account.address = delegate;
    await view.onActionButtonPress('REMOVE_DELEGATION' as any);
    expect(Navigator.showModal).not.toHaveBeenCalled();
});
