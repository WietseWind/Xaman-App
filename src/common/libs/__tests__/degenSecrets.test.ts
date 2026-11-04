import { generate } from 'xrpl-accountlib';

import { createDegenSecrets, DegenRegistry } from '../degenSecrets';
import { createPasscodeChange } from '../passcodeChange';
import { DEGEN_DONE, DEGEN_FLAG, degenVaultName } from '@common/utils/degenSecret';

jest.mock('@store/repositories/core', () => ({ __esModule: true, default: {} }));
jest.mock('@store/repositories/account', () => ({ __esModule: true, default: {} }));

type Account = { address: string; publicKey: string; additionalInfoString?: string };

const STORAGE_KEY = 'storage-key-hex';

const newDegenAccount = () => {
    const generated = generate.secretNumbers();
    return {
        rows: generated.secret.secretNumbers!,
        account: { address: generated.address!, publicKey: generated.keypair.publicKey! },
    };
};

const legacyRecord = (rows: string[]) => JSON.stringify({ degenMode: rows.join('.') });

const setup = (accountList: Account[] = [], storageKey = STORAGE_KEY) => {
    const blobs = new Map<string, { data: string; key: string }>();
    const calls: string[] = [];
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
            calls.push(`create:${name}`);
            blobs.set(name, { data, key });
            return true;
        }),
        purge: jest.fn(async (name: string) => {
            blobs.delete(name);
            return true;
        }),
    };
    const registered: string[] = [];
    const registry: DegenRegistry & { list: jest.Mock; add: jest.Mock; remove: jest.Mock } = {
        list: jest.fn(async () => [...registered]),
        add: jest.fn(async (name: string) => {
            calls.push(`register:${name}`);
            if (!registered.includes(name)) registered.push(name);
        }),
        remove: jest.fn(async (name: string) => {
            const index = registered.indexOf(name);
            if (index >= 0) registered.splice(index, 1);
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
        encryptionKey: async () => storageKey,
        registry,
        accounts: () => accounts.map((account) => ({ ...account })),
        setAdditionalInfo,
        onError,
    });
    const removeAccount = (address: string) => {
        accounts.splice(
            accounts.findIndex((item) => item.address === address),
            1,
        );
    };
    return { blobs, calls, vault, registry, registered, accounts, setAdditionalInfo, onError, service, removeAccount };
};

