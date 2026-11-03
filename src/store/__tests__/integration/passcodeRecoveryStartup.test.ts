import Storage from '../../storage';
import { recoverPasscodeChange } from '@common/libs/passcodeChange';

jest.mock('@common/libs/passcodeChange', () => ({ recoverPasscodeChange: jest.fn() }));

it('recovers passcode vaults after repositories/settings exist and before initialize resolves', async () => {
    const storage = new Storage();
    const order: string[] = [];
    jest.spyOn(storage, 'getConfig').mockResolvedValue({});
    jest.spyOn(storage, 'runMigrations').mockResolvedValue(1);
    jest.spyOn(storage, 'open').mockResolvedValue({} as any);
    jest.spyOn(storage, 'initRepositories').mockImplementation(async () => { order.push('repositories'); });
    jest.spyOn(storage, 'populateDataStoreIfNeeded').mockImplementation(async () => { order.push('settings'); });
    (recoverPasscodeChange as jest.Mock).mockImplementation(async () => { order.push('recovery'); });
    await storage.initialize();
    order.push('ready');
    expect(order).toEqual(['repositories', 'settings', 'recovery', 'ready']);
    (recoverPasscodeChange as jest.Mock).mockRejectedValueOnce(new Error('recovery storage unavailable'));
    await expect(storage.initialize()).rejects.toThrow('recovery storage unavailable');
});
