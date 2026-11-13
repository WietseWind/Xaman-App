/**
 * Application class
 */

import moment from 'moment-timezone';

import { UIManager, I18nManager, Platform, Alert, Text, TextInput, Appearance } from 'react-native';

import messaging from '@react-native-firebase/messaging';
import { Navigation } from 'react-native-navigation';

// constants
import { ErrorMessages } from '@common/constants';

// helpers
import { Prompt } from '@common/helpers/interface';
import { Navigator } from '@common/helpers/navigator';
import {
    GetDeviceTimeZone,
    GetDeviceLocaleSettings,
    GetDeviceBrand,
    GetDeviceOSVersion,
    IsDeviceJailBroken,
    IsDeviceRooted,
} from '@common/helpers/device';

import { SetFlagSecure, ExitApp, GetAppVersionCode, GetAppBuildNumber, IsDebugBuild } from '@common/helpers/app';

import Vault from '@common/libs/vault';
import { getKeychainGroupInfo } from '@common/libs/vaultInfo';
import CrashReporter from '@common/libs/crash';

// Storage
import { CoreRepository } from '@store/repositories';
import DataStorage from '@store/storage';

// services
import * as services from '@services';

// Textencoder/decoder polyfill TextEncoder TextDecoder
// Needed for ripple-binary-codec/... isomorphic
import '@common/helpers/textencoder';

messaging().setBackgroundMessageHandler(async () => {
    // FIXME: temporary fix for error
    // Invariant Violation: Module AppRegistry is not a registered callable module (calling startHeadlessTask)
});

/* Application  ==================================================================== */
class Application {
    private storage: DataStorage;
    private initialized: boolean;
    private settingsReported: boolean;
    private isModifiedDevice: boolean;
    private logger: any;

    constructor() {
        this.storage = new DataStorage();
        this.logger = services.LoggerService.createLogger('App');
        this.initialized = false;
        this.settingsReported = false;
        this.isModifiedDevice = false;
    }

    run() {
        // Listen for app launched event
        Navigation.events().registerAppLaunchedListener(() => {
            // start the app
            this.logger.debug(
                `Xaman version ${GetAppVersionCode()}_${GetAppBuildNumber()}_${IsDebugBuild() ? 'D' : 'R'}` +
                    ` (over-the-air update ${services.UpdateService.getOtaUpdateId()})`,
            );
            this.logger.debug(`Device ${GetDeviceBrand()} - OS Version ${GetDeviceOSVersion()}`);

            // tasks need to run before booting the app
            let tasks: Array<[string, () => Promise<any>]> = [];

            // if already initialized then soft boot
            // NOTE: this can happen if Activity is destroyed and re-initiated
            if (this.initialized) {
                tasks = [
                    ['configure', this.configure],
                    ['reinstateServices', this.reinstateServices],
                ];
            } else {
                tasks = [
                    ['checkup', this.checkup],
                    ['initializeStorage', this.initializeStorage],
                    ['configure', this.configure],
                    ['initializeServices', this.initializeServices],
                    ['registerScreens', this.registerScreens],
                ];
            }

            // run them in waterfall
            tasks
                .reduce((accumulator: Promise<any>, [name, callback]) => {
                    return accumulator.then(() => {
                        // a startup crash report shows the step it died in
                        CrashReporter.breadcrumb(`boot ${name}`);
                        return callback();
                    });
                }, Promise.resolve())
                .then(() => {
                    // if everything went well boot the app
                    this.initialized = true;
                    this.reportSettings();
                    this.boot();
                    this.warnOnModifiedDevice();
                })
                .catch(this.handleError);
        });
    }

    // handle errors in app startup
    handleError = (exception: Error) => {
        // normalize error message
        const message = services.LoggerService.normalizeError(exception);

        if (message) {
            if (
                message.indexOf('Realm file decryption failed') > -1 ||
                message.indexOf('Could not decrypt data') > -1 ||
                message.indexOf('Could not decrypt bytes') > -1 ||
                message.indexOf('KEYSTORE_UNRECOVERABLE') > -1 ||
                message.indexOf('Keystore alias missing') > -1
            ) {
                Alert.alert('Error', ErrorMessages.storageDecryptionFailed, [
                    {
                        text: 'Try again later',
                        onPress: ExitApp,
                    },
                    { text: 'Wipe Xaman', style: 'destructive', onPress: this.wipeStorage },
                ]);
            } else if (message.indexOf('Encrypted interprocess sharing is currently unsupported') > -1) {
                Alert.alert('Error', ErrorMessages.appAlreadyRunningInDifferentProcess, [
                    {
                        text: 'Quit',
                        onPress: ExitApp,
                    },
                ]);
            } else {
                Alert.alert('Error', message);
            }
        } else {
            Alert.alert('Error', 'Unexpected error happened');
        }

        services.LoggerService.logError('APP_STARTUP_ERROR', exception);
    };

