/**
 * Over-the-air updates on the device: what may be downloaded (only what the signed manifest says it is),
 * what never comes back after a revert, request parameters that can't leak between requests, one request
 * at a time, and the version fields (the backend's appVersion never changes).
 */

import { NativeModules } from 'react-native';

import { GetAppVersionCode, GetAppReadableVersion } from '@common/helpers/app';

import SingletonUpdateService, { UpdateChannel } from '../UpdateService';

// expo-updates as a live object: each test sets what is running and what the server answers
jest.mock('expo-updates', () => ({ __esModule: true }));
const mockUpdates: any = jest.requireMock('expo-updates');

const mockDeveloperMode = { enabled: false };
jest.mock('@store/repositories/core', () => ({
    __esModule: true,
    default: { isDeveloperModeEnabled: () => mockDeveloperMode.enabled },
}));

jest.mock('@services/LoggerService', () => ({
    __esModule: true,
    default: { createLogger: () => ({ debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

const manifest = (id: string, otaId: number, channel: string) => ({ id, extra: { xaman: { otaId, channel } } });

const STATE = {
    blockedUpdateIds: [] as string[],
    blockedOtaIds: [] as number[],
    revertedUpdateId: null,
    revertPending: false,
    unhealthyLaunches: 0,
    watchdogLimit: 3,
    automatedTest: false,
};

const { OtaRecoveryModule, AppUtilsModule } = NativeModules;

/** a fresh UpdateService: the export is a singleton with a queue and start state */
const load = () => ({ service: new (SingletonUpdateService as any).constructor(), UpdateChannel });

const running = (m?: ReturnType<typeof manifest>) => {
    Object.assign(mockUpdates, {
        isEnabled: true,
        isEmbeddedLaunch: !m,
        isEmergencyLaunch: false,
        updateId: m?.id ?? null,
        runtimeVersion: '5.4.0.456',
        createdAt: m ? new Date('2026-11-05T10:00:00.000Z') : null,
        manifest: m ?? {},
    });
};

const flush = () =>
    new Promise((resolve) => {
        setImmediate(resolve);
    });

const paramsOf = (calls: any[][]) => Object.fromEntries(calls.map(([key, value]) => [key, value]));

beforeEach(() => {
    jest.clearAllMocks();
    mockDeveloperMode.enabled = false;
    Object.assign(mockUpdates, {
        isEnabled: false,
        isEmbeddedLaunch: true,
        isEmergencyLaunch: false,
        updateId: null,
        runtimeVersion: null,
        createdAt: null,
        manifest: {},
        checkForUpdateAsync: jest.fn(async () => ({ isAvailable: false, isRollBackToEmbedded: false })),
        fetchUpdateAsync: jest.fn(async () => ({ isNew: false, isRollBackToEmbedded: false })),
        setExtraParamAsync: jest.fn(async () => undefined),
        reloadAsync: jest.fn(async () => undefined),
    });
    OtaRecoveryModule.getState.mockImplementation(() => Promise.resolve({ ...STATE }));
    AppUtilsModule.appVersion = '5.4.0';
    AppUtilsModule.buildNumber = '456';
});

afterAll(() => {
    AppUtilsModule.appVersion = '0.0.1';
    AppUtilsModule.buildNumber = '1';
});

describe('version fields', () => {
    it('store version: update 0, and every version value as before', () => {
        const { service } = load();
        expect(service.getRunningUpdate()).toMatchObject({ otaId: 0, channel: UpdateChannel.Embedded, updateId: null });
        expect(service.getOtaUpdateId()).toBe(0);
        expect(service.getAppFullVersion()).toBe('5.4.0.456');
        expect(GetAppReadableVersion()).toBe('5.4.0.456');
        expect(GetAppVersionCode()).toBe('5.4.0');
    });

    it('update 12 runs: only the display version gets the 5th digit', () => {
        running(manifest('uuid-12', 12, 'ga'));
        const { service } = load();
        expect(service.getRunningUpdate()).toMatchObject({
            otaId: 12,
            channel: UpdateChannel.General,
            updateId: 'uuid-12',
        });
        expect(service.getAppFullVersion()).toBe('5.4.0.456.12');
        // what the backend, xApps and the store update check see
        expect(GetAppReadableVersion()).toBe('5.4.0.456');
        expect(GetAppVersionCode()).toBe('5.4.0');
    });

    it('a debug build is always the store version', () => {
        running(manifest('uuid-12', 12, 'ga'));
        AppUtilsModule.isDebug = true;
        try {
            const { service } = load();
            expect(service.isEnabled()).toBe(false);
            expect(service.getOtaUpdateId()).toBe(0);
        } finally {
            AppUtilsModule.isDebug = false;
        }
    });
});

describe('automatic check (GA only)', () => {
    beforeEach(() => running());

    it('a developer update offered to a regular check is never downloaded', async () => {
        const offered = manifest('dev-13', 13, 'dev');
        mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true, manifest: offered });
        const { service } = load();
        await expect(service.checkAutomatically()).resolves.toBe(false);
        expect(mockUpdates.fetchUpdateAsync).not.toHaveBeenCalled();
    });

    it('an update this device reverted never comes back, also under a new id', async () => {
        OtaRecoveryModule.getState.mockResolvedValue({ ...STATE, blockedUpdateIds: ['ga-12'], blockedOtaIds: [12] });
        const { service } = load();

        mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true, manifest: manifest('ga-12', 12, 'ga') });
        await expect(service.checkAutomatically()).resolves.toBe(false);
        const reissued = manifest('reissued-12', 12, 'ga');
        mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true, manifest: reissued });
        await expect(service.checkAutomatically()).resolves.toBe(false);

        expect(mockUpdates.fetchUpdateAsync).not.toHaveBeenCalled();
        // the server learns which ids to skip
        expect(paramsOf(mockUpdates.setExtraParamAsync.mock.calls)['ota-blocked']).toBe('ga-12');
    });

    it('anything else than what was checked is wiped before it can run', async () => {
        mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true, manifest: manifest('ga-12', 12, 'ga') });
        mockUpdates.fetchUpdateAsync.mockResolvedValue({ isNew: true, manifest: manifest('dev-13', 13, 'dev') });
        const { service } = load();
        await expect(service.checkAutomatically()).rejects.toThrow('Refused a downloaded update');
        expect(OtaRecoveryModule.scheduleRevert).toHaveBeenCalledWith('dev-13', 13);
    });

    it('a GA update is downloaded; it runs from the next start', async () => {
        mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true, manifest: manifest('ga-12', 12, 'ga') });
        mockUpdates.fetchUpdateAsync.mockResolvedValue({ isNew: true, manifest: manifest('ga-12', 12, 'ga') });
        const { service } = load();
        await expect(service.checkAutomatically()).resolves.toBe(true);
        expect(OtaRecoveryModule.scheduleRevert).not.toHaveBeenCalled();
        expect(mockUpdates.reloadAsync).not.toHaveBeenCalled();
    });

    it('a signed rollback directive is followed', async () => {
        mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false, isRollBackToEmbedded: true });
        const { service } = load();
        await expect(service.checkAutomatically()).resolves.toBe(true);
        expect(mockUpdates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
    });

    it('every request sets every parameter, so nothing of an interrupted install leaks into it', async () => {
        const { service } = load();
        await service.checkAutomatically();
        expect(paramsOf(mockUpdates.setExtraParamAsync.mock.calls)).toEqual({
            'ota-install': null,
            'ota-token': null,
            'ota-exit': null,
            'ota-blocked': null,
            'ota-reverted': null,
            'ota-healthy': null,
        });
    });
});

