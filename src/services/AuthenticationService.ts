/**
 * Authentication Service
 */
import EventEmitter from 'events';
import { AppScreens } from '@common/constants';

import { Navigator } from '@common/helpers/navigator';
import { GetElapsedRealtime } from '@common/helpers/device';
import { ExitApp } from '@common/helpers/app';

import { Biometric, BiometricErrors } from '@common/libs/biometric';
import Vault from '@common/libs/vault';

import DataStorage from '@store/storage';
import { BiometryType } from '@store/types';
import CoreRepository from '@store/repositories/core';

import AppService, { AppStateStatus } from '@services/AppService';
import NavigationService, { RootType } from '@services/NavigationService';
import BackendService from '@services/BackendService';
import LoggerService, { LoggerInstance } from '@services/LoggerService';
import LinkingService from '@services/LinkingService';
import PushNotificationsService from '@services/PushNotificationsService';

import Localize from '@locale';

import { Props as LockOverlayProps } from '@screens/Overlay/Lock/types';

const MAX_FAILED_PASSCODE_ATTEMPTS = 10;

/* Types  ==================================================================== */
export enum LockStatus {
    LOCKED = 'LOCKED',
    UNLOCKED = 'UNLOCKED',
}

/* Events  ==================================================================== */
export type AuthenticationServiceEvent = {
    lockStateChange: (state: LockStatus) => void;
};

declare interface AuthenticationService {
    on<U extends keyof AuthenticationServiceEvent>(event: U, listener: AuthenticationServiceEvent[U]): this;
    off<U extends keyof AuthenticationServiceEvent>(event: U, listener: AuthenticationServiceEvent[U]): this;
    emit<U extends keyof AuthenticationServiceEvent>(
        event: U,
        ...args: Parameters<AuthenticationServiceEvent[U]>
    ): boolean;
}
/* Service  ==================================================================== */
class AuthenticationService extends EventEmitter {
    private lockStatus: LockStatus;
    private postSuccess: Array<() => void>;
    private logger: LoggerInstance;
    private lockScreenTask?: Promise<void>;

    constructor() {
        super();

        this.logger = LoggerService.createLogger('Authentication');

        // track the status of app is locked
        this.lockStatus = LockStatus.UNLOCKED;

        // list of methods that needs to run after success auth
        this.postSuccess = [
            AppService.checkVersionChange,
            AppService.checkAppUpdate,
            BackendService.ping,
            LinkingService.checkInitialDeepLink,
            PushNotificationsService.checkInitialNotification,
        ];
    }

