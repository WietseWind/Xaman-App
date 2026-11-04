import { generate } from 'xrpl-accountlib';

import { createDegenSecrets } from '../degenSecrets';
import { DEGEN_DONE, DEGEN_FLAG, degenVaultName } from '@common/utils/degenSecret';

jest.mock('@store/repositories/core', () => ({ __esModule: true, default: {} }));
jest.mock('@store/repositories/account', () => ({ __esModule: true, default: {} }));

type Account = { address: string; publicKey: string; additionalInfoString?: string };

const newDegenAccount = () => {
    const generated = generate.secretNumbers();
    return {
        rows: generated.secret.secretNumbers!,
        account: { address: generated.address!, publicKey: generated.keypair.publicKey! },
    };
};

const legacyRecord = (rows: string[]) => JSON.stringify({ degenMode: rows.join('.') });

const setup = (accountList: Account[] = [], passcode = 'passcode-hash') => {
    const blobs = new Map<string, { data: string; key: string }>();
    const vault = {
        exist: jest.fn(async (name: string) => blobs.has(name)),
        // like the JS vault wrapper: undefined when it can't open
        open: jest.fn(async (name: string, key: string) => {
            const item = blobs.get(name);
            return item?.key === key ? item.data : undefined;
        }),
        // like iOS: never overwrites
        create: jest.fn(async (name: string, data: string, key: string) => {
            if (blobs.has(name)) throw new Error('VAULT_ALREADY_EXIST');
            blobs.set(name, { data, key });
            return true;
        }),
        purge: jest.fn(async (name: string) => {
            blobs.delete(name);
            return true;
        }),
    };
    const accounts = accountList.map((account) => ({ ...account }));
    const setAdditionalInfo = jest.fn(async (address: string, additionalInfoString: string) => {
        const account = accounts.find((item) => item.address === address);
        if (!account) throw new Error('no such account');
        account.additionalInfoString = additionalInfoString;
    });
    const onError = jest.fn();
    const service = createDegenSecrets({
        vault,
        passcodeHash: () => passcode,
        accounts: () => accounts.map((account) => ({ ...account })),
        setAdditionalInfo,
        onError,
    });
    return { blobs, vault, accounts, setAdditionalInfo, onError, service };
};

describe('degen secrets: new accounts', () => {
    it('stores the secret numbers in the vault with the passcode key, verified', async () => {
        const { rows, account } = newDegenAccount();
        const { blobs, vault, service } = setup();
        await service.store(account.publicKey, rows);
        expect(blobs.get(degenVaultName(account.publicKey))).toEqual({ data: rows.join('.'), key: 'passcode-hash' });
        expect(vault.open).toHaveBeenLastCalledWith(degenVaultName(account.publicKey), 'passcode-hash');
    });

    it('keeps an existing entry with the same numbers, replaces one with other content', async () => {
        const { rows, account } = newDegenAccount();
        const { blobs, vault, service } = setup();
        const name = degenVaultName(account.publicKey);
        blobs.set(name, { data: rows.join('.'), key: 'passcode-hash' });
        await service.store(account.publicKey, rows);
        expect(vault.create).not.toHaveBeenCalled();

        blobs.set(name, { data: 'other', key: 'old-passcode-hash' });
        await service.store(account.publicKey, rows);
        expect(blobs.get(name)).toEqual({ data: rows.join('.'), key: 'passcode-hash' });
    });

    it('fails when the vault copy does not read back the same', async () => {
        const { rows, account } = newDegenAccount();
        const { vault, service } = setup();
        vault.open.mockResolvedValue('something else');
        await expect(service.store(account.publicKey, rows)).rejects.toThrow('Unable to verify');
    });

    it('refuses incomplete numbers and a missing passcode', async () => {
        const { rows, account } = newDegenAccount();
        await expect(setup().service.store(account.publicKey, [])).rejects.toThrow('incomplete');
        await expect(setup().service.store(account.publicKey, [...rows.slice(1), ''])).rejects.toThrow('incomplete');
        await expect(setup([], '').service.store(account.publicKey, rows)).rejects.toThrow('Passcode is not set');
    });
});

