import fs from 'fs';
import os from 'os';
import path from 'path';
import Realm from 'realm';
import { NativeModules } from 'react-native';

import { Navigator } from '@common/helpers/navigator';
import CoreRepository from '@store/repositories/core';
import Localize from '@locale';
import AuthenticationService from '../AuthenticationService';

let realm: Realm;
let previousRealm: Realm;
let directory: string;
let settings: any;
const schema: Realm.ObjectSchema = {
    name: 'BruteForceFixture',
    properties: {
        passcode: 'string',
        passcodeFailedAttempts: 'int',
        lastPasscodeFailedTimestamp: 'double',
        lastUnlockedTimestamp: 'double',
        minutesAutoLock: 'int',
        purgeOnBruteForce: 'bool',
    },
};

beforeEach(() => {
    AuthenticationService.reinstate();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xaman-brute-force-'));
    realm = new Realm({
        path: path.join(directory, 'fixture.realm'), schema: [schema], encryptionKey: new Int8Array(64).fill(9),
    });
    realm.write(() => {
        settings = realm.create('BruteForceFixture', {
            passcode: 'hash', passcodeFailedAttempts: 0, lastPasscodeFailedTimestamp: 0,
            lastUnlockedTimestamp: 0, minutesAutoLock: 5, purgeOnBruteForce: true,
        });
    });
    previousRealm = CoreRepository.realm;
    CoreRepository.realm = realm;
    jest.spyOn(CoreRepository, 'getSettings').mockImplementation(() => settings);
    jest.spyOn(CoreRepository, 'hashPasscode').mockResolvedValue('wrong-hash');
    jest.spyOn(NativeModules.DeviceUtilsModule, 'getElapsedRealtime').mockResolvedValue('10000');
    jest.spyOn(Navigator, 'showAlertModal').mockImplementation(jest.fn());
    // Never execute a real wipe: observe only whether the production policy calls it.
    jest.spyOn(AuthenticationService, 'resetApp').mockResolvedValue(undefined);
});

afterEach(() => {
    AuthenticationService.reinstate();
    CoreRepository.realm = previousRealm;
    if (!realm.isClosed) realm.close();
    jest.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
});

it.each([0, 5, 8, 9, 10])('uses one committed attempt count after %s previous failures', async (previous) => {
    realm.write(() => { settings.passcodeFailedAttempts = previous; });
    await expect(AuthenticationService.authenticatePasscode('incorrect')).rejects.toThrow(
        Localize.t('global.invalidPasscode'),
    );
    expect(settings.passcodeFailedAttempts).toBe(previous + 1);
    expect(Navigator.showAlertModal).toHaveBeenCalledTimes(previous === 8 ? 1 : 0);
    expect(AuthenticationService.resetApp).toHaveBeenCalledTimes(previous >= 9 ? 1 : 0);
    if (previous === 8) {
        expect(Navigator.showAlertModal).toHaveBeenCalledWith(expect.objectContaining({
            text: Localize.t('global.autoWipeAlert', { times: 9 }),
        }));
    }
});

it('warns on the ninth failure and erases on the tenth, as specified in Settings', async () => {
    realm.write(() => { settings.passcodeFailedAttempts = 8; });
    await expect(AuthenticationService.authenticatePasscode('incorrect')).rejects.toThrow();
    expect(settings.passcodeFailedAttempts).toBe(9);
    expect(Navigator.showAlertModal).toHaveBeenCalledTimes(1);
    expect(AuthenticationService.resetApp).not.toHaveBeenCalled();
    (NativeModules.DeviceUtilsModule.getElapsedRealtime as jest.Mock).mockResolvedValue('13600');
    await expect(AuthenticationService.authenticatePasscode('incorrect')).rejects.toThrow();
    expect(settings.passcodeFailedAttempts).toBe(10);
    expect(AuthenticationService.resetApp).toHaveBeenCalledTimes(1);
});

it.each([8, 9, 10])('never warns or wipes with purge disabled after %s failures', async (previous) => {
    realm.write(() => { settings.passcodeFailedAttempts = previous; settings.purgeOnBruteForce = false; });
    await expect(AuthenticationService.authenticatePasscode('incorrect')).rejects.toThrow();
    expect(settings.passcodeFailedAttempts).toBe(previous + 1);
    expect(Navigator.showAlertModal).not.toHaveBeenCalled();
    expect(AuthenticationService.resetApp).not.toHaveBeenCalled();
});

it('does not warn or wipe if the attempt cannot be committed', async () => {
    realm.write(() => { settings.passcodeFailedAttempts = 9; });
    jest.spyOn(realm, 'write').mockImplementationOnce(() => { throw new Error('fixture disk failure'); });
    await expect(AuthenticationService.authenticatePasscode('incorrect')).rejects.toThrow('fixture disk failure');
    expect(settings.passcodeFailedAttempts).toBe(9);
    expect(Navigator.showAlertModal).not.toHaveBeenCalled();
    expect(AuthenticationService.resetApp).not.toHaveBeenCalled();
});