    /**
     * Rooted (Android) or jailbroken (iOS) device: tell the user once per app start, then carry on.
     */
    warnOnModifiedDevice = () => {
        if (!this.isModifiedDevice) {
            return;
        }
        // once per process: a soft boot (activity re-created) doesn't repeat it
        this.isModifiedDevice = false;

        const Localize = require('@locale').default;

        Alert.alert(
            Localize.t('global.warning'),
            Localize.t(Platform.OS === 'android' ? 'global.deviceIsRootedWarning' : 'global.deviceIsJailBrokenWarning'),
            [{ text: Localize.t('global.IUnderstand') }],
            { cancelable: false },
        );
    };

    /**
     * Crash report keys from settings (no user data), kept up to date on change
     */
    reportSettings = () => {
        // re-wrap if anything installed a global error handler on top of the crash reporter
        CrashReporter.install();

        const report = () => {
            const core = CoreRepository.getSettings();
            CrashReporter.setKeys({
                developer_mode: !!core?.developerMode,
                locale: core?.language ?? '',
                theme: core?.theme ?? '',
            });
        };
        report();

        if (!this.settingsReported) {
            this.settingsReported = true;
            // NOTE: the second argument holds the changed fields, which can include the passcode hash:
            // only ever look at the field names
            CoreRepository.on('updateSettings', (_settings: any, changes: any) => {
                if (changes && ['developerMode', 'language', 'theme'].some((key) => key in changes)) {
                    report();
                }
            });
        }
    };