describe('developer installs and leaving developer mode', () => {
    it('installs exactly the requested update, then clears its parameters', async () => {
        running(manifest('ga-12', 12, 'ga'));
        mockUpdates.fetchUpdateAsync.mockImplementation(async () => {
            const sent = paramsOf(mockUpdates.setExtraParamAsync.mock.calls);
            expect(sent['ota-install']).toBe('dev-13');
            expect(sent['ota-token']).toBe('token-13');
            return { isNew: true, manifest: manifest('dev-13', 13, 'dev') };
        });
        const { service } = load();
        await expect(service.installDeveloperUpdate('dev-13', 'token-13')).resolves.toBe(true);
        const after = paramsOf(mockUpdates.setExtraParamAsync.mock.calls);
        expect(after['ota-install']).toBeNull();
        expect(after['ota-token']).toBeNull();
    });

    it('refuses an install the server swapped for another update', async () => {
        running();
        mockUpdates.fetchUpdateAsync.mockResolvedValue({ isNew: true, manifest: manifest('dev-14', 14, 'dev') });
        const { service } = load();
        await expect(service.installDeveloperUpdate('dev-13', 'token-13')).rejects.toThrow('not the requested update');
        expect(OtaRecoveryModule.scheduleRevert).toHaveBeenCalledWith('dev-14', 14);
    });

    it('leaving developer mode only changes something while a test update runs', async () => {
        running(manifest('ga-12', 12, 'ga'));
        const { service } = load();
        await expect(service.exitDeveloperChannel()).resolves.toBe(false);
        expect(mockUpdates.fetchUpdateAsync).not.toHaveBeenCalled();
    });

    it('leaving a test update accepts the public version (or a rollback), never another test update', async () => {
        running(manifest('dev-13', 13, 'dev'));
        mockUpdates.fetchUpdateAsync.mockImplementation(async () => {
            expect(paramsOf(mockUpdates.setExtraParamAsync.mock.calls)['ota-exit']).toBe('1');
            return { isNew: true, manifest: manifest('exit-12', 12, 'exit') };
        });
        let { service } = load();
        await expect(service.exitDeveloperChannel()).resolves.toBe(true);
        expect(paramsOf(mockUpdates.setExtraParamAsync.mock.calls)['ota-exit']).toBeNull();

        mockUpdates.fetchUpdateAsync.mockReset();
        mockUpdates.fetchUpdateAsync.mockResolvedValue({ isNew: false, isRollBackToEmbedded: true });
        ({ service } = load());
        await expect(service.exitDeveloperChannel()).resolves.toBe(true);

        mockUpdates.fetchUpdateAsync.mockResolvedValue({ isNew: true, manifest: manifest('dev-14', 14, 'dev') });
        ({ service } = load());
        await expect(service.exitDeveloperChannel()).rejects.toThrow('Refused a downloaded update');
    });

    it('one request at a time: a check waits for a running install', async () => {
        running();
        let finishInstall: (value: any) => void = () => {};
        mockUpdates.fetchUpdateAsync.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishInstall = resolve;
                }),
        );
        const { service } = load();
        const install = service.installDeveloperUpdate('dev-13', 'token-13');
        const check = service.checkAutomatically();

        await flush();
        expect(mockUpdates.checkForUpdateAsync).not.toHaveBeenCalled();

        finishInstall({ isNew: false });
        await install;
        await check;
        expect(mockUpdates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
    });
});