describe('degen secrets: new accounts', () => {
    it('stores the secret numbers with the storage key, registered first and verified', async () => {
        const { rows, account } = newDegenAccount();
        const { blobs, calls, registered, vault, service } = setup();
        const name = degenVaultName(account.publicKey);
        await service.store(account.publicKey, rows);
        expect(blobs.get(name)).toEqual({ data: rows.join('.'), key: STORAGE_KEY });
        expect(calls).toEqual([`register:${name}`, `create:${name}`]);
        expect(registered).toEqual([name]);
        expect(vault.open).toHaveBeenLastCalledWith(name, STORAGE_KEY);
    });

    it('keeps an existing entry with the same numbers, replaces one with other content', async () => {
        const { rows, account } = newDegenAccount();
        const { blobs, vault, service } = setup();
        const name = degenVaultName(account.publicKey);
        blobs.set(name, { data: rows.join('.'), key: STORAGE_KEY });
        await service.store(account.publicKey, rows);
        expect(vault.create).not.toHaveBeenCalled();

        blobs.set(name, { data: 'other', key: 'another-key' });
        await service.store(account.publicKey, rows);
        expect(blobs.get(name)).toEqual({ data: rows.join('.'), key: STORAGE_KEY });
    });

    it('fails when the vault copy does not read back the same', async () => {
        const { rows, account } = newDegenAccount();
        const { vault, service } = setup();
        vault.open.mockResolvedValue('something else');
        await expect(service.store(account.publicKey, rows)).rejects.toThrow('Unable to verify');
    });

    it('refuses incomplete numbers and a missing storage key', async () => {
        const { rows, account } = newDegenAccount();
        await expect(setup().service.store(account.publicKey, [])).rejects.toThrow('incomplete');
        await expect(setup().service.store(account.publicKey, [...rows.slice(1), ''])).rejects.toThrow('incomplete');
        await expect(setup([], '').service.store(account.publicKey, rows)).rejects.toThrow('key is missing');
    });

    it('refuses to write an entry it could not register', async () => {
        const { rows, account } = newDegenAccount();
        const { blobs, registry, service } = setup();
        registry.add.mockRejectedValueOnce(new Error('preferences unavailable'));
        await expect(service.store(account.publicKey, rows)).rejects.toThrow('preferences unavailable');
        expect(blobs.size).toBe(0);
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

    it('forgets the numbers after the backup: flag first, then the entry and its registration', async () => {
        const { rows, account } = newDegenAccount();
        const { blobs, registered, accounts, service } = setup([{ ...account, additionalInfoString: DEGEN_FLAG }]);
        await service.store(account.publicKey, rows);
        await service.forget(account);
        expect(accounts[0].additionalInfoString).toBe(DEGEN_DONE);
        expect(blobs.has(degenVaultName(account.publicKey))).toBe(false);
        expect(registered).toEqual([]);
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
        const { blobs, registered, vault, onError, service } = setup([
            { ...account, additionalInfoString: DEGEN_FLAG },
        ]);
        await service.store(account.publicKey, rows);
        vault.purge.mockRejectedValueOnce(new Error('keychain busy'));
        await service.forget(account);
        expect(onError).toHaveBeenCalledWith('Degen secret purge', expect.any(Error));
        expect(blobs.has(degenVaultName(account.publicKey))).toBe(true);

        await service.migrate();
        expect(blobs.has(degenVaultName(account.publicKey))).toBe(false);
        expect(registered).toEqual([]);
    });
});

describe('degen secrets: removal cleanup (review #459, finding 1)', () => {
    it('removes the entry on the next start when its purge failed during account removal', async () => {
        const { rows, account } = newDegenAccount();
        const { blobs, registered, service, removeAccount } = setup([
            { ...account, additionalInfoString: DEGEN_FLAG },
        ]);
        await service.store(account.publicKey, rows);

        // account removal: the purge of the entry fails, the account record is deleted anyway
        removeAccount(account.address);
        expect(blobs.has(degenVaultName(account.publicKey))).toBe(true);

        // restart
        await service.migrate();
        expect(blobs.has(degenVaultName(account.publicKey))).toBe(false);
        expect(registered).toEqual([]);
    });

    it('removes the entry of an account that an older version removed', async () => {
        const { rows, account } = newDegenAccount();
        const other = newDegenAccount();
        const { blobs, service, removeAccount } = setup([
            { ...account, additionalInfoString: DEGEN_FLAG },
            { ...other.account, additionalInfoString: DEGEN_FLAG },
        ]);
        await service.store(account.publicKey, rows);
        await service.store(other.account.publicKey, other.rows);
        // an older version removes the account record and its private key, not the numbers
        removeAccount(account.address);

        await service.migrate();
        expect(blobs.has(degenVaultName(account.publicKey))).toBe(false);
        // the other account keeps its numbers
        expect(await service.read({ ...other.account, additionalInfoString: DEGEN_FLAG })).toEqual(other.rows);
    });

    it('keeps a registered entry while the cleanup itself fails, and retries', async () => {
        const { rows, account } = newDegenAccount();
        const { blobs, registered, vault, onError, service, removeAccount } = setup([
            { ...account, additionalInfoString: DEGEN_FLAG },
        ]);
        await service.store(account.publicKey, rows);
        removeAccount(account.address);
        vault.purge.mockRejectedValueOnce(new Error('keychain busy'));

        await service.migrate();
        expect(onError).toHaveBeenCalledWith('Degen secret cleanup', expect.any(Error));
        expect(registered).toEqual([degenVaultName(account.publicKey)]);

        await service.migrate();
        expect(blobs.has(degenVaultName(account.publicKey))).toBe(false);
        expect(registered).toEqual([]);
    });
});

describe('degen secrets: passcode changes and downgrades (review #459, finding 2)', () => {
    it('stays readable after a passcode change that knows nothing about it (older version)', async () => {
        const { rows, account } = newDegenAccount();
        const { blobs, vault, accounts, service } = setup([{ ...account, additionalInfoString: legacyRecord(rows) }]);
        // the primary private key, passcode encrypted
        blobs.set(account.publicKey, { data: 'private-key', key: 'old-hash' });

        // this version migrates, then an older version (passcode change re-keys primary keys only)
        await service.migrate();
        let hash = 'old-hash';
        const change = createPasscodeChange({
            vault: {
                ...vault,
                getStorageEncryptionKey: jest.fn(async () => Buffer.from(STORAGE_KEY)),
                reKeyBatch: jest.fn(async (names: string[], oldKey: string, newKey: string) => {
                    names.forEach((name) => {
                        const item = blobs.get(name)!;
                        if (item.key !== oldKey) throw new Error('bad old key');
                        blobs.set(name, { ...item, key: newKey });
                    });
                    return true;
                }),
            },
            readHash: () => hash,
            writeHash: (next) => {
                hash = next;
            },
            hash: async () => 'new-hash',
            names: () => [account.publicKey],
        });
        await change.change('222222');
        expect(await vault.open(account.publicKey, 'new-hash')).toBe('private-key');

        // back on this version
        await service.migrate();
        expect(await service.read(accounts[0])).toEqual(rows);
    });
});

describe('degen secrets: startup migration of older records', () => {
    it('moves plaintext numbers into the vault, then replaces them with the flag', async () => {
        const { rows, account } = newDegenAccount();
        const { blobs, accounts, setAdditionalInfo, vault, service } = setup([
            { ...account, additionalInfoString: legacyRecord(rows) },
        ]);
        await service.migrate();
        expect(blobs.get(degenVaultName(account.publicKey))).toEqual({ data: rows.join('.'), key: STORAGE_KEY });
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

    it('finishes a migration interrupted after the vault write, without touching the entry', async () => {
        const { rows, account } = newDegenAccount();
        const { blobs, accounts, vault, setAdditionalInfo, service } = setup([
            { ...account, additionalInfoString: legacyRecord(rows) },
        ]);
        // first start: the entry is written, the record update fails
        setAdditionalInfo.mockRejectedValueOnce(new Error('killed'));
        await service.migrate();
        expect(blobs.has(degenVaultName(account.publicKey))).toBe(true);
        expect(accounts[0].additionalInfoString).toBe(legacyRecord(rows));

        // next start: the cleanup kept the entry, the record gets its flag, no second write
        await service.migrate();
        expect(vault.create).toHaveBeenCalledTimes(1);
        expect(accounts[0].additionalInfoString).toBe(DEGEN_FLAG);
        expect(await service.read(accounts[0])).toEqual(rows);
    });

    it('handles every account on its own, and leaves other accounts alone', async () => {
        const first = newDegenAccount();
        const second = newDegenAccount();
        const plain = newDegenAccount();
        const tangem = newDegenAccount();
        const { accounts, vault, service } = setup([
            { ...first.account, additionalInfoString: legacyRecord(first.rows) },
            { ...second.account, additionalInfoString: legacyRecord(second.rows) },
            { ...plain.account },
            { ...tangem.account, additionalInfoString: JSON.stringify({ cardId: 'CB79000000018201' }) },
        ]);
        vault.create.mockRejectedValueOnce(new Error('keychain unavailable'));

        await service.migrate();

        expect(accounts[0].additionalInfoString).toBe(legacyRecord(first.rows));
        expect(accounts[1].additionalInfoString).toBe(DEGEN_FLAG);
        expect(accounts[2].additionalInfoString).toBeUndefined();
        expect(accounts[3].additionalInfoString).toBe(JSON.stringify({ cardId: 'CB79000000018201' }));
        const touched = vault.exist.mock.calls.map(([name]) => name);
        expect(touched).not.toContain(degenVaultName(plain.account.publicKey));
        expect(touched).not.toContain(degenVaultName(tangem.account.publicKey));
    });

    it('never throws, also when the accounts or the registry cannot be read', async () => {
        const onError = jest.fn();
        const service = createDegenSecrets({
            vault: { exist: jest.fn(), open: jest.fn(), create: jest.fn(), purge: jest.fn() },
            encryptionKey: async () => STORAGE_KEY,
            registry: {
                list: jest.fn(async () => {
                    throw new Error('preferences unavailable');
                }),
                add: jest.fn(),
                remove: jest.fn(),
            },
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