    wipeStorage = () => {
        Prompt(
            'WARNING',
            'You are wiping Xaman, This action cannot be undone. Are you sure?',
            [
                {
                    text: 'No',
                },
                {
                    text: 'Yes',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await Vault.wipeLocalDatastore();
                        } catch (error) {
                            this.logger.error('wipeStorage', error);
                            try {
                                await Vault.clearStorage();
                            } catch (clearError) {
                                this.logger.error('wipeStorage clearStorage', clearError);
                            }
                        }
                        try {
                            DataStorage.wipe();
                        } catch (error) {
                            this.logger.error('wipeStorage realm', error);
                        }
                        ExitApp();
                    },
                },
            ],
            { type: 'default' },
        );
    };

    // boot the app
    boot = () => {
        const { AuthenticationService } = services;

        const core = CoreRepository.getSettings();

        // if app initialized go to main screen
        if (core && core.initialized) {
            // check if the app should be locked
            // lock the app and the start the app
            AuthenticationService.checkLockScreen().then(() => {
                Navigator.startDefault();
                // over-the-air updates: health + update check, independent of unlocking
                services.UpdateService.onAppStarted();

                // Switch theme if back from background and changed
                services.AppService.on('appStateChange', newState => {
                    if (newState === 'Active') {
                        const coreSettings = CoreRepository.getSettings();
                        if (coreSettings.themeAutoSwitch) {
                            if (
                                (
                                    Appearance.getColorScheme() === 'light' &&
                                    services.StyleService.getCurrentTheme() !== 'light'
                                ) || (
                                    Appearance.getColorScheme() === 'dark' &&
                                    services.StyleService.getCurrentTheme() === 'light'
                                )
                            ) {
                                // Switch to light/dark
                                // console.log('Foreground appstatechange theme switch')
                                Navigator.awaitSafeThemeSwitch().then(() => {
                                    services.StyleService.initialize(coreSettings)
                                    .then(() => {
                                        requestAnimationFrame(() => {
                                            Navigator.switchTheme();
                                        });
                                    });
                                });
                            }
                        }
                    }
                });

                // Auto switch theme based on OS notification
                Appearance.addChangeListener(() => { // { colorScheme }
                    // console.log('Theme changed to:', colorScheme);
                    const coreSettings = CoreRepository.getSettings();
                    if (coreSettings.themeAutoSwitch) {
                        Navigator.awaitSafeThemeSwitch().then(() => {
                            services.StyleService.initialize(coreSettings)
                            .then(() => {
                                requestAnimationFrame(() => {
                                    Navigator.switchTheme();
                                });
                            });
                        });
                    }
                });
            }).catch(this.handleError);
        } else {
            Navigator.startOnboarding();
            services.UpdateService.onAppStarted();
        }
    };

    // initialize the storage
    initializeStorage = () => {
        return this.storage.initialize().then(() => {
            return Vault.inspectHealth()
                .then(() => getKeychainGroupInfo())
                .then(() => undefined);
        });
    };

    // initialize all the services
    initializeServices = (onlyService?: string) => {
        return new Promise<void>((resolve, reject) => {
            try {
                const coreSettings = CoreRepository.getSettings();
                const servicesPromise = [] as Array<Promise<any>>;
                Object.keys(services).filter(key => {
                    return !onlyService || onlyService === key;
                }).map((key) => {
                    // @ts-ignore
                    const service = services[key];
                    if (typeof service.initialize === 'function') {
                        servicesPromise.push(service.initialize(coreSettings));
                    }
                    return servicesPromise;
                });

                Promise.all(servicesPromise)
                    .then(() => {
                        resolve();
                    })
                    .catch((error) => {
                        this.logger.error('initializeServices', error);
                        reject(error);
                    });
            } catch (error) {
                reject(error);
                this.logger.error('initializeServices', error);
            }
        });
    };

    // reinstate services
    reinstateServices = () => {
        return new Promise<void>((resolve, reject) => {
            try {
                Object.keys(services).forEach((key) => {
                    // @ts-ignore
                    const service = services[key];
                    if (typeof service.reinstate === 'function') {
                        service.reinstate();
                    }
                });
                resolve();
            } catch (error) {
                this.logger.error('reinstateServices', error);
                reject(error);
            }
        });
    };

    // register all screens
    registerScreens = () => {
        return new Promise<void>((resolve, reject) => {
            try {
                // load the screens
                const screens = require('./screens');

                // register
                Object.keys(screens).map((key) => {
                    // @ts-ignore
                    const Screen = screens[key];
                    // Screen.load defers require() until RNN first shows the screen
                    // (used by Scan so vision-camera is not evaluated at startup).
                    const provider = typeof Screen.load === 'function' ? Screen.load : () => Screen;
                    Navigation.registerComponent(Screen.screenName, provider);
                    return true;
                });
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    };

    // pre run code that needs to be run before app initialization
    checkup = () => {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise<void>(async (resolve, reject) => {
            try {
                //  ====== check for device root or jailBroken ======
                // Warn only, never block: the warning shows once the app is up (warnOnModifiedDevice).
                // Not on debug builds. Simulators and emulators report false natively, so e2e and CI
                // runs never see it.
                if (!IsDebugBuild()) {
                    const check = Platform.OS === 'android' ? IsDeviceRooted : IsDeviceJailBroken;
                    this.isModifiedDevice = (await check().catch(() => false)) === true;
                }

                //  ====== check if we need to clean up the vault ======
                // NOTE: this is needed in case of app reinstall for iOS
                if (Platform.OS === 'ios' && !DataStorage.isDataStoreFileExist()) {
                    const storageEncryptionKeyExist = await Vault.isStorageEncryptionKeyExist();
                    // if data storage file doesn't exist, and we could find the storage encryption key in the vault
                    // we need to clear the vault
                    if (storageEncryptionKeyExist) {
                        await Vault.clearStorage();
                    }
                }

                resolve();
            } catch (e) {
                reject(e);
            }
        });
    };

    // configure app settings
    configure = () => {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise<void>(async (resolve, reject) => {
            try {
                // get core settings
                const coreSettings = CoreRepository.getSettings();

                /* ======================== TIMEZONE ==================================== */
                await GetDeviceTimeZone()
                    .then((tz: string) => {
                        this.logger.debug(`Timezone set to ${tz}`);
                        moment.tz.setDefault(tz);
                    })
                    .catch(() => {
                        this.logger.warn('Unable to get device timezone, fallback to default timezone');
                        // ignore in case of error
                    });

                /* ======================== LOCALE ==================================== */
                const Localize = require('@locale').default;

                // get device local settings
                const localeSettings = await GetDeviceLocaleSettings();

                // if there is a language set in the settings load the setting base on the settings
                if (coreSettings?.language) {
                    this.logger.debug(
                        `Settings [Locale]/[Currency]: ${coreSettings.language.toUpperCase()}/${coreSettings.currency}`,
                    );
                    Localize.setLocale(
                        coreSettings.language,
                        coreSettings.useSystemSeparators ? localeSettings : undefined,
                    );
                } else {
                    // app is not initialized yet, set to default device locale
                    this.logger.debug('Locale is not initialized, setting base on device settings');
                    const locale = Localize.setLocale(localeSettings.languageCode, localeSettings);
                    CoreRepository.saveSettings({ language: locale });
                }

                /* ======================== FlagSecure & LayoutAnimationExperimental =============================== */
                if (Platform.OS === 'android') {
                    // Release: FLAG_SECURE unless developer mode. Debug APK never blocks screenshots.
                    if (!IsDebugBuild() && !coreSettings?.developerMode) {
                        SetFlagSecure(true);
                    } else {
                        SetFlagSecure(false);
                    }

                    // enable layout animation
                    if (UIManager.setLayoutAnimationEnabledExperimental) {
                        UIManager.setLayoutAnimationEnabledExperimental(true);
                    }
                }

                /* ======================== RTL & FONTS ==================================== */
                // disable RTL as we don't support it right now
                I18nManager.allowRTL(false);
                // Disable accessibility fonts
                // @ts-ignore
                Text.defaultProps = {};
                // @ts-ignore
                Text.defaultProps.allowFontScaling = false;
                // @ts-ignore
                TextInput.defaultProps = {};
                // @ts-ignore
                TextInput.defaultProps.allowFontScaling = false;

                resolve();
            } catch (e) {
                reject(e);
            }
        });
    };
}

export default new Application();
