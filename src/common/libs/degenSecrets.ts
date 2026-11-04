/**
 * Secret numbers of degen mode ("Fast onboarding (risky)") accounts.
 *
 * Until the user backs them up from the red banner on Home, the secret numbers are kept in the vault
 * next to the account's private key, encrypted with the passcode, under degenVaultName(publicKey).
 * The account record only carries DEGEN_FLAG. A passcode change re-keys these entries too (see
 * passcodeChange). Older versions kept the numbers in plaintext in the account record; migrate()
 * moves them into the vault on startup, and removes them from the record only after the vault copy
 * reads back the same.
 *
 * Never log or report the secret numbers.
 */

import Vault from '@common/libs/vault';

import CoreRepository from '@store/repositories/core';
import AccountRepository from '@store/repositories/account';

import LoggerService from '@services/LoggerService';

import { DEGEN_DONE, DEGEN_FLAG, degenVaultName, getDegenInfo } from '@common/utils/degenSecret';

/* Types ==================================================================== */
type DegenAccount = { address: string; publicKey: string; additionalInfoString?: string };

type Dependencies = {
    vault: Pick<typeof Vault, 'exist' | 'open' | 'create' | 'purge'>;
    // the stored passcode hash, which also encrypts passcode-level private keys
    passcodeHash: () => string;
    accounts: () => DegenAccount[];
    setAdditionalInfo: (address: string, additionalInfoString: string) => Promise<unknown>;
    onError: (context: string, error: unknown) => void;
};

const SEPARATOR = '.';

/* Lib ==================================================================== */
export const createDegenSecrets = ({ vault, passcodeHash, accounts, setAdditionalInfo, onError }: Dependencies) => {
    const requireKey = (): string => {
        const key = passcodeHash();
        if (!key) {
            throw new Error('Passcode is not set');
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

        const key = requireKey();
        const name = degenVaultName(publicKey);
        const data = secretNumbers.join(SEPARATOR);

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
     * Remove the vault entry, for an account that was never created.
     */
    const discard = async (publicKey: string): Promise<void> => {
        const name = degenVaultName(publicKey);
        if (await vault.exist(name)) {
            await vault.purge(name);
        }
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
            const data = await vault.open(degenVaultName(account.publicKey), requireKey());
            if (!data) {
                throw new Error('Unable to open the degen secret vault');
            }
            return data.split(SEPARATOR);
        }

        return undefined;
    };

    /**
     * The secret numbers are backed up: drop the flag (the banner goes away), then the vault entry.
     * A failed purge is retried by migrate() on the next start.
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
     * Startup: move secret numbers kept in plaintext by older versions into the vault, and remove the
     * vault entries of backups whose purge failed. Never throws: a failed account keeps its record
     * as it is and is retried on the next start.
     */
    const migrate = async (): Promise<void> => {
        let list: DegenAccount[];
        try {
            list = accounts();
        } catch (error) {
            onError('Degen secret migration', error);
            return;
        }

        for (const account of list) {
            try {
                const info = getDegenInfo(account.additionalInfoString);
                if (info.kind === 'legacy') {
                    await store(account.publicKey, info.secretNumbers.split(SEPARATOR));
                    await setAdditionalInfo(account.address, DEGEN_FLAG);
                } else if (account.additionalInfoString === DEGEN_DONE) {
                    await discard(account.publicKey);
                }
            } catch (error) {
                onError('Degen secret migration', error);
            }
        }
    };

    /**
     * The vault entries a passcode change must re-key.
     */
    const vaultNames = async (): Promise<string[]> => {
        const names: string[] = [];
        for (const account of accounts()) {
            if (getDegenInfo(account.additionalInfoString).kind === 'vault') {
                const name = degenVaultName(account.publicKey);
                if (await vault.exist(name)) {
                    names.push(name);
                }
            }
        }
        return names;
    };

    return { store, discard, read, forget, migrate, vaultNames };
};

/* Export ==================================================================== */
const DegenSecrets = createDegenSecrets({
    vault: Vault,
    passcodeHash: () => CoreRepository.getSettings()?.passcode || '',
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
