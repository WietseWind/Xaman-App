import { NativeModules } from 'react-native';
import CoreRepository from '@store/repositories/core';
import AuthenticationService from '../AuthenticationService';

const block = (settings: any, now: number) => (AuthenticationService as any).getInputBlockTime(settings, now);
const policies = [[6, 60], [7, 300], [8, 900], [9, 3600], [10, 7200], [11, 7200]];

beforeEach(() => {
    AuthenticationService.reinstate();
    jest.spyOn(CoreRepository, 'saveAuthenticationSettings').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

it.each(policies)('keeps the full policy duration at attempt %s', async (attempts, seconds) => {
    const settings = { passcodeFailedAttempts: attempts, lastPasscodeFailedTimestamp: 1000 };
    expect(await block(settings, 1000)).toBe(seconds / 60);
});

it.each(policies.flatMap(([attempts, seconds]) =>
    [60, 59, 1, 0.01, 0, -1].map(remaining => [attempts, seconds, remaining]),
))('attempt %s / delay %s remains blocked with %s seconds remaining', async (attempts, seconds, remaining) => {
    const settings = { passcodeFailedAttempts: attempts, lastPasscodeFailedTimestamp: 1000 };
    expect(await block(settings, 1000 + seconds - remaining)).toBe(remaining > 0 ? Math.ceil(remaining / 60) : 0);
});

it('does not impose a delay for the first five failed attempts', async () => {
    expect(await block({ passcodeFailedAttempts: 5, lastPasscodeFailedTimestamp: 1000 }, 1000)).toBe(0);
});

it.each(policies)('restarts and enforces the full delay after a reboot at attempt %s', async (attempts, seconds) => {
    const settings = { passcodeFailedAttempts: attempts, lastPasscodeFailedTimestamp: 1000 };
    expect(await block(settings, 10)).toBe(seconds / 60);
    expect(CoreRepository.saveAuthenticationSettings).toHaveBeenCalledWith({ lastPasscodeFailedTimestamp: 10 });
    settings.lastPasscodeFailedTimestamp = 10;
    expect(await block(settings, 10 + seconds - 1)).toBe(1);
    expect(await block(settings, 10 + seconds)).toBe(0);
});

it.each([undefined, null, NaN, -1])('starts a full delay when the stored timestamp is %p', async (timestamp) => {
    expect(await block({ passcodeFailedAttempts: 6, lastPasscodeFailedTimestamp: timestamp }, 20)).toBe(1);
    expect(CoreRepository.saveAuthenticationSettings).toHaveBeenCalledWith({ lastPasscodeFailedTimestamp: 20 });
});

it('prevents even the correct passcode from reaching hashing until the cooldown expires', async () => {
    const settings = { passcode: 'hash', passcodeFailedAttempts: 6, lastPasscodeFailedTimestamp: 1000 };
    jest.spyOn(CoreRepository, 'getSettings').mockReturnValue(settings as any);
    jest.spyOn(CoreRepository, 'hashPasscode').mockResolvedValue('hash');
    jest.spyOn(AuthenticationService, 'runAfterSuccessAuth').mockImplementation(() => {});
    jest.spyOn(NativeModules.DeviceUtilsModule, 'getElapsedRealtime').mockResolvedValue('1059');

    await expect(AuthenticationService.authenticatePasscode('correct')).rejects.toThrow();
    expect(CoreRepository.hashPasscode).not.toHaveBeenCalled();
    expect(CoreRepository.saveAuthenticationSettings).not.toHaveBeenCalled();

    (NativeModules.DeviceUtilsModule.getElapsedRealtime as jest.Mock).mockResolvedValue('1060');
    await expect(AuthenticationService.authenticatePasscode('correct')).resolves.toBe('hash');
    expect(CoreRepository.hashPasscode).toHaveBeenCalledTimes(1);
});