describe('after start', () => {
    it('a test update with developer mode off: leaves it instead of the GA check', async () => {
        running(manifest('dev-13', 13, 'dev'));
        mockUpdates.fetchUpdateAsync.mockResolvedValue({ isNew: true, manifest: manifest('exit-12', 12, 'exit') });
        const { service } = load();
        await expect(service.checkAfterStart()).resolves.toBe(true);
        expect(mockUpdates.checkForUpdateAsync).not.toHaveBeenCalled();
    });

    it('developer mode on: the regular check', async () => {
        running(manifest('dev-13', 13, 'dev'));
        mockDeveloperMode.enabled = true;
        const { service } = load();
        await service.checkAfterStart();
        expect(mockUpdates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
    });

    it('automated test runs (Detox) never check and never count as healthy', async () => {
        running();
        OtaRecoveryModule.getState.mockResolvedValue({ ...STATE, automatedTest: true });
        jest.useFakeTimers();
        try {
            const { service } = load();
            await service.onAppStarted();
            jest.runAllTimers();
            expect(mockUpdates.checkForUpdateAsync).not.toHaveBeenCalled();
            expect(OtaRecoveryModule.markHealthy).not.toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
        }
    });

    it('a regular start: healthy after 10 s, the check after 5 s, once', async () => {
        running(manifest('ga-12', 12, 'ga'));
        jest.useFakeTimers();
        try {
            const { service } = load();
            await service.onAppStarted();
            await service.onAppStarted();
            jest.advanceTimersByTime(5000);
            await Promise.resolve();
            expect(OtaRecoveryModule.markHealthy).not.toHaveBeenCalled();
            jest.advanceTimersByTime(5000);
            expect(OtaRecoveryModule.markHealthy).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
        }
        await flush();
        expect(mockUpdates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
    });
});
