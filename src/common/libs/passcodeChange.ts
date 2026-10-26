import Vault from '@common/libs/vault';
import CoreRepository from '@store/repositories/core';
import AccountRepository from '@store/repositories/account';
import { EncryptionLevels } from '@store/types';

export const PASSCODE_CHANGE_JOURNAL = 'xaman-passcode-change-v1';
const backupName = (name: string) => `${name}_PASSCODE_RECOVER`;

type Journal = { version: 1; oldKey: string; newKey: string; names: string[] };
type Dependencies = {
    vault: Pick<typeof Vault, 'exist' | 'open' | 'create' | 'purge' | 'reKeyBatch' | 'getStorageEncryptionKey'>;
    readHash: () => string;
    writeHash: (hash: string) => void;
    hash: (passcode: string) => Promise<string>;
    names: () => string[];
};

/** Settings are the commit record. Before commit, recovery restores the old key.
 * The journal is encrypted with the existing device-protected Realm key.
 * It must survive until all vaults agree with the committed settings hash. */
export const createPasscodeChange = ({ vault, readHash, writeHash, hash, names }: Dependencies) => {
    const cleanup = async (journal: Journal) => {
        for (const name of journal.names) {
            if (await vault.exist(backupName(name))) await vault.purge(backupName(name));
        }
        await vault.purge(PASSCODE_CHANGE_JOURNAL);
    };

    const restore = async (journal: Journal) => {
        const target = readHash();
        if (target !== journal.oldKey && target !== journal.newKey) throw new Error('Passcode recovery hash mismatch');
        for (const name of journal.names) {
            if (await vault.open(name, target)) continue;
            let clear: string | undefined;
            for (const candidate of [name, `${name}_RECOVER`, backupName(name)]) {
                if (!(await vault.exist(candidate))) continue;
                for (const key of [target, journal.oldKey, journal.newKey]) {
                    clear = await vault.open(candidate, key);
                    if (clear) break;
                }
                if (clear) break;
            }
            if (!clear) throw new Error('Unable to recover a passcode vault');
            // Keep an independently verified copy through purge/create failures.
            const backup = backupName(name);
            if (!(await vault.exist(backup))) await vault.create(backup, clear, target);
            if ((await vault.open(backup, target)) !== clear) {
                throw new Error('Unable to verify passcode recovery copy');
            }
            if (await vault.exist(name)) await vault.purge(name);
            await vault.create(name, clear, target);
            if ((await vault.open(name, target)) !== clear) throw new Error('Unable to verify restored passcode vault');
        }
        await cleanup(journal);
    };

    const recover = async () => {
        if (!(await vault.exist(PASSCODE_CHANGE_JOURNAL))) return;
        const storageKey = (await vault.getStorageEncryptionKey()).toString('hex');
        const data = await vault.open(PASSCODE_CHANGE_JOURNAL, storageKey);
        if (!data) throw new Error('Unable to read passcode recovery journal');
        const journal: Journal = JSON.parse(data);
        if (
            journal.version !== 1 ||
            !journal.oldKey ||
            !journal.newKey ||
            !Array.isArray(journal.names) ||
            journal.names.some((name) => typeof name !== 'string' || !name)
        ) {
            throw new Error('Invalid passcode recovery journal');
        }
        await restore(journal);
    };

    const change = async (passcode: string) => {
        await recover();
        const oldKey = readHash();
        const newKey = await hash(passcode);
        if (!oldKey || !newKey) throw new Error('Unable to store the passcode');
        if (oldKey === newKey) return;
        const journal: Journal = { version: 1, oldKey, newKey, names: [...new Set(names())] };
        const storageKey = (await vault.getStorageEncryptionKey()).toString('hex');
        await vault.create(PASSCODE_CHANGE_JOURNAL, JSON.stringify(journal), storageKey);
        // Native create verifies its write. No account/settings mutation precedes it.
        try {
            await vault.reKeyBatch(journal.names, oldKey, newKey);
            writeHash(newKey);
            if (readHash() !== newKey) throw new Error('Passcode commit did not persist');
        } catch (error) {
            // Failure to restore leaves the durable journal for the next launch/retry.
            const committed = readHash() === newKey;
            await restore(journal);
            if (!committed) throw error;
            return;
        }
        // A cleanup failure after commit is recoverable and must not report the new passcode as rejected.
        await cleanup(journal).catch(() => undefined);
    };
    return { change, recover };
};

const passcodeChange = createPasscodeChange({
    vault: Vault,
    readHash: () => CoreRepository.getSettings().passcode || '',
    writeHash: (hash) => CoreRepository.savePasscodeHash(hash),
    hash: (passcode) => CoreRepository.hashPasscode(passcode),
    names: () =>
        AccountRepository.findBy('encryptionLevel', EncryptionLevels.Passcode).map((account) => account.publicKey),
});
export const changePasscode = passcodeChange.change;
export const recoverPasscodeChange = passcodeChange.recover;
