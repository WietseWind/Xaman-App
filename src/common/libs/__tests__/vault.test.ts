/* eslint-disable max-len */
/* eslint-disable operator-linebreak */

import { NativeModules } from 'react-native';
import LoggerService from '@services/LoggerService';
import Vault from '../vault';

const { VaultManagerModule } = NativeModules;

describe('Vault', () => {
    const name = 'vaultName';
    const entry = 'mySecret';
    const key = 'myPassphrase';

    describe('Create', () => {
        it('should call createVault method on VaultModule', async () => {
            await Vault.create(name, entry, key).then(() => {
                expect(VaultManagerModule.createVault).toHaveBeenCalled();
            });
        });
    });

    describe('Open', () => {
        it('should call openVault method on VaultModule', async () => {
            await Vault.open(name, key).then(() => {
                expect(VaultManagerModule.openVault).toHaveBeenCalled();
            });
        });

        it('should resolve undefined and keep native reason out of the return value', async () => {
            VaultManagerModule.openVault.mockRejectedValueOnce({
                code: 'DEVICE_ID_CHANGED',
                message:
                    'CipherV2AesGcm decryption failed after 2 device id(s); last stored device id does not match current device id (possible data migration to another device); underlying=WRONG_PASSPHRASE',
            });

            await expect(Vault.open(name, key)).resolves.toBeUndefined();

            const sessionLog = LoggerService.getLogs().find(
                (entry) =>
                    entry.level === 'error' &&
                    entry.message.includes('ORIGINALLY CONFIGURED ON ANOTHER PHONE'),
            );
            expect(sessionLog).toBeDefined();
        });
    });

    describe('Purge', () => {
        it('should call purgeVault method on VaultModule', async () => {
            await Vault.purge(name).then(() => {
                expect(VaultManagerModule.purgeVault).toHaveBeenCalled();
            });
        });
    });
});
