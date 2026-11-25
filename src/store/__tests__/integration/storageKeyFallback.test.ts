import { NativeModules } from 'react-native';

import DataStorage from '../../storage';

const { VaultManagerModule } = NativeModules;

// the key the datastore is made with (the default of the native mock) and one that does not open it
const RIGHT_KEY =
    '1567F58A794600717029077C34A8FAAB9B16B9FFAB174248DD296DA82084EE79' +
    '21E51DC5757CA655271AF4928263FEC4A36D2139AD02F9CB1BC70F8FD7D38796';
const STALE_KEY = 'AB'.repeat(64);
const OTHER_STALE_KEY = 'CD'.repeat(64);

describe('Storage', () => {
    describe('Second storage key in the keychain', () => {
        beforeAll(async () => {
            // a datastore made with the right key
            const storage = new DataStorage();
            await storage.initialize();
            storage.close();
        });

        afterEach(() => {
            VaultManagerModule.getStorageEncryptionKey.mockImplementation(() => Promise.resolve(RIGHT_KEY));
            delete VaultManagerModule.getStorageEncryptionKeyCandidates;
            delete VaultManagerModule.setAsideStaleSharedItems;
        });

        afterAll(() => {
            DataStorage.wipe();
        });

        it('fails as before when the platform has no other keys to offer', async () => {
            VaultManagerModule.getStorageEncryptionKey.mockImplementation(() => Promise.resolve(STALE_KEY));

            const storage = new DataStorage();
            await expect(storage.initialize()).rejects.toThrow('Realm file decryption failed');
            expect(storage.dataStore).toBeUndefined();
        });

        it('fails as before when no stored key opens the datastore', async () => {
            VaultManagerModule.getStorageEncryptionKey.mockImplementation(() => Promise.resolve(STALE_KEY));
            VaultManagerModule.getStorageEncryptionKeyCandidates = jest.fn(() =>
                Promise.resolve([STALE_KEY, OTHER_STALE_KEY, 'not-a-key']),
            );

            const storage = new DataStorage();
            await expect(storage.initialize()).rejects.toThrow('Realm file decryption failed');
            expect(VaultManagerModule.getStorageEncryptionKeyCandidates).toHaveBeenCalledTimes(1);
        });

        it('fails as before when the list of keys cannot be read', async () => {
            VaultManagerModule.getStorageEncryptionKey.mockImplementation(() => Promise.resolve(STALE_KEY));
            VaultManagerModule.getStorageEncryptionKeyCandidates = jest.fn(() => Promise.reject(new Error('-25308')));

            const storage = new DataStorage();
            await expect(storage.initialize()).rejects.toThrow('Realm file decryption failed');
        });

        it('does not ask for other keys when the first one opens the datastore', async () => {
            VaultManagerModule.getStorageEncryptionKeyCandidates = jest.fn(() => Promise.resolve([RIGHT_KEY]));

            const storage = new DataStorage();
            await storage.initialize();
            storage.close();

            expect(VaultManagerModule.getStorageEncryptionKeyCandidates).not.toHaveBeenCalled();
        });

        it('does not ask for other keys on an error that is not a decryption failure', async () => {
            VaultManagerModule.getStorageEncryptionKeyCandidates = jest.fn(() => Promise.resolve([RIGHT_KEY]));

            const storage = new DataStorage();
            const found = await storage.findOtherEncryptionKey(
                { path: 'xumm.realm', encryptionKey: Buffer.from(STALE_KEY, 'hex') },
                new Error('Encrypted interprocess sharing is currently unsupported'),
            );

            expect(found).toBeUndefined();
            expect(VaultManagerModule.getStorageEncryptionKeyCandidates).not.toHaveBeenCalled();
        });

        it('fails as before when the leftovers in the keychain cannot be set aside', async () => {
            VaultManagerModule.getStorageEncryptionKey.mockImplementation(() => Promise.resolve(STALE_KEY));
            VaultManagerModule.getStorageEncryptionKeyCandidates = jest.fn(() =>
                Promise.resolve([STALE_KEY, RIGHT_KEY]),
            );
            VaultManagerModule.setAsideStaleSharedItems = jest.fn(() => Promise.resolve(false));

            const storage = new DataStorage();
            await expect(storage.initialize()).rejects.toThrow('Realm file decryption failed');
            expect(VaultManagerModule.setAsideStaleSharedItems).toHaveBeenCalledTimes(1);
            expect(storage.dataStore).toBeUndefined();
        });

        it('fails as before when setting the leftovers aside throws', async () => {
            VaultManagerModule.getStorageEncryptionKey.mockImplementation(() => Promise.resolve(STALE_KEY));
            VaultManagerModule.getStorageEncryptionKeyCandidates = jest.fn(() =>
                Promise.resolve([STALE_KEY, RIGHT_KEY]),
            );
            VaultManagerModule.setAsideStaleSharedItems = jest.fn(() => Promise.reject(new Error('-25308')));

            const storage = new DataStorage();
            await expect(storage.initialize()).rejects.toThrow('Realm file decryption failed');
        });

        it('fails as before when the keychain still returns the stale key afterwards', async () => {
            VaultManagerModule.getStorageEncryptionKey.mockImplementation(() => Promise.resolve(STALE_KEY));
            VaultManagerModule.getStorageEncryptionKeyCandidates = jest.fn(() =>
                Promise.resolve([STALE_KEY, RIGHT_KEY]),
            );
            VaultManagerModule.setAsideStaleSharedItems = jest.fn(() => Promise.resolve(true));

            const storage = new DataStorage();
            await expect(storage.initialize()).rejects.toThrow('Realm file decryption failed');
            expect(storage.dataStore).toBeUndefined();
        });

        it('fails as before on a platform that cannot set the leftovers aside', async () => {
            VaultManagerModule.getStorageEncryptionKey.mockImplementation(() => Promise.resolve(STALE_KEY));
            VaultManagerModule.getStorageEncryptionKeyCandidates = jest.fn(() =>
                Promise.resolve([STALE_KEY, RIGHT_KEY]),
            );

            const storage = new DataStorage();
            await expect(storage.initialize()).rejects.toThrow('Realm file decryption failed');
        });

        it('sets the leftovers aside and opens the datastore with the key in use', async () => {
            // the keychain returns the stale key until its leftovers are set aside
            let settled = false;
            VaultManagerModule.getStorageEncryptionKey.mockImplementation(() =>
                Promise.resolve(settled ? RIGHT_KEY : STALE_KEY),
            );
            VaultManagerModule.getStorageEncryptionKeyCandidates = jest.fn(() =>
                Promise.resolve([STALE_KEY, RIGHT_KEY]),
            );
            VaultManagerModule.setAsideStaleSharedItems = jest.fn(() => {
                settled = true;
                return Promise.resolve(true);
            });

            const storage = new DataStorage();
            await storage.initialize();

            expect(VaultManagerModule.setAsideStaleSharedItems).toHaveBeenCalledTimes(1);
            expect(storage.dataStore).toBeDefined();
            expect(storage.dataStore?.isClosed).toBe(false);
            storage.close();

            // the next start needs no second key
            VaultManagerModule.getStorageEncryptionKeyCandidates.mockClear();
            const next = new DataStorage();
            await next.initialize();
            next.close();
            expect(VaultManagerModule.getStorageEncryptionKeyCandidates).not.toHaveBeenCalled();
        });
    });
});