describe('degen secrets: reading and backing up', () => {
    it('reads the numbers from the vault, and from a record written by an older version', async () => {
        const { rows, account } = newDegenAccount();
        const { service } = setup();
        await service.store(account.publicKey, rows);
        expect(await service.read({ ...account, additionalInfoString: DEGEN_FLAG })).toEqual(rows);
        expect(await service.read({ ...account, additionalInfoString: legacyRecord(rows) })).toEqual(rows);
        expect(await service.read({ ...account, additionalInfoString: DEGEN_DONE })).toBeUndefined();
        expect(await service.read({ ...account })).toBeUndefined();
    });

    it('fails loudly when the flagged vault entry is missing', async () => {
        const { account } = newDegenAccount();
        const { service } = setup();
        await expect(service.read({ ...account, additionalInfoString: DEGEN_FLAG })).rejects.toThrow(
            'Unable to open',
        );
    });

    it('forgets the numbers after the backup: flag first, then the vault entry', async () => {
        const { rows, account } = newDegenAccount();
        const { blobs, accounts, service } = setup([{ ...account, additionalInfoString: DEGEN_FLAG }]);
        await service.store(account.publicKey, rows);
        await service.forget(account);
        expect(accounts[0].additionalInfoString).toBe(DEGEN_DONE);
        expect(blobs.has(degenVaultName(account.publicKey))).toBe(false);
    });

    it('keeps the numbers when the record cannot be updated, so the banner still works', async () => {
        const { rows, account } = newDegenAccount();
        const { blobs, setAdditionalInfo, service } = setup([{ ...account, additionalInfoString: DEGEN_FLAG }]);
        await service.store(account.publicKey, rows);
        setAdditionalInfo.mockRejectedValueOnce(new Error('realm write failed'));
        await expect(service.forget(account)).rejects.toThrow('realm write failed');
        expect(blobs.has(degenVaultName(account.publicKey))).toBe(true);
    });

    it('treats a failed purge after the backup as done, and the next start removes the entry', async () => {
        const { rows, account } = newDegenAccount();
        const { blobs, vault, onError, service } = setup([{ ...account, additionalInfoString: DEGEN_FLAG }]);
        await service.store(account.publicKey, rows);
        vault.purge.mockRejectedValueOnce(new Error('keychain busy'));
        await service.forget(account);
        expect(onError).toHaveBeenCalledWith('Degen secret purge', expect.any(Error));
        expect(blobs.has(degenVaultName(account.publicKey))).toBe(true);

        await service.migrate();
        expect(blobs.has(degenVaultName(account.publicKey))).toBe(false);
    });
});

