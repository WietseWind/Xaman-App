import { NativeModules } from 'react-native';
import LoggerService from '@services/LoggerService';
import { getKeychainGroupInfo } from '../vaultInfo';

const { VaultManagerModule } = NativeModules;

describe('Vault info', () => {
    const lastLog = (text: string) =>
        LoggerService.getLogs()
            .filter((log) => log.message.includes(text))
            .pop();

    it('should return the groups and write them to the session log', async () => {
        const info = await getKeychainGroupInfo();

        expect(info).toEqual({
            sharedGroup: 'group.app.xaman',
            groups: { 'group.app.xaman': 3 },
            moved: 0,
            lastError: 0,
        });
        expect(lastLog('keychain access group')?.level).toBe('debug');
    });

    it('should warn when items are left in another group', async () => {
        VaultManagerModule.getKeychainGroupInfo.mockResolvedValueOnce({
            sharedGroup: 'group.app.xaman',
            groups: { 'group.app.xaman': 1, 'TEAM.com.xrpllabs.xumm': 2 },
            moved: 1,
            lastError: -34018,
        });

        const info = await getKeychainGroupInfo();

        expect(info?.groups['TEAM.com.xrpllabs.xumm']).toBe(2);
        expect(lastLog('NOT (ALL) IN THE SHARED ACCESS GROUP')?.level).toBe('warn');
    });

    it('should resolve undefined when the native method fails or is missing (Android)', async () => {
        VaultManagerModule.getKeychainGroupInfo.mockRejectedValueOnce(new Error('nope'));
        await expect(getKeychainGroupInfo()).resolves.toBeUndefined();

        const original = VaultManagerModule.getKeychainGroupInfo;
        VaultManagerModule.getKeychainGroupInfo = undefined;
        await expect(getKeychainGroupInfo()).resolves.toBeUndefined();
        VaultManagerModule.getKeychainGroupInfo = original;
    });
});
