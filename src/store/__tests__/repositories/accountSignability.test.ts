import AccountRepository from '../../repositories/account';
import { AccessLevels } from '@store/types';
import { AccountModel } from '@store/models';

const account = (changes: Record<string, unknown> = {}) => ({
    address: 'rOwner', accessLevel: AccessLevels.Full, balance: 10, hidden: false,
    flags: { disableMasterKey: false }, ...changes,
}) as unknown as AccountModel;

afterEach(() => jest.restoreAllMocks());

it.each([
    ['enabled master', AccessLevels.Full, false, undefined, false, true],
    ['enabled master and unavailable regular key', AccessLevels.Full, false, 'rKey', false, true],
    ['disabled master without regular key', AccessLevels.Full, true, undefined, false, false],
    ['disabled master and unavailable regular key', AccessLevels.Full, true, 'rKey', false, false],
    ['disabled master and imported regular key', AccessLevels.Full, true, 'rKey', true, true],
    ['readonly without regular key', AccessLevels.Readonly, false, undefined, false, false],
    ['readonly with unavailable regular key', AccessLevels.Readonly, false, 'rKey', false, false],
    ['readonly with imported regular key', AccessLevels.Readonly, false, 'rKey', true, true],
])('%s', (_label, accessLevel, disabled, regularKey, imported, expected) => {
    const item = account({ accessLevel, regularKey, flags: { disableMasterKey: disabled } });
    jest.spyOn(AccountRepository, 'findAll').mockReturnValue([item] as any);
    jest.spyOn(AccountRepository, 'query').mockReturnValue({ isEmpty: () => !imported } as any);
    expect(AccountRepository.isSignable(item)).toBe(expected);
    expect(AccountRepository.getSpendableAccounts()).toEqual(expected ? [item] : []);
});

it('preserves balance and hidden-account filtering after eligibility is checked', () => {
    const visible = account();
    const hidden = account({ address: 'rHidden', hidden: true });
    const empty = account({ address: 'rEmpty', balance: 0 });
    const disabled = account({ address: 'rDisabled', flags: { disableMasterKey: true } });
    jest.spyOn(AccountRepository, 'findAll').mockReturnValue([visible, hidden, empty, disabled] as any);
    expect(AccountRepository.getSpendableAccounts()).toEqual([visible]);
    expect(AccountRepository.getSpendableAccounts(true)).toEqual([visible, hidden]);
});
