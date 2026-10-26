import fs from 'fs';
import os from 'os';
import path from 'path';
import Realm from 'realm';
import CoreRepository from '../../repositories/core';

const schema: Realm.ObjectSchema = {
    name: 'AuthenticationFixture',
    properties: {
        passcodeFailedAttempts: 'int',
        lastPasscodeFailedTimestamp: 'double',
        lastUnlockedTimestamp: 'double',
    },
};
const key = new Int8Array(64).fill(7);
let realm: Realm;
let directory: string;
let previousRealm: Realm;
let event: jest.SpyInstance;

beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xaman-auth-state-'));
    realm = new Realm({ path: path.join(directory, 'fixture.realm'), schema: [schema], encryptionKey: key });
    realm.write(() => realm.create('AuthenticationFixture', {
        passcodeFailedAttempts: 2, lastPasscodeFailedTimestamp: 100, lastUnlockedTimestamp: 0,
    }));
    previousRealm = CoreRepository.realm;
    CoreRepository.realm = realm;
    jest.spyOn(CoreRepository, 'getSettings').mockImplementation(() =>
        realm.objects('AuthenticationFixture')[0] as any,
    );
    event = jest.spyOn(CoreRepository, 'emit');
});

afterEach(() => {
    CoreRepository.realm = previousRealm;
    if (!realm.isClosed) realm.close();
    jest.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
});

it('commits encrypted settings before notifying listeners and survives reopening', () => {
    const listener = () => expect(realm.isInTransaction).toBe(false);
    CoreRepository.on('updateSettings', listener);
    try {
        CoreRepository.saveAuthenticationSettings({
            passcodeFailedAttempts: 0, lastPasscodeFailedTimestamp: 0, lastUnlockedTimestamp: 200,
        });
    } finally {
        CoreRepository.off('updateSettings', listener);
    }
    realm.close();
    realm = new Realm({ path: path.join(directory, 'fixture.realm'), schema: [schema], encryptionKey: key });
    expect(realm.objects<any>('AuthenticationFixture')[0].lastUnlockedTimestamp).toBe(200);
    expect(realm.objects<any>('AuthenticationFixture')[0].passcodeFailedAttempts).toBe(0);
    expect(event).toHaveBeenCalledTimes(1);
});

it('rejects an overlapping write instead of deferring an unacknowledged counter update', () => {
    realm.write(() => {
        expect(() => CoreRepository.saveAuthenticationSettings({ passcodeFailedAttempts: 3 })).toThrow();
    });
    expect(realm.objects<any>('AuthenticationFixture')[0].passcodeFailedAttempts).toBe(2);
    expect(event).not.toHaveBeenCalled();
});

it('propagates a failed commit and does not emit success', () => {
    jest.spyOn(realm, 'write').mockImplementationOnce(() => { throw new Error('fixture disk failure'); });
    expect(() => CoreRepository.saveAuthenticationSettings({
        lastUnlockedTimestamp: 200,
    })).toThrow('fixture disk failure');
    expect(realm.objects<any>('AuthenticationFixture')[0].lastUnlockedTimestamp).toBe(0);
    expect(event).not.toHaveBeenCalled();
});

it('rejects missing settings without claiming success', () => {
    (CoreRepository.getSettings as jest.Mock).mockReturnValue(undefined);
    expect(() => CoreRepository.saveAuthenticationSettings({ lastUnlockedTimestamp: 200 })).toThrow('unavailable');
    expect(event).not.toHaveBeenCalled();
});
