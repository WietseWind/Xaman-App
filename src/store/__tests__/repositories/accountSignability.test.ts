import AccountRepository from '../../repositories/account';
import { AccessLevels, AccountTypes, EncryptionLevels } from '@store/types';
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

it.each([
    [AccountTypes.Regular, AccessLevels.Full, true],
    [AccountTypes.Tangem, AccessLevels.Full, true],
    [AccountTypes.Regular, AccessLevels.Readonly, false],
    [AccountTypes.Tangem, AccessLevels.Readonly, false],
])('uses an imported %s regular key with %s access', (type, accessLevel, expected) => {
    const owner = account({ regularKey: 'rKey', flags: { disableMasterKey: true } });
    const key = account({
        address: 'rKey', type, accessLevel, balance: 0,
        encryptionLevel: type === AccountTypes.Tangem ? EncryptionLevels.Physical : EncryptionLevels.Passcode,
        flags: { disableMasterKey: true },
    });
    const imported = [owner, key];
    jest.spyOn(AccountRepository, 'findAll').mockReturnValue(imported as any);
    jest.spyOn(AccountRepository, 'query').mockImplementation((criteria: any) => ({
        isEmpty: () => !imported.some((item: any) =>
            Object.entries(criteria).every(([field, value]) => item[field] === value)),
    }) as any);
    // A regular key needs neither its own balance nor its own enabled master key.
    expect(AccountRepository.isSignable(owner)).toBe(expected);
    expect(AccountRepository.getSpendableAccounts()).toEqual(expected ? [owner] : []);
});
