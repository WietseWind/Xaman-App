/**
 * Vault
 *
 * Store Encrypt\Decrypt sensitive data in native keychain
 *
 */

import { NativeModules } from 'react-native';
import { HexEncoding } from '@common/utils/string';

import LoggerService from '@services/LoggerService';

/* Module ==================================================================== */
const { VaultManagerModule, UniqueIdProviderModule } = NativeModules;

/* Logger ==================================================================== */
const logger = LoggerService.createLogger('Vault');

/* Types ==================================================================== */
type OpenVaultResult = { clearText?: string; fallbackUsed?: boolean; storedDifferedFromLive?: boolean };

/* Helpers ==================================================================== */
const storageEncryptionKeyFromHex = (key: any): Buffer | undefined => {
    if (typeof key !== 'string' || key.length !== 128) {
        return undefined;
    }
    const keyBytes = HexEncoding.toBinary(key);
    return keyBytes && keyBytes.length === 64 ? keyBytes : undefined;
};

/* Lib ==================================================================== */
const Vault = {
    /**
     * get vault cipher latest version
     */
    getLatestCipherVersion: (): number => {
        return VaultManagerModule.latestCipherVersion;
    },

    /**
     * Generate/Store Vault
     */
    create: async (name: string, entry: string, key: string): Promise<boolean> => {
        return new Promise((resolve, reject) => {
            VaultManagerModule.createVault(name, entry, key)
                .then(resolve)
                .catch((error) => {
                    logger.error(`create [${name}]`, error);
                    reject(error);
                });
        });
    },

    /**
     *  Open Vault using provided key
     */
    open: async (name: string, key: string): Promise<string | undefined> => {
        return new Promise((resolve, reject) => {
            VaultManagerModule.openVault(name, key)
                .then((result: string | OpenVaultResult) => {
                    const clearText = typeof result === 'string' ? result : result?.clearText;
                    const fallbackUsed =
                        typeof result === 'object'
                            ? !!result?.fallbackUsed
                            : !!UniqueIdProviderModule?.consumeLastDeviceIdUnlockReport?.()?.fallbackUsed;
                    const storedDifferedFromLive =
                        typeof result === 'object' ? !!result?.storedDifferedFromLive : false;
                    // this should never happen, just double-checking
                    if (!clearText) {
                        reject(new Error('Vault open, received empty clear text!'));
                        return;
                    }
                    if (fallbackUsed) {
                        logger.warn(
                            'WARNING: LIVE DEVICE ID DID NOT DECRYPT. SIGNING SUCCEEDED WITH LAST STORED DEVICE ID.',
                            { vault: name, storedDifferedFromLive },
                        );
                    }
                    resolve(clearText);
                })
                .catch((error) => {
                    const code = typeof error?.code === 'string' ? error.code : '-1';
                    const message = error?.message ? String(error.message) : String(error);
                    if (code === 'DEVICE_ID_CHANGED') {
                        logger.error(
                            'WARNING: PASSPHRASE INVALID BECAUSE IT WAS ORIGINALLY CONFIGURED ON ANOTHER PHONE. ' +
                                'PLEASE REMOVE YOUR ACCOUNT AND IMPORT IT FROM SECRET AGAIN.',
                            { code, message, vault: name, deviceIdChanged: true },
                        );
                    } else if (code === 'VAULT_CORRUPT' || code === 'UNIQUE_ID_MISSING') {
                        logger.error(
                            'WARNING: VAULT DATA IS CORRUPT OR DEVICE ID IS MISSING. ' +
                                'PLEASE REMOVE YOUR ACCOUNT AND IMPORT IT FROM SECRET AGAIN.',
                            { code, message, vault: name },
                        );
                    } else {
                        logger.error(`open [${name}]`, { code, message, deviceIdChanged: false });
                    }
                    resolve(undefined);
                });
        });
    },

    /**
     *  Check key exist in vault
     */
    exist: async (name: string): Promise<boolean> => {
        return new Promise((resolve, reject) => {
            VaultManagerModule.vaultExist(name)
                .then(resolve)
                .catch((error) => {
                    logger.error(`exist [${name}]`, error);
                    reject(error);
                });
        });
    },

    /**
     * Check if storage encryption key exist in the keychain
     */
    isStorageEncryptionKeyExist: (): Promise<boolean> => {
        return new Promise((resolve, reject) => {
            VaultManagerModule.isStorageEncryptionKeyExist()
                .then(resolve)
                .catch((error) => {
                    logger.error('isStorageEncryptionKeyExist', error);
                    reject(error);
                });
        });
    },

    /**
     *  get storage encryption key from vault
     *  NOTE: this method will generate/store new encryption key if not exist
     */
    getStorageEncryptionKey: (): Promise<Buffer> => {
        return new Promise((resolve, reject) => {
            VaultManagerModule.getStorageEncryptionKey()
                .then((key: any) => {
                    if (!key || key.length !== 128) {
                        reject(new Error('Encryption key size is wrong or not present!'));
                        return;
                    }

                    // encryption key presents as hex string, convert to buffer
                    const keyBytes = HexEncoding.toBinary(key);
                    // check if we got the right bytes
                    if (!keyBytes || keyBytes.length !== 64) {
                        reject(new Error('Encryption key size is wrong!'));
                        return;
                    }

                    resolve(keyBytes);
                })
                .catch((error) => {
                    const code = typeof error?.code === 'string' ? error.code : '-1';
                    const message = error?.message ? String(error.message) : String(error);
                    if (code === 'KEYSTORE_UNRECOVERABLE' || code === 'KEYSTORE_DECRYPT') {
                        logger.error(
                            'WARNING: REALM KEYSTORE WRAP IS UNREADABLE. STORAGE CANNOT OPEN. ' +
                                'PLEASE REMOVE YOUR ACCOUNT AND IMPORT IT FROM SECRET AGAIN.',
                            { code, message },
                        );
                    } else {
                        logger.error('getStorageEncryptionKey', { code, message });
                    }
                    reject(error);
                });
        });
    },

    /**
     * Every storage encryption key in the keychain, the one getStorageEncryptionKey returns first (iOS).
     *
     * There is more than one only when a version without the shared keychain group (5.3.0 and older)
     * was installed after a version with it: that version can't see the shared group, deleting the app
     * keeps its keychain items, so it stored a key of its own next to the earlier one.
     * Never creates a key, never rejects: without an answer the list is empty.
     */
    getStorageEncryptionKeyCandidates: async (): Promise<Buffer[]> => {
        const nativeCandidates = VaultManagerModule?.getStorageEncryptionKeyCandidates;
        if (typeof nativeCandidates !== 'function') {
            return [];
        }

        try {
            const keys = await nativeCandidates.call(VaultManagerModule);
            if (!Array.isArray(keys)) {
                return [];
            }
            return keys.map(storageEncryptionKeyFromHex).filter((key): key is Buffer => !!key);
        } catch (error: any) {
            const code = typeof error?.code === 'string' ? error.code : '-1';
            logger.error('getStorageEncryptionKeyCandidates', { code });
            return [];
        }
    },

    /**
     * iOS: the caller has proven that a storage key other than the first one opens the datastore.
     * The keychain then holds what an earlier install left in the shared group next to the items in use
     * (storage key and device id): give those leftovers another name, so the items in use are the only
     * ones with their name. Nothing is deleted.
     * Resolves true when the keychain is left with one storage key and one device id; never rejects.
     */
    setAsideStaleKeychainItems: async (): Promise<boolean> => {
        const nativeSetAside = VaultManagerModule?.setAsideStaleSharedItems;
        if (typeof nativeSetAside !== 'function') {
            return false;
        }

        try {
            return (await nativeSetAside.call(VaultManagerModule)) === true;
        } catch (error: any) {
            const code = typeof error?.code === 'string' ? error.code : '-1';
            logger.error('setAsideStaleKeychainItems', { code });
            return false;
        }
    },

    /**
     *  check if vault needs migration
     */
    isMigrationRequired: (
        name: string,
    ): Promise<{
        vault: string;
        current_cipher_version: number;
        latest_cipher_version: number;
        migration_required: boolean;
    }> => {
        return new Promise((resolve, reject) => {
            VaultManagerModule.isMigrationRequired(name)
                .then(resolve)
                .catch((error) => {
                    logger.error(`isMigrationRequired [${name}]`, error);
                    reject(error);
                });
        });
    },

    /**
     *  reKey the vault content
     */
    reKey: async (name: string, oldKey: string, newKey: string): Promise<boolean> => {
        return new Promise((resolve, reject) => {
            VaultManagerModule.reKeyVault(name, oldKey, newKey)
                .then(resolve)
                .catch((error) => {
                    logger.error(`reKey [${name}]`, error);
                    reject(error);
                });
        });
    },

    /**
     *  reKey the vault content
     */
    reKeyBatch: async (names: string[], oldKey: string, newKey: string): Promise<boolean> => {
        return new Promise((resolve, reject) => {
            VaultManagerModule.reKeyBatchVaults(names, oldKey, newKey)
                .then(resolve)
                .catch((error) => {
                    logger.error('reKeyBatch', error);
                    reject(error);
                });
        });
    },

    // Delete Vault & PrivateKey from keychain
    purge: (name: string): Promise<boolean> => {
        return new Promise((resolve, reject) => {
            VaultManagerModule.purgeVault(name)
                .then(resolve)
                .catch((error) => {
                    logger.error(`purge [${name}]`, error);
                    reject(error);
                });
        });
    },

    /**
     * Probe Realm wrap vs account-vault wrap vs device-id cache.
     * Android only. Does not need the passphrase.
     */
    inspectHealth: async (): Promise<Record<string, unknown> | undefined> => {
        if (typeof VaultManagerModule.inspectVaultHealth !== 'function') {
            return undefined;
        }
        try {
            if (typeof UniqueIdProviderModule?.backfillLastKnownFromReadableUniqueId === 'function') {
                UniqueIdProviderModule.backfillLastKnownFromReadableUniqueId();
            }
            const report = await VaultManagerModule.inspectVaultHealth();
            logger.debug('vault health', report);
            if (
                report?.uniqueIdKeychainReadable === false &&
                report?.vaultsPresent > 0 &&
                !report?.lastKnownPresent
            ) {
                logger.error(
                    'WARNING: DEVICE-UNIQUE-ID KEYCHAIN UNREADABLE AND NO LAST STORED DEVICE ID. ' +
                        'ACCOUNT VAULTS MAY NOT DECRYPT AFTER ANDROID_ID CHANGE.',
                    report,
                );
            } else if (report?.uniqueIdKeychainReadable === false && report?.lastKnownPresent) {
                logger.warn(
                    'WARNING: DEVICE-UNIQUE-ID KEYCHAIN UNREADABLE. USING LAST STORED DEVICE ID.',
                    report,
                );
            } else if (report?.lastKnownPresent && report?.lastKnownMatchesLive === false) {
                logger.warn('WARNING: LIVE DEVICE ID DIFFERS FROM LAST STORED DEVICE ID.', report);
            } else if (
                report?.uniqueIdKeychainReadable === false &&
                report?.lastKnownPresent === false
            ) {
                logger.warn(
                    'WARNING: NO STORED DEVICE ID. CANNOT DETECT ANDROID_ID CHANGE. ' +
                        'SIGNING MAY FAIL AFTER DEVICE CHANGE.',
                    report,
                );
            }
            return report;
        } catch (error) {
            logger.error('inspectHealth', error);
            return undefined;
        }
    },

    // Purge All vaults in the keychain
    clearStorage: (): Promise<boolean> => {
        return new Promise((resolve, reject) => {
            VaultManagerModule.clearStorage()
                .then(resolve)
                .catch((error) => {
                    logger.error('clearStorage', error);
                    reject(error);
                });
        });
    },

    /**
     * User wipe. Clears keychain (and on Android Realm files + last-known id)
     * even when the Keystore wrap is unreadable.
     */
    wipeLocalDatastore: (): Promise<boolean> => {
        return new Promise((resolve, reject) => {
            const nativeWipe = VaultManagerModule.wipeLocalDatastore;
            const run =
                typeof nativeWipe === 'function'
                    ? nativeWipe.call(VaultManagerModule)
                    : VaultManagerModule.clearStorage();
            Promise.resolve(run)
                .then(() => resolve(true))
                .catch((error) => {
                    logger.error('wipeLocalDatastore', error);
                    reject(error);
                });
        });
    },
};

export default Vault;