    initialize = () => {
        /* eslint-disable-next-line */
        return new Promise<void>(async (resolve, reject) => {
            try {
                // we just need to require the lock if user initialized the app the
                NavigationService.on('setRoot', this.onRootChanged);
                // resolve
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    };

    /**
     * On app root changed/set
     */
    private onRootChanged = (root: RootType) => {
        if (root === RootType.DefaultRoot) {
            // this will listen for app state changes and will check if we need to lock the app
            this.addAppStateListener();
        } else {
            this.removeAppStateListener();
        }
    };

    /**
     * Add appState listener
     */
    private addAppStateListener = () => {
        AppService.addListener('appStateChange', this.onAppStateChange);
    };

    /**
     * Remove appState listener
     */
    private removeAppStateListener = () => {
        AppService.removeListener('appStateChange', this.onAppStateChange);
    };

    /**
     * reinstate service
     */
    public reinstate = () => {
        this.lockScreenTask = undefined;
        // set locked to false
        this.setLockStatus(LockStatus.UNLOCKED);

        // remove appState listener
        this.removeAppStateListener();
    };

    /**
     * run services/functions which needs to run after auth done
     */
    runAfterSuccessAuth = () => {
        setTimeout(() => {
            while (this.postSuccess.length) {
                try {
                    this.postSuccess.shift()?.call(null);
                } catch (error) {
                    this.logger.error('runAfterSuccessAuth', error);
                }
            }
        }, 500);
    };

    /**
     * reset the entire app
     * WARNING: this action is irreversible, USED CAREFULLY
     */
    resetApp = async () => {
        // purge all account private keys
        try {
            await Vault.wipeLocalDatastore();
        } catch (error) {
            this.logger.error('resetApp wipeLocalDatastore', error);
            await Vault.clearStorage();
        }

        // wipe storage
        DataStorage.wipe();

        // exit the app
        ExitApp();
    };

    /**
     * set current lock status
     * @param {LockStatus} status current lock status
     */
    private setLockStatus = (status: LockStatus) => {
        this.lockStatus = status;

        // emit the event
        this.emit('lockStateChange', status);
    };

    /**
     * get current lock status
     */
    private getLockStatus = (): LockStatus => {
        return this.lockStatus;
    };

    get isLocked(): boolean {
        return this.lockStatus === LockStatus.LOCKED;
    }

    /**
     * Calculate who long the input should be blocked base on number of wrong attempts
     * @param  {number} attemptNumber latest wrong attempt
     * @returns number wait time in seconds
     */
    private calculateWrongAttemptWaitTime = (attemptNumber: number): number => {
        if (attemptNumber < 6) return 0;

        switch (attemptNumber) {
            case 6:
                return 60;
            case 7:
                return 5 * 60;
            case 8:
                return 15 * 60;
            case 9:
                return 60 * 60;
            default:
                return 120 * 60;
        }
    };

    /**
     * Runs after success auth
     * @param ts
     */
    onSuccessAuthentication = async (ts?: number) => {
        if (ts === undefined) {
            ts = await GetElapsedRealtime();
        }

        // Commit the counters before granting access.
        CoreRepository.saveAuthenticationSettings({
            passcodeFailedAttempts: 0,
            lastPasscodeFailedTimestamp: 0,
            lastUnlockedTimestamp: ts,
        });
        this.lockScreenTask = undefined;
        this.setLockStatus(LockStatus.UNLOCKED);

        // run services/functions need to run after success auth
        this.runAfterSuccessAuth();
    };

    /**
     * runs after wrong passcode input
     * @param  {any} coreSettings
     * @param ts
     */
    private onWrongPasscodeInput = async (coreSettings: any, ts?: number) => {
        if (ts === undefined) {
            ts = await GetElapsedRealtime();
        }

        const failedAttempts = coreSettings.passcodeFailedAttempts + 1;

        // increase failed attempt
        CoreRepository.saveAuthenticationSettings({
            passcodeFailedAttempts: failedAttempts,
            lastPasscodeFailedTimestamp: ts,
        });

        // check for purge on too many attempts
        if (coreSettings.purgeOnBruteForce) {
            // alert user next attempt will wipe the entire app
            if (failedAttempts === MAX_FAILED_PASSCODE_ATTEMPTS - 1) {
                // alert
                Navigator.showAlertModal({
                    type: 'error',
                    title: Localize.t('global.critical'),
                    text: Localize.t('global.autoWipeAlert', { times: failedAttempts }),
                    buttons: [
                        {
                            text: Localize.t('global.dismiss'),
                            onPress: () => {},
                            light: false,
                        },
                    ],
                });
            }

            if (failedAttempts >= MAX_FAILED_PASSCODE_ATTEMPTS) {
                // wipe/reset the app
                await this.resetApp();
            }
        }
    };
    /**
     * Get the time app should not accept new pin code entry
     * @param  {any} coreSettings
     * @param  {number} realTime timestamp in seconds
     * @returns number block time in minutes
     */
    private getInputBlockTime = async (coreSettings: any, realTime: number): Promise<number> => {
        // check if attempts will exceed the threshold
        if (coreSettings.passcodeFailedAttempts > 5) {
            // calculate potential wait time
            const waitTime = this.calculateWrongAttemptWaitTime(coreSettings.passcodeFailedAttempts);

            const lastFailure = coreSettings.lastPasscodeFailedTimestamp;
            // Restart the full delay if the clock rebooted or the saved timestamp is unusable.
            if (!Number.isFinite(lastFailure) || lastFailure < 0 || realTime < lastFailure) {
                // store the new latest real time
                CoreRepository.saveAuthenticationSettings({
                    lastPasscodeFailedTimestamp: realTime,
                });

                return Math.ceil(waitTime / 60);
            }

            const blockTime = lastFailure + waitTime - realTime;

            // entering passcode is still blocked
            if (blockTime > 0) {
                return Math.ceil(blockTime / 60);
            }
        }

        return 0;
    };
    /**
     * Authenticate with passcode
     * @param  {string} passcode clear passcode
     * @returns string hashed passcode
     */
    authenticatePasscode = async (passcode: string): Promise<string> => {
        const coreSettings = CoreRepository.getSettings();
        const realTime = await GetElapsedRealtime();
        const blockTime = await this.getInputBlockTime(coreSettings, realTime);
        if (blockTime) {
            throw new Error(Localize.t('global.tooManyAttempts', { after: blockTime }));
        }

        const hashedPasscode = await CoreRepository.hashPasscode(passcode);
        if (hashedPasscode === coreSettings.passcode) {
            await this.onSuccessAuthentication(realTime);
            return hashedPasscode;
        }

        await this.onWrongPasscodeInput(coreSettings, realTime);
        throw new Error(Localize.t('global.invalidPasscode'));
    };

    private showLockScreen = (): Promise<void> => {
        if (this.lockScreenTask) return this.lockScreenTask;
        this.setLockStatus(LockStatus.LOCKED);
        const task = Promise.resolve()
            .then(() =>
                Navigator.showOverlay<LockOverlayProps>(
                    AppScreens.Overlay.Lock,
                    {},
                    { overlay: { handleKeyboardEvents: false } },
                ),
            )
            .then(() => undefined);
        this.lockScreenTask = task;
        // Permit another presentation attempt if navigation fails, while retaining the locked state.
        task.catch(() => {
            if (this.lockScreenTask === task) this.lockScreenTask = undefined;
        });
        return task;
    };

    /**
     * check if the app needs to be lock base on the latest lock time and user settings
     */
    checkLockScreen = async (): Promise<void> => {
        if (this.getLockStatus() === LockStatus.LOCKED) {
            await this.showLockScreen();
            return;
        }

        let requiresLock = true;
        try {
            const coreSettings = CoreRepository.getSettings();
            const realTime = await GetElapsedRealtime();
            requiresLock =
                coreSettings.lastUnlockedTimestamp === 0 ||
                realTime < (coreSettings.lastUnlockedTimestamp ?? 0) ||
                realTime - (coreSettings.lastUnlockedTimestamp ?? 0) > coreSettings.minutesAutoLock * 60;
        } catch (error) {
            // An unavailable clock/settings record cannot establish that the unlock is still fresh.
            this.logger.error('checkLockScreen', error);
        }

        if (requiresLock || this.getLockStatus() === LockStatus.LOCKED) {
            await this.showLockScreen();
        } else {
            this.runAfterSuccessAuth();
        }
    };

    /**
     * When biometric data has been changed, reset biometric method
     */
    onBiometricInvalidated = () => {
        CoreRepository.saveSettings({
            biometricMethod: BiometryType.None,
        });
    };

    /**
     * check if we can authenticate with biometrics
     */
    isBiometricAvailable = (): Promise<boolean> => {
        return new Promise((resolve) => {
            // check if biometry is active
            const coreSettings = CoreRepository.getSettings();
            if (coreSettings.biometricMethod === BiometryType.None) {
                this.logger.debug('Biometric is disabled from settings');
                resolve(false);
                return;
            }

            // check if we can authenticate with biometrics in the device level
            Biometric.isSensorAvailable()
                .then((biometryType) => {
                    this.logger.debug('Biometric is available', biometryType);
                    resolve(true);
                })
                .catch((reason) => {
                    this.logger.debug('Biometric is not available, reason', reason);
                    resolve(false);
                });
        });
    };

    /**
     * start biometric authentication
     */
    authenticateBiometrics = async (reason: string): Promise<boolean> => {
        if (AppService.currentAppState !== AppStateStatus.Active) {
            this.logger.warn('ignore requested biometric authentication while app is not active');
            throw new Error(BiometricErrors.APP_NOT_ACTIVE);
        }

        try {
            await Biometric.authenticate(reason);
            await this.onSuccessAuthentication();
            return true;
        } catch (error) {
            this.logger.warn('authenticateBiometrics', error);
            if (error instanceof Error && error.name === BiometricErrors.ERROR_BIOMETRIC_HAS_BEEN_CHANGED) {
                this.onBiometricInvalidated();
            }
            throw error;
        }
    };

    /**
     * Listen for app state change to check for lock the app
     */
    onAppStateChange = async () => {
        // let's check the lock screen in any app state change
        try {
            await this.checkLockScreen();
        } catch (error) {
            // EventEmitter cannot consume an async listener's rejected promise.
            this.logger.error('onAppStateChange', error);
        }
    };
}

export default new AuthenticationService();
