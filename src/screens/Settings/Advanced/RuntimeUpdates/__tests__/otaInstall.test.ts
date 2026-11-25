/**
 * Installing an update by hand (developer mode): the shared install state (downloading, then ready),
 * one download at a time, and what the user sees when an update doesn't download.
 */
import { Alert } from 'react-native';

jest.mock('@services/LoggerService', () => ({
    __esModule: true,
    default: { createLogger: () => ({ debug: jest.fn(), warn: jest.fn() }) },
}));
jest.mock('@services/BackendService', () => ({ __esModule: true, default: { getOtaUpdates: jest.fn() } }));
jest.mock('@services/UpdateService', () => ({
    __esModule: true,
    default: {
        getRunningUpdate: jest.fn(),
        installDeveloperUpdate: jest.fn(),
        reloadNow: jest.fn(),
        resetUpdateStorage: jest.fn(),
    },
}));
jest.mock('@common/helpers/app', () => ({ ExitApp: jest.fn() }));
jest.mock('@locale', () => ({ __esModule: true, default: { t: (key: string) => key } }));

type OtaInstallModule = typeof import('../otaInstall');

let ota: OtaInstallModule;
let UpdateService: any;
let BackendService: any;

const update = (otaId: number) => ({
    otaId,
    status: 'dev',
    rollout: 0,
    held: false,
    message: `update ${otaId}`,
    installToken: `token-${otaId}`,
    manifest: { uuid: `uuid-${otaId}`, createdAt: new Date(otaId * 1000).toISOString() },
});

const flush = () =>
    new Promise((resolve) => {
        setImmediate(resolve);
    });

/** installDeveloperUpdate that only finishes when the test says so */
const pendingDownload = () => {
    let finish: (isNew: boolean) => void = () => {};
    UpdateService.installDeveloperUpdate.mockReturnValueOnce(
        new Promise<boolean>((resolve) => {
            finish = resolve;
        }),
    );
    return (isNew: boolean) => finish(isNew);
};

beforeEach(() => {
    // a fresh module (and install state) for every test
    jest.isolateModules(() => {
        ota = require('../otaInstall');
        UpdateService = require('@services/UpdateService').default;
        BackendService = require('@services/BackendService').default;
    });
    UpdateService.getRunningUpdate.mockReturnValue({ otaId: 0, runtimeVersion: '5.4.0.465' });
    BackendService.getOtaUpdates.mockResolvedValue({ updates: [update(8), update(9)] });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

test('downloading, then ready with the restart question; subscribers see both', async () => {
    const seen: (string | undefined)[] = [];
    const unsubscribe = ota.subscribeOtaInstall((install) => seen.push(install?.status));
    const finish = pendingDownload();

    const install = ota.installOtaUpdate(9);
    expect(ota.getOtaInstall()).toEqual({ otaId: 9, status: ota.OtaInstallStatus.Downloading });

    await flush();
    // a fresh install token from a new list
    expect(UpdateService.installDeveloperUpdate).toHaveBeenCalledWith('uuid-9', 'token-9');
    expect(Alert.alert).not.toHaveBeenCalled();

    finish(true);
    await install;
    expect(ota.getOtaInstall()).toEqual({ otaId: 9, status: ota.OtaInstallStatus.Ready });
    expect(Alert.alert).toHaveBeenCalledWith('settings.otaTitle', 'settings.otaReadyRestart', expect.any(Array));
    expect(seen).toEqual([ota.OtaInstallStatus.Downloading, ota.OtaInstallStatus.Ready]);

    unsubscribe();
    pendingDownload();
    ota.installOtaUpdate(8);
    expect(seen).toHaveLength(2);
});

test('taps while a download runs start nothing', async () => {
    const finish = pendingDownload();

    const first = ota.installOtaUpdate(9);
    await ota.installOtaUpdate(9);
    await ota.installOtaUpdate(8);
    await flush();
    finish(true);
    await first;

    expect(BackendService.getOtaUpdates).toHaveBeenCalledTimes(1);
    expect(UpdateService.installDeveloperUpdate).toHaveBeenCalledTimes(1);
    expect(ota.getOtaInstall()).toEqual({ otaId: 9, status: ota.OtaInstallStatus.Ready });
});

test('a failed download shows the error and keeps the update downloaded before', async () => {
    UpdateService.installDeveloperUpdate.mockResolvedValueOnce(true);
    await ota.installOtaUpdate(8);

    UpdateService.installDeveloperUpdate.mockRejectedValueOnce(new Error('The network connection was lost.'));
    await ota.installOtaUpdate(9);

    expect(Alert.alert).toHaveBeenLastCalledWith('global.error', 'The network connection was lost.');
    expect(ota.getOtaInstall()).toEqual({ otaId: 8, status: ota.OtaInstallStatus.Ready });
});

test('not newer: says so for the running update, offers the reset for another one', async () => {
    UpdateService.installDeveloperUpdate.mockResolvedValue(false);
    UpdateService.getRunningUpdate.mockReturnValue({ otaId: 9, runtimeVersion: '5.4.0.465' });

    await ota.installOtaUpdate(9);
    expect(Alert.alert).toHaveBeenLastCalledWith('settings.otaTitle', 'settings.otaNotNewer');

    await ota.installOtaUpdate(8);
    expect(Alert.alert).toHaveBeenLastCalledWith(
        'settings.otaTitle',
        'settings.otaReinstallNeedsReset',
        expect.any(Array),
    );
    expect(ota.getOtaInstall()).toBeUndefined();
});

test('an update that is no longer published is not downloaded', async () => {
    BackendService.getOtaUpdates.mockResolvedValue({ updates: [update(8)] });

    await ota.installOtaUpdate(9);

    expect(UpdateService.installDeveloperUpdate).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenLastCalledWith('settings.otaTitle', 'settings.otaNothingToInstall');
    expect(ota.getOtaInstall()).toBeUndefined();
});
