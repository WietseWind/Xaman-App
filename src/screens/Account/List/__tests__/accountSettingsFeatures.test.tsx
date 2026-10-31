import renderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import Localize from '@locale';
import { AccountRepository } from '@store/repositories';
import { AccountTypes, AccessLevels, EncryptionLevels } from '@store/types';
import { Navigator } from '@common/helpers/navigator';
import { AppScreens } from '@common/constants';
import { Button, Switch } from '@components/General';
import AccountSettings from '../../Edit/AccountSettingsView';
import AccountList from '../AccountsListView';
import { SettingsRow } from '@screens/Settings/SettingsSection';

jest.mock('@store/repositories', () => ({
    AccountRepository: { getAccounts: jest.fn(), getSignableAccounts: jest.fn(() => []), update: jest.fn() },
    CoreRepository: {},
}));
jest.mock('@store/repositories/core', () => ({ __esModule: true, default: {} }));
jest.mock('@common/helpers/device', () => ({
    ...jest.requireActual('@common/helpers/device'),
    GetLayoutInsets: () => ({ top: 20, bottom: 34 }),
    HasBottomNotch: () => true,
}));
jest.mock('@common/helpers/navigator', () => ({ Navigator: { push: jest.fn(), pop: jest.fn() } }));
jest.mock('@components/Modules', () => ({ ProBadge: () => null }));

let tree: ReactTestRenderer;
const account = (overrides = {}) =>
    ({
        address: 'rFixture',
        label: 'Personal',
        type: AccountTypes.Regular,
        accessLevel: AccessLevels.Full,
        encryptionLevel: EncryptionLevels.Passcode,
        hidden: false,
        isValid: () => true,
        ...overrides,
    }) as any;
const listSource = (items: any[]) =>
    Object.assign([...items], {
        sorted: () => listSource(items),
        isEmpty: () => items.length === 0,
    });
const renderEdit = (overrides = {}, state = {}) => {
    const screen = new AccountSettings({ account: account(overrides) });
    Object.assign(screen.state, {
        accountCanSign: true,
        fetchingPushState: false,
        pushAvailable: true,
        ...state,
    });
    act(() => {
        tree = renderer.create(screen.render());
    });
    return screen;
};
const rows = () => tree.root.findAllByType(SettingsRow);
const row = (key: string) => rows().find((node) => node.props.label === Localize.t(key));

beforeEach(() => jest.clearAllMocks());
afterEach(() => {
    act(() => tree?.unmount());
});

it('keeps label editing, access changes, full selectable address and passcode information', () => {
    const screen = renderEdit();
    expect(row('account.accountLabel')?.props.onPress).toBe(screen.accountLabelPressed);
    expect(row('account.accessLevel')?.props.onPress).toBe(screen.showAccessLevelPicker);
    expect(row('account.securityLevel')?.props.value).toBe(EncryptionLevels.Passcode);
    expect(row('account.changePassword')).toBeUndefined();
    const address = tree.root.findAllByType(Text).find((node) => node.props.children === 'rFixture');
    expect(address?.props.selectable).toBe(true);
});

it('keeps password changes only on full-access password accounts', () => {
    const screen = renderEdit({ encryptionLevel: EncryptionLevels.Passphrase });
    expect(row('account.changePassword')?.props.onPress).toBe(screen.showChangePassphrase);
    act(() => tree.unmount());
    renderEdit(
        { encryptionLevel: EncryptionLevels.Passphrase, accessLevel: AccessLevels.Readonly },
        { accountCanSign: false },
    );
    expect(row('account.changePassword')).toBeUndefined();
    expect(row('account.securityLevel')).toBeUndefined();
    expect(row('global.accounttxpush')).toBeUndefined();
    expect(row('account.accessLevel')).toBeDefined();
});

it('preserves Tangem identification and enforced security without exposing regular-account access controls', () => {
    const screen = renderEdit({ type: AccountTypes.Tangem, additionalInfo: { cardId: 'AA00000000000001' } });
    expect(row('account.accessLevel')).toBeUndefined();
    expect(row('account.securityLevel')).toBeUndefined();
    expect(row('account.cardEnforcedSecurity')?.props.onPress).toBe(screen.showChangeTangemSecurity);
    const identify = tree.root
        .findAllByType(Button)
        .find((node) => node.props.testID === 'identify-tangem-button');
    act(() => identify!.props.onPress());
    expect(Navigator.push).toHaveBeenCalledWith(AppScreens.Account.Edit.IdentifyTangemCard, {
        account: screen.state.account,
    });
});