describe('degen secrets: startup migration of older records', () => {
    it('moves plaintext numbers into the vault, then replaces them with the flag', async () => {
        const { rows, account } = newDegenAccount();
        const { blobs, accounts, setAdditionalInfo, vault, service } = setup([
            { ...account, additionalInfoString: legacyRecord(rows) },
        ]);
        await service.migrate();
        expect(blobs.get(degenVaultName(account.publicKey))).toEqual({ data: rows.join('.'), key: 'passcode-hash' });
        expect(accounts[0].additionalInfoString).toBe(DEGEN_FLAG);
        // the record changes only after the vault copy read back the same
        const recordWrite = setAdditionalInfo.mock.invocationCallOrder[0];
        expect(Math.max(...vault.open.mock.invocationCallOrder)).toBeLessThan(recordWrite);
        expect(await service.read(accounts[0])).toEqual(rows);
    });

    it('keeps the plaintext record when the vault fails, and retries on the next start', async () => {
        const { rows, account } = newDegenAccount();
        const { accounts, vault, onError, service } = setup([{ ...account, additionalInfoString: legacyRecord(rows) }]);
        vault.create.mockRejectedValueOnce(new Error('keychain unavailable'));
        await service.migrate();
        expect(accounts[0].additionalInfoString).toBe(legacyRecord(rows));
        expect(onError).toHaveBeenCalledWith('Degen secret migration', expect.any(Error));
        // the banner still has the numbers
        expect(await service.read(accounts[0])).toEqual(rows);

        await service.migrate();
        expect(accounts[0].additionalInfoString).toBe(DEGEN_FLAG);
        expect(await service.read(accounts[0])).toEqual(rows);
    });

    it('keeps the plaintext record when the vault copy does not verify', async () => {
        const { rows, account } = newDegenAccount();
        const { accounts, vault, service } = setup([{ ...account, additionalInfoString: legacyRecord(rows) }]);
        vault.open.mockImplementation(async () => 'corrupted');
        await service.migrate();
        expect(accounts[0].additionalInfoString).toBe(legacyRecord(rows));
    });

    it('finishes a migration interrupted after the vault write', async () => {
        const { rows, account } = newDegenAccount();
        const { blobs, accounts, vault, service } = setup([{ ...account, additionalInfoString: legacyRecord(rows) }]);
        blobs.set(degenVaultName(account.publicKey), { data: rows.join('.'), key: 'passcode-hash' });
        await service.migrate();
        expect(vault.create).not.toHaveBeenCalled();
        expect(accounts[0].additionalInfoString).toBe(DEGEN_FLAG);
    });

    it('keeps the plaintext record without a passcode', async () => {
        const { rows, account } = newDegenAccount();
        const { accounts, onError, service } = setup([{ ...account, additionalInfoString: legacyRecord(rows) }], '');
        await service.migrate();
        expect(accounts[0].additionalInfoString).toBe(legacyRecord(rows));
        expect(onError).toHaveBeenCalled();
    });

    it('handles every account on its own, and leaves other accounts alone', async () => {
        const first = newDegenAccount();
        const second = newDegenAccount();
        const migrated = newDegenAccount();
        const plain = newDegenAccount();
        const tangem = newDegenAccount();
        const { blobs, accounts, vault, service } = setup([
            { ...first.account, additionalInfoString: legacyRecord(first.rows) },
            { ...second.account, additionalInfoString: legacyRecord(second.rows) },
            { ...migrated.account, additionalInfoString: DEGEN_FLAG },
            { ...plain.account },
            { ...tangem.account, additionalInfoString: JSON.stringify({ cardId: 'CB79000000018201' }) },
        ]);
        blobs.set(degenVaultName(migrated.account.publicKey), { data: migrated.rows.join('.'), key: 'passcode-hash' });
        vault.create.mockRejectedValueOnce(new Error('keychain unavailable'));

        await service.migrate();

        expect(accounts[0].additionalInfoString).toBe(legacyRecord(first.rows));
        expect(accounts[1].additionalInfoString).toBe(DEGEN_FLAG);
        expect(accounts[2].additionalInfoString).toBe(DEGEN_FLAG);
        expect(accounts[3].additionalInfoString).toBeUndefined();
        expect(accounts[4].additionalInfoString).toBe(JSON.stringify({ cardId: 'CB79000000018201' }));
        expect(blobs.get(degenVaultName(migrated.account.publicKey))!.data).toBe(migrated.rows.join('.'));
        const touched = vault.exist.mock.calls.map(([name]) => name);
        expect(touched).not.toContain(degenVaultName(plain.account.publicKey));
        expect(touched).not.toContain(degenVaultName(tangem.account.publicKey));
    });

    it('never throws, also when the accounts cannot be listed', async () => {
        const onError = jest.fn();
        const service = createDegenSecrets({
            vault: { exist: jest.fn(), open: jest.fn(), create: jest.fn(), purge: jest.fn() },
            passcodeHash: () => 'passcode-hash',
            accounts: () => {
                throw new Error('storage not ready');
            },
            setAdditionalInfo: jest.fn(),
            onError,
        });
        await expect(service.migrate()).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Degen secret migration', expect.any(Error));
    });

    it('never reports the secret numbers', async () => {
        const { rows, account } = newDegenAccount();
        const { vault, onError, service } = setup([{ ...account, additionalInfoString: legacyRecord(rows) }]);
        // a vault copy that doesn't verify, then a vault that fails
        vault.open.mockImplementation(async () => 'corrupted');
        await service.migrate();
        vault.open.mockReset();
        vault.create.mockRejectedValueOnce(new Error('keychain unavailable'));
        await service.migrate();
        expect(onError).toHaveBeenCalledTimes(2);
        const reported = JSON.stringify(onError.mock.calls.map(([context, error]) => [context, String(error)]));
        rows.forEach((row) => expect(reported).not.toContain(row));
    });
});

describe('degen secrets: passcode change', () => {
    it('lists the vault entries of flagged accounts that exist', async () => {
        const stored = newDegenAccount();
        const missing = newDegenAccount();
        const legacy = newDegenAccount();
        const { service } = setup([
            { ...stored.account, additionalInfoString: DEGEN_FLAG },
            { ...missing.account, additionalInfoString: DEGEN_FLAG },
            { ...legacy.account, additionalInfoString: legacyRecord(legacy.rows) },
        ]);
        await service.store(stored.account.publicKey, stored.rows);
        expect(await service.vaultNames()).toEqual([degenVaultName(stored.account.publicKey)]);
    });
});
