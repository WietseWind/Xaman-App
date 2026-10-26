import { NativeModules } from 'react-native';

import { AppScreens } from '@common/constants';
import { Navigator } from '@common/helpers/navigator';
import { Biometric } from '@common/libs/biometric';
import CoreRepository from '@store/repositories/core';
import AppService, { AppStateStatus } from '../AppService';
import AuthenticationService, { LockStatus } from '../AuthenticationService';

let settings: any;
const status = () => (AuthenticationService as any).lockStatus;

beforeEach(() => {
    AuthenticationService.reinstate();
    settings = {
        passcode: 'hash',
        passcodeFailedAttempts: 0,
        lastPasscodeFailedTimestamp: 0,
        lastUnlockedTimestamp: 0,
        minutesAutoLock: 5,
        purgeOnBruteForce: false,
    };
    jest.spyOn(CoreRepository, 'getSettings').mockImplementation(() => settings);
    jest.spyOn(CoreRepository, 'saveAuthenticationSettings').mockImplementation((changes) => {
        Object.assign(settings, changes);
    });
    jest.spyOn(CoreRepository, 'hashPasscode').mockImplementation(async (passcode) =>
        passcode === 'correct' ? 'hash' : 'wrong-hash',
    );
    jest.spyOn(NativeModules.DeviceUtilsModule, 'getElapsedRealtime').mockResolvedValue('1000');
    jest.spyOn(Navigator, 'showOverlay').mockResolvedValue(AppScreens.Overlay.Lock);
    jest.spyOn(AuthenticationService, 'runAfterSuccessAuth').mockImplementation(() => {});
    AppService.currentAppState = AppStateStatus.Active;
});

afterEach(() => {
    AuthenticationService.reinstate();
    jest.restoreAllMocks();
});

const lock = async () => {
    await AuthenticationService.checkLockScreen();
    expect(status()).toBe(LockStatus.LOCKED);
};

it.each(['native rejection', 'negative clock', 'malformed clock'])(
    'rejects passcode authentication and remains locked on %s',
    async (failure) => {
        await lock();
        if (failure === 'native rejection') {
            (NativeModules.DeviceUtilsModule.getElapsedRealtime as jest.Mock).mockRejectedValue(
                new Error('native rejected'),
            );
        } else {
            (NativeModules.DeviceUtilsModule.getElapsedRealtime as jest.Mock).mockResolvedValue(
                failure === 'negative clock' ? '-1' : 'invalid',
            );
        }
        await expect(AuthenticationService.authenticatePasscode('correct')).rejects.toThrow();
        expect(CoreRepository.hashPasscode).not.toHaveBeenCalled();
        expect(status()).toBe(LockStatus.LOCKED);
        expect(AuthenticationService.runAfterSuccessAuth).not.toHaveBeenCalled();
    },
);

it('propagates settings-read and hash failures without granting access', async () => {
    await lock();
    (CoreRepository.getSettings as jest.Mock).mockImplementationOnce(() => {
        throw new Error('settings unavailable');
    });
    await expect(AuthenticationService.authenticatePasscode('correct')).rejects.toThrow('settings unavailable');
    (CoreRepository.hashPasscode as jest.Mock).mockRejectedValueOnce(new Error('hash failed'));
    await expect(AuthenticationService.authenticatePasscode('correct')).rejects.toThrow('hash failed');
    expect(status()).toBe(LockStatus.LOCKED);
});

it.each(['correct', 'incorrect'])('propagates counter storage failure for %s passcodes', async (passcode) => {
    await lock();
    (CoreRepository.saveAuthenticationSettings as jest.Mock).mockImplementationOnce(() => {
        throw new Error('counter storage failed');
    });
    await expect(AuthenticationService.authenticatePasscode(passcode)).rejects.toThrow('counter storage failed');
    expect(status()).toBe(LockStatus.LOCKED);
    expect(AuthenticationService.runAfterSuccessAuth).not.toHaveBeenCalled();
});

it('does not hash a passcode if the reboot cooldown timestamp cannot be committed', async () => {
    await lock();
    settings.passcodeFailedAttempts = 6;
    settings.lastPasscodeFailedTimestamp = 2000;
    (CoreRepository.saveAuthenticationSettings as jest.Mock).mockImplementationOnce(() => {
        throw new Error('reboot timestamp failed');
    });
    await expect(AuthenticationService.authenticatePasscode('correct')).rejects.toThrow('reboot timestamp failed');
    expect(CoreRepository.hashPasscode).not.toHaveBeenCalled();
});

