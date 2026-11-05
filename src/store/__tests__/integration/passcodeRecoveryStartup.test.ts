import Storage from '../../storage';
import { recoverPasscodeChange } from '@common/libs/passcodeChange';
import { migrateDegenSecrets } from '@common/libs/degenSecrets';

jest.mock('@common/libs/passcodeChange', () => ({ recoverPasscodeChange: jest.fn() }));
jest.mock('@common/libs/degenSecrets', () => ({ migrateDegenSecrets: jest.fn() }));

it('recovers passcode vaults after repositories/settings exist and before initialize resolves', async () => {
    const storage = new Storage();
    const order: string[] = [];
    jest.spyOn(storage, 'getConfig').mockResolvedValue({});
    jest.spyOn(storage, 'runMigrations').mockResolvedValue(1);
    jest.spyOn(storage, 'open').mockResolvedValue({} as any);
    jest.spyOn(storage, 'initRepositories').mockImplementation(async () => { order.push('repositories'); });
    jest.spyOn(storage, 'populateDataStoreIfNeeded').mockImplementation(async () => { order.push('settings'); });
    (recoverPasscodeChange as jest.Mock).mockImplementation(async () => { order.push('recovery'); });
    (migrateDegenSecrets as jest.Mock).mockImplementation(async () => { order.push('degen'); });
    await storage.initialize();
    order.push('ready');
    // degen secrets move into the vault with the committed passcode, before the UI can read them
    expect(order).toEqual(['repositories', 'settings', 'recovery', 'degen', 'ready']);
    (recoverPasscodeChange as jest.Mock).mockRejectedValueOnce(new Error('recovery storage unavailable'));
    await expect(storage.initialize()).rejects.toThrow('recovery storage unavailable');
});
