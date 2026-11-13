/**
 * Vault info
 *
 * Where the vault's keychain items are (iOS): access group names and item counts only,
 * never item names or item data.
 */

import { NativeModules } from 'react-native';

import LoggerService from '@services/LoggerService';

/* Module ==================================================================== */
const { VaultManagerModule } = NativeModules;

/* Logger ==================================================================== */
const logger = LoggerService.createLogger('Vault');

/* Types ==================================================================== */
export interface KeychainGroupInfo {
    // the access group the items belong in
    sharedGroup: string;
    // item count per access group
    groups: Record<string, number>;
    // items moved to the shared group since the app started
    moved: number;
    // last OSStatus of a failed move, 0 when none
    lastError: number;
}

/* Lib ==================================================================== */
/**
 * The access groups the app's keychain items are in, with the item count per group.
 * Written to the session log on every call. Resolves undefined on Android and on failure.
 */
const getKeychainGroupInfo = async (): Promise<KeychainGroupInfo | undefined> => {
    if (typeof VaultManagerModule?.getKeychainGroupInfo !== 'function') {
        return undefined;
    }

    try {
        const report = await VaultManagerModule.getKeychainGroupInfo();

        const info: KeychainGroupInfo = {
            sharedGroup: String(report?.sharedGroup ?? ''),
            groups: {},
            moved: Number(report?.moved) || 0,
            lastError: Number(report?.lastError) || 0,
        };
        Object.keys(report?.groups ?? {}).forEach((group) => {
            info.groups[group] = Number(report.groups[group]) || 0;
        });

        const elsewhere = Object.keys(info.groups).filter((group) => group !== info.sharedGroup);
        if (info.lastError !== 0 || elsewhere.length > 0) {
            logger.warn('WARNING: KEYCHAIN ITEMS NOT (ALL) IN THE SHARED ACCESS GROUP.', info);
        } else {
            logger.debug('keychain access group', info);
        }

        return info;
    } catch (error) {
        logger.error('getKeychainGroupInfo', error);
        return undefined;
    }
};

/* Export ==================================================================== */
export { getKeychainGroupInfo };
