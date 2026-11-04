/**
 * Secret numbers of degen mode ("Fast onboarding (risky)") accounts.
 *
 * Until the user backs them up from the red banner on Home, the secret numbers are kept in the vault
 * under degenVaultName(publicKey). The account record only carries DEGEN_FLAG.
 *
 * Key: the storage encryption key (the key of the app database, held by the keychain / keystore),
 * not the passcode. The passcode hash that encrypts passcode-level private keys is itself stored in
 * that database, so it would protect the numbers no better, and the storage key never changes with
 * the passcode: a passcode change in any version, also an older one after a downgrade, can't make the
 * numbers unreadable, and nothing needs re-keying.
 *
 * Cleanup: every entry is added to a registry (preferences, outside the keychain) before it is
 * written. On startup, migrate() removes registered entries whose account is gone or backed up, so a
 * purge that failed during account removal, or an account removed by an older version, never leaves
 * the numbers behind.
 *
 * Older versions kept the numbers in plaintext in the account record; migrate() moves them into the
 * vault on startup, and removes them from the record only after the vault copy reads back the same.
 *
 * Never log or report the secret numbers.
 */

import Vault from '@common/libs/vault';
import Preferences from '@common/libs/preferences';

import AccountRepository from '@store/repositories/account';

import LoggerService from '@services/LoggerService';

import { DEGEN_DONE, DEGEN_FLAG, degenVaultName, getDegenInfo } from '@common/utils/degenSecret';

/* Types ==================================================================== */
type DegenAccount = { address: string; publicKey: string; additionalInfoString?: string };

export type DegenRegistry = {
    list: () => Promise<string[]>;
    add: (name: string) => Promise<void>;
    remove: (name: string) => Promise<void>;
};

type Dependencies = {
    vault: Pick<typeof Vault, 'exist' | 'open' | 'create' | 'purge'>;
    // the storage encryption key, as hex
    encryptionKey: () => Promise<string>;
    registry: DegenRegistry;
    accounts: () => DegenAccount[];
    setAdditionalInfo: (address: string, additionalInfoString: string) => Promise<unknown>;
    onError: (context: string, error: unknown) => void;
};

const SEPARATOR = '.';