it.each([
    [true, true],
    [false, false],
    [false, true],
])('keeps push controls disabled while fetching=%s or unavailable=%s', (fetchingPushState, unavailable) => {
    renderEdit({}, { fetchingPushState, pushAvailable: !unavailable });
    const push = tree.root.findAllByType(Switch)[0];
    expect(push.props.isDisabled).toBe(fetchingPushState || unavailable);
    expect(push.props.accessibilityLabel).toBe(Localize.t('global.accounttxpush'));
});

it('retains hidden and removal handlers and the separate removal confirmation flow', () => {
    const screen = renderEdit();
    const hidden = tree.root
        .findAllByType(Switch)
        .find((node) => node.props.onChange === screen.onHiddenChange);
    expect(hidden).toBeDefined();
    const remove = tree.root
        .findAllByType(Button)
        .find((node) => node.props.label === Localize.t('account.removeFromXaman'));
    expect(remove?.props.onPress).toBe(screen.onRemovePress);
});

it.each([
    ['readonly', false, { disableMasterKey: false }, false, 'account.readOnly'],
    ['disabled', false, { disableMasterKey: true }, false, 'account.masterKeyDisabled'],
    ['signable', true, { disableMasterKey: false }, false, 'account.fullAccess'],
    ['regular key', true, { disableMasterKey: false }, 'Savings', 'account.regularKeyFor'],
])(
    'keeps %s access status and full address on account cards',
    (_, isSignable, flags, isRegularKeyFor, key) => {
        const item = account({ flags, hidden: true });
        jest.mocked(AccountRepository.getAccounts).mockReturnValue(listSource([item]) as any);
        const screen = new AccountList({});
        Object.assign(screen.state, {
            accountDetails: { rFixture: { isSignable, isRegularKeyFor } },
            fetchingPro: false,
        });
        act(() => {
            tree = renderer.create(screen.renderItem({ item }));
        });
        const text = tree.root
            .findAllByType(Text)
            .map((node) => node.props.children)
            .join(' ');
        expect(text).toContain(Localize.t(key));
        expect(text).toContain(Localize.t('global.hidden'));
        expect(text).toContain('rFixture');
        const edit = tree.root.findByType(Button);
        act(() => edit.props.onPress());
        expect(Navigator.push).toHaveBeenCalledWith(
            AppScreens.Account.Edit.Settings,
            expect.objectContaining({ account: item }),
        );
    },
);

it('preserves the encryption upgrade requirement before adding another account', () => {
    jest.mocked(AccountRepository.getAccounts).mockReturnValue(listSource([account()]) as any);
    const screen = new AccountList({});
    Object.assign(screen.state, { loadingAccountDetails: false, isMigrationRequired: true });
    act(() => {
        tree = renderer.create(screen.render());
    });
    const buttons = tree.root.findAllByType(Button);
    expect(buttons.some((node) => node.props.testID === 'add-account-button')).toBe(false);
    expect(buttons.some((node) => node.props.testID === 'update-encryption-button')).toBe(true);
});

it('keeps Add account available when encryption is current', () => {
    jest.mocked(AccountRepository.getAccounts).mockReturnValue(listSource([account()]) as any);
    const screen = new AccountList({});
    Object.assign(screen.state, { loadingAccountDetails: false, isMigrationRequired: false });
    act(() => { tree = renderer.create(screen.render()); });
    const add = tree.root.findAllByType(Button).find((node) => node.props.testID === 'add-account-button');
    expect(add).toBeDefined();
    act(() => add!.props.onPress());
    expect(Navigator.push).toHaveBeenCalledWith(AppScreens.Account.Add, {});
});

it('does not read an invalidated Realm account while returning from account removal', () => {
    const invalid = {
        isValid: () => false,
        get address() {
            throw new Error('Invalid Realm object');
        },
    };
    jest.mocked(AccountRepository.getAccounts).mockReturnValue(listSource([account(), invalid]) as any);
    const screen = new AccountList({});
    Object.assign(screen.state, { loadingAccountDetails: false });
    expect(() => {
        act(() => {
            tree = renderer.create(screen.render());
        });
    }).not.toThrow();
});
