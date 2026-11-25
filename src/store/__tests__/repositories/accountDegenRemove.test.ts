import { generate } from 'xrpl-accountlib';

import Vault from '@common/libs/vault';
import { createDegenSecrets } from '@common/libs/degenSecrets';
import { DEGEN_FLAG, degenVaultName } from '@common/utils/degenSecret';
import { AccessLevels, EncryptionLevels } from '@store/types';

import AccountRepository from '../../repositories/account';

jest.mock('@common/libs/vault', () => ({
    __esModule: true,
    default: { exist: jest.fn(), open: jest.fn(), create: jest.fn(), purge: jest.fn() },
}));

const blobs = new Map<string, { data: string; key: string }>();
const vault = jest.mocked(Vault);

beforeEach(() => {
    blobs.clear();
    vault.exist.mockImplementation(async (name: string) => blobs.has(name));
    vault.open.mockImplementation(async (name: string, key: string) => {
        const item = blobs.get(name);
        return item?.key === key ? item.data : undefined;
    });
    vault.create.mockImplementation(async (name: string, data: string, key: string) => {
        if (blobs.has(name)) throw new Error('VAULT_ALREADY_EXIST');
        blobs.set(name, { data, key });
        return true;
    });
    vault.purge.mockImplementation(async (name: string) => {
        blobs.delete(name);
        return true;
    });
});

afterEach(() => jest.restoreAllMocks());

it('cleans up the secret numbers of a removed account after a restart when their purge failed', async () => {
    const generated = generate.secretNumbers();
    const publicKey = generated.keypair.publicKey!;
    const account: any = {
        address: generated.address,
        publicKey,
        accessLevel: AccessLevels.Full,
        encryptionLevel: EncryptionLevels.Passcode,
        additionalInfoString: DEGEN_FLAG,
        lines: [],
    };
    let accounts: any[] = [account];
    const registered: string[] = [];
    const secrets = createDegenSecrets({
        vault,
        encryptionKey: async () => 'storage-key',
        registry: {
            list: async () => [...registered],
            add: async (name) => {
                if (!registered.includes(name)) registered.push(name);
            },
            remove: async (name) => {
                if (registered.includes(name)) registered.splice(registered.indexOf(name), 1);
            },
        },
        accounts: () =>
            accounts.map(({ address, additionalInfoString }) => ({ address, publicKey, additionalInfoString })),
        setAdditionalInfo: jest.fn(),
        onError: jest.fn(),
    });

    blobs.set(publicKey, { data: 'private-key', key: 'passcode-hash' });
    await secrets.store(publicKey, generated.secret.secretNumbers!);

    // account removal with the actual repository; only the purge of the secret numbers fails
    vault.purge.mockImplementation(async (name: string) => {
        if (name === degenVaultName(publicKey)) throw new Error('keychain busy');
        blobs.delete(name);
        return true;
    });
    jest.spyOn(AccountRepository, 'delete').mockImplementation(async (object: any) => {
        accounts = accounts.filter((item) => item !== object);
    });
    jest.spyOn(AccountRepository, 'emit').mockReturnValue(true);

    await expect(AccountRepository.purge(account)).resolves.toBe(true);
    expect(accounts).toEqual([]);
    expect(blobs.has(publicKey)).toBe(false);
    expect(blobs.has(degenVaultName(publicKey))).toBe(true);

    // restart, the keychain works again
    vault.purge.mockImplementation(async (name: string) => {
        blobs.delete(name);
        return true;
    });
    await secrets.migrate();
    expect(blobs.has(degenVaultName(publicKey))).toBe(false);
    expect(registered).toEqual([]);
});