/* Lib ==================================================================== */
export const createDegenSecrets = ({
    vault,
    encryptionKey,
    registry,
    accounts,
    setAdditionalInfo,
    onError,
}: Dependencies) => {
    const requireKey = async (): Promise<string> => {
        const key = await encryptionKey();
        if (!key) {
            throw new Error('Storage encryption key is missing');
        }
        return key;
    };

    /**
     * Keep the secret numbers in the vault, verified by reading them back.
     * An existing entry with the same numbers is kept (retry after an interrupted migration).
     */
    const store = async (publicKey: string, secretNumbers: string[]): Promise<void> => {
        if (!publicKey || !secretNumbers?.length || secretNumbers.some((row) => !row)) {
            throw new Error('Degen secret numbers are incomplete');
        }

        const key = await requireKey();
        const name = degenVaultName(publicKey);
        const data = secretNumbers.join(SEPARATOR);

        // registered before it exists, so startup can always find it again
        await registry.add(name);

        if (await vault.exist(name)) {
            if ((await vault.open(name, key)) === data) {
                return;
            }
            await vault.purge(name);
        }

        await vault.create(name, data, key);

        if ((await vault.open(name, key)) !== data) {
            throw new Error('Unable to verify the degen secret vault');
        }
    };

    /**
     * Remove the vault entry, then its registration.
     */
    const discard = async (publicKey: string): Promise<void> => {
        const name = degenVaultName(publicKey);
        if (await vault.exist(name)) {
            await vault.purge(name);
        }
        await registry.remove(name);
    };

    /**
     * The secret numbers of a degen account that is not backed up yet, else undefined.
     */
    const read = async (account: DegenAccount): Promise<string[] | undefined> => {
        const info = getDegenInfo(account.additionalInfoString);

        if (info.kind === 'legacy') {
            return info.secretNumbers.split(SEPARATOR);
        }

        if (info.kind === 'vault') {
            const data = await vault.open(degenVaultName(account.publicKey), await requireKey());
            if (!data) {
                throw new Error('Unable to open the degen secret vault');
            }
            return data.split(SEPARATOR);
        }

        return undefined;
    };

    /**
     * The secret numbers are backed up: drop the flag (the banner goes away), then the vault entry.
     * A failed purge stays registered and is retried by migrate() on the next start.
     */
    const forget = async (account: Pick<DegenAccount, 'address' | 'publicKey'>): Promise<void> => {
        await setAdditionalInfo(account.address, DEGEN_DONE);

        try {
            await discard(account.publicKey);
        } catch (error) {
            onError('Degen secret purge', error);
        }
    };

    /**
     * Remove registered entries that no account needs any more: the account is gone (removed, also
     * by an older version) or backed up.
     */
    const cleanUp = async (list: DegenAccount[]): Promise<void> => {
        const needed = new Set(
            list
                .filter((account) => getDegenInfo(account.additionalInfoString).kind !== 'none')
                .map((account) => degenVaultName(account.publicKey)),
        );

        for (const name of await registry.list()) {
            if (!needed.has(name)) {
                try {
                    if (await vault.exist(name)) {
                        await vault.purge(name);
                    }
                    await registry.remove(name);
                } catch (error) {
                    onError('Degen secret cleanup', error);
                }
            }
        }
    };

    /**
     * Startup: move secret numbers kept in plaintext by older versions into the vault, then clean up.
     * Never throws: what fails keeps its state and is retried on the next start.
     */
    const migrate = async (): Promise<void> => {
        try {
            for (const account of accounts()) {
                try {
                    const info = getDegenInfo(account.additionalInfoString);
                    if (info.kind === 'legacy') {
                        await store(account.publicKey, info.secretNumbers.split(SEPARATOR));
                        await setAdditionalInfo(account.address, DEGEN_FLAG);
                    }
                } catch (error) {
                    onError('Degen secret migration', error);
                }
            }

            await cleanUp(accounts());
        } catch (error) {
            onError('Degen secret migration', error);
        }
    };

    return { store, discard, read, forget, migrate };
};

/* Registry ==================================================================== */
const readRegistry = async (): Promise<string[]> => {
    const stored = await Preferences.get(Preferences.keys.DEGEN_VAULTS);
    if (!stored) {
        return [];
    }
    const list = JSON.parse(stored);
    return Array.isArray(list) ? list.filter((name) => typeof name === 'string' && name) : [];
};

const PreferencesRegistry: DegenRegistry = {
    list: readRegistry,
    add: async (name) => {
        const list = await readRegistry();
        if (!list.includes(name)) {
            await Preferences.set(Preferences.keys.DEGEN_VAULTS, JSON.stringify([...list, name]));
        }
    },
    remove: async (name) => {
        const list = await readRegistry();
        if (list.includes(name)) {
            await Preferences.set(
                Preferences.keys.DEGEN_VAULTS,
                JSON.stringify(list.filter((item) => item !== name)),
            );
        }
    },
};

/* Export ==================================================================== */
const DegenSecrets = createDegenSecrets({
    vault: Vault,
    encryptionKey: async () => (await Vault.getStorageEncryptionKey()).toString('hex'),
    registry: PreferencesRegistry,
    // plain copies: migrate() writes to the records while it walks the list
    accounts: () =>
        Array.from(AccountRepository.findAll()).map(({ address, publicKey, additionalInfoString }) => ({
            address,
            publicKey,
            additionalInfoString,
        })),
    setAdditionalInfo: (address, additionalInfoString) => AccountRepository.update({ address, additionalInfoString }),
    onError: (context, error) => LoggerService.recordError(context, error),
});

export const migrateDegenSecrets = DegenSecrets.migrate;

export default DegenSecrets;