it('persists successful-auth counters before emitting unlocked', async () => {
    await lock();
    settings.passcodeFailedAttempts = 2;
    const seen: any[] = [];
    const listener = (value: LockStatus) => {
        if (value === LockStatus.UNLOCKED) seen.push({ ...settings });
    };
    AuthenticationService.on('lockStateChange', listener);
    try {
        await expect(AuthenticationService.authenticatePasscode('correct')).resolves.toBe('hash');
        expect(seen).toEqual([expect.objectContaining({
            passcodeFailedAttempts: 0, lastPasscodeFailedTimestamp: 0, lastUnlockedTimestamp: 1000,
        })]);
    } finally {
        AuthenticationService.off('lockStateChange', listener);
    }
});

it('increments the failed-attempt counter and rejects a wrong passcode', async () => {
    await lock();
    await expect(AuthenticationService.authenticatePasscode('incorrect')).rejects.toThrow();
    expect(settings.passcodeFailedAttempts).toBe(1);
    expect(settings.lastPasscodeFailedTimestamp).toBe(1000);
    expect(status()).toBe(LockStatus.LOCKED);
});

it('accepts zero uptime without performing another native timing read', async () => {
    await lock();
    (NativeModules.DeviceUtilsModule.getElapsedRealtime as jest.Mock).mockClear().mockResolvedValue(0);
    await expect(AuthenticationService.authenticatePasscode('correct')).resolves.toBe('hash');
    expect(NativeModules.DeviceUtilsModule.getElapsedRealtime).toHaveBeenCalledTimes(1);
    expect(settings.lastUnlockedTimestamp).toBe(0);
});

it.each(['clock', 'storage'])('rejects biometric success if %s is unavailable', async (failure) => {
    await lock();
    jest.spyOn(Biometric, 'authenticate').mockResolvedValue('Biometrics' as any);
    if (failure === 'clock') {
        (NativeModules.DeviceUtilsModule.getElapsedRealtime as jest.Mock).mockRejectedValue(new Error('timing failed'));
    } else {
        (CoreRepository.saveAuthenticationSettings as jest.Mock).mockImplementation(() => {
            throw new Error('storage failed');
        });
    }
    await expect(AuthenticationService.authenticateBiometrics('fixture')).rejects.toThrow();
    expect(status()).toBe(LockStatus.LOCKED);
});

it('fails a timing check closed and settles after showing the lock', async () => {
    (NativeModules.DeviceUtilsModule.getElapsedRealtime as jest.Mock).mockRejectedValue(new Error('timing failed'));
    await expect(AuthenticationService.checkLockScreen()).resolves.toBeUndefined();
    expect(status()).toBe(LockStatus.LOCKED);
    expect(Navigator.showOverlay).toHaveBeenCalledTimes(1);
    expect(AuthenticationService.runAfterSuccessAuth).not.toHaveBeenCalled();
});

it('fails a settings-read check closed', async () => {
    (CoreRepository.getSettings as jest.Mock).mockImplementationOnce(() => { throw new Error('settings failed'); });
    await expect(AuthenticationService.checkLockScreen()).resolves.toBeUndefined();
    expect(status()).toBe(LockStatus.LOCKED);
});

it('shares concurrent lock presentation and waits for it to complete', async () => {
    let present!: (value: string) => void;
    (Navigator.showOverlay as jest.Mock).mockImplementation(() => new Promise((resolve) => { present = resolve; }));
    const first = AuthenticationService.checkLockScreen();
    const second = AuthenticationService.checkLockScreen();
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    expect(status()).toBe(LockStatus.LOCKED);
    expect(Navigator.showOverlay).toHaveBeenCalledTimes(1);
    present(AppScreens.Overlay.Lock);
    await Promise.all([first, second]);
});

it('keeps the lock state after presentation failure and permits a retry', async () => {
    (Navigator.showOverlay as jest.Mock).mockRejectedValueOnce(new Error('navigation failed'));
    await expect(AuthenticationService.checkLockScreen()).rejects.toThrow('navigation failed');
    expect(status()).toBe(LockStatus.LOCKED);
    await expect(AuthenticationService.checkLockScreen()).resolves.toBeUndefined();
    expect(Navigator.showOverlay).toHaveBeenCalledTimes(2);
});

it('consumes failures from the app-state event listener and retains the lock', async () => {
    (Navigator.showOverlay as jest.Mock).mockRejectedValueOnce(new Error('navigation failed'));
    await expect(AuthenticationService.onAppStateChange()).resolves.toBeUndefined();
    expect(status()).toBe(LockStatus.LOCKED);
});

it('keeps a fresh valid unlock and runs post-authentication work', async () => {
    settings.lastUnlockedTimestamp = 900;
    await AuthenticationService.checkLockScreen();
    expect(status()).toBe(LockStatus.UNLOCKED);
    expect(Navigator.showOverlay).not.toHaveBeenCalled();
    expect(AuthenticationService.runAfterSuccessAuth).toHaveBeenCalledTimes(1);
});
