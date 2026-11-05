/**
 * Update Service
 * Over-the-air JS updates (expo-updates, self hosted). The update server, the signing and the
 * rules for what may ship over the air are described in the backend repo (docs/ota-updates.md).
 *
 * - After launch (independent of unlocking) it looks for a GA update and downloads it; the update
 *   runs from the next cold start.
 * - It only accepts what the signed manifest says it is: automatic checks take GA updates or a
 *   rollback to the store version. Anything else that gets downloaded is wiped before it can run.
 * - Developer-mode installs and leaving developer mode use the same serialized queue, so their
 *   request parameters never overwrite each other.
 * - A launch counts as healthy once the first screen has been up for a while (native watchdog:
 *   an update that never gets there is reverted to the store version).
 */

import { NativeModules } from 'react-native';
import * as Updates from 'expo-updates';

import { IsDebugBuild, GetAppReadableVersion } from '@common/helpers/app';
import { fullAppVersion } from '@common/helpers/readableAppVersion';

import CoreRepository from '@store/repositories/core';

import LoggerService, { LoggerInstance } from '@services/LoggerService';

/* Constants  ==================================================================== */
const { OtaRecoveryModule } = NativeModules;

// a launch is healthy when the first screen stayed up this long
const HEALTHY_AFTER_MS = 10 * 1000;
// look for an update this long after the first screen, never during startup
const AUTOMATIC_CHECK_DELAY_MS = 5 * 1000;

/* Types  ==================================================================== */
export enum UpdateChannel {
    Embedded = 'embedded',
    Developer = 'dev',
    General = 'ga',
    Exit = 'exit',
}

export interface RunningUpdate {
    updateId: string | null;
    otaId: number;
    channel: UpdateChannel;
    runtimeVersion: string | null;
    createdAt: Date | null;
    isEmergencyLaunch: boolean;
}

interface RecoveryState {
    blockedUpdateIds: string[];
    blockedOtaIds: number[];
    revertedUpdateId: string | null;
    revertPending: boolean;
    unhealthyLaunches: number;
    watchdogLimit: number;
    automatedTest: boolean;
}

type Manifest = { id?: string; extra?: { xaman?: { otaId?: number; channel?: string } } } | undefined;

// every parameter this service sends; all are set (or cleared) on each request
type ExtraParams = {
    'ota-install': string | null;
    'ota-token': string | null;
    'ota-exit': string | null;
    'ota-blocked': string | null;
    'ota-reverted': string | null;
    'ota-healthy': string | null;
};

/* Service  ==================================================================== */
class UpdateService {
    private logger: LoggerInstance;
    private queue: Promise<unknown>;
    private started: boolean;
    private healthyUpdateId: string | null;
    private revertedUpdateId: string | null;

    constructor() {
        this.logger = LoggerService.createLogger('Update');
        this.queue = Promise.resolve();
        this.started = false;
        this.healthyUpdateId = null;
        this.revertedUpdateId = null;
    }

    initialize = (): Promise<void> => {
        return Promise.resolve();
    };

    /**
     * expo-updates is active (release builds with updates enabled)
     */
    isEnabled = (): boolean => {
        return !IsDebugBuild() && Updates.isEnabled;
    };

    /**
     * The bundle that runs now: the store version (otaId 0) or a downloaded update
     */
    getRunningUpdate = (): RunningUpdate => {
        if (!this.isEnabled() || Updates.isEmbeddedLaunch) {
            return {
                updateId: null,
                otaId: 0,
                channel: UpdateChannel.Embedded,
                runtimeVersion: this.isEnabled() ? Updates.runtimeVersion : null,
                createdAt: null,
                isEmergencyLaunch: this.isEnabled() && Updates.isEmergencyLaunch,
            };
        }

        const xaman = (Updates.manifest as Manifest)?.extra?.xaman;
        return {
            updateId: Updates.updateId,
            otaId: Number(xaman?.otaId) || 0,
            channel: this.channelOf(Updates.manifest as Manifest),
            runtimeVersion: Updates.runtimeVersion,
            createdAt: Updates.createdAt,
            isEmergencyLaunch: Updates.isEmergencyLaunch,
        };
    };

    /**
     * The 5th version digit: 0 on the store version
     */
    getOtaUpdateId = (): number => {
        return this.getRunningUpdate().otaId;
    };

    /**
     * For display only: 5.4.0.456.12 while update 12 runs, 5.4.0.456 on the store version.
     * The version sent to the backend (GetAppReadableVersion) never includes the update.
     */
    getAppFullVersion = (): string => {
        return fullAppVersion(GetAppReadableVersion(), this.getOtaUpdateId());
    };

    /**
     * Call once the first screen is up. Never blocks the UI.
     */
    onAppStarted = async (): Promise<void> => {
        if (this.started || !this.isEnabled()) {
            return;
        }
        this.started = true;

        const state = await this.getRecoveryState();
        if (state?.automatedTest) {
            // e2e runs must test the build itself, not whatever update is published
            return;
        }

        setTimeout(this.markHealthy, HEALTHY_AFTER_MS);
        setTimeout(() => {
            this.checkAfterStart().catch((error) => {
                this.logger.warn('Automatic update check failed', error);
            });
        }, AUTOMATIC_CHECK_DELAY_MS);
    };

    /**
     * A test update still runs while developer mode is off (it was turned off offline, or the
     * app was killed meanwhile): leave it first. Otherwise the regular GA check.
     */
    checkAfterStart = async (): Promise<boolean> => {
        if (
            this.getRunningUpdate().channel === UpdateChannel.Developer &&
            !CoreRepository.isDeveloperModeEnabled()
        ) {
            return this.exitDeveloperChannel();
        }
        return this.checkAutomatically();
    };

    /**
     * Look for a GA update (or a rollback to the store version) and download it.
     * It runs from the next cold start.
     */
    checkAutomatically = (): Promise<boolean> => {
        return this.enqueue(async () => {
            await this.setRequestParams({});
            const result = await Updates.checkForUpdateAsync();

            if (result.isRollBackToEmbedded) {
                // a signed directive: back to the store version on the next cold start
                await Updates.fetchUpdateAsync();
                return true;
            }

            if (!result.isAvailable) {
                return false;
            }

            if (this.channelOf(result.manifest as Manifest) !== UpdateChannel.General) {
                this.logger.warn('Ignoring an update that is not GA');
                return false;
            }

            // reverted on this device before (also when re-issued under a new id): never again,
            // whatever the server says
            if (await this.isBlocked(result.manifest as Manifest)) {
                this.logger.warn('Ignoring an update this device reverted');
                return false;
            }

            const fetched = await Updates.fetchUpdateAsync();
            await this.guard(fetched, [UpdateChannel.General]);
            return fetched.isNew;
        });
    };

    /**
     * Developer mode: install one specific update (token from the backend developer list).
     * Returns true when it is ready; call reloadNow() to run it.
     */
    installDeveloperUpdate = (manifestId: string, installToken: string): Promise<boolean> => {
        return this.enqueue(async () => {
            await this.setRequestParams({ 'ota-install': manifestId, 'ota-token': installToken });
            try {
                const fetched = await Updates.fetchUpdateAsync();
                if (fetched.isNew && (fetched.manifest as Manifest)?.id !== manifestId) {
                    await this.refuse(fetched.manifest as Manifest, 'not the requested update');
                }
                await this.guard(fetched, [UpdateChannel.Developer, UpdateChannel.General]);
                return fetched.isNew;
            } finally {
                await this.setRequestParams({});
            }
        });
    };

    /**
     * Developer mode turned off: back to the GA update (or the store version).
     * Returns true when something changed; call reloadNow() to run it.
     */
    exitDeveloperChannel = (): Promise<boolean> => {
        return this.enqueue(async () => {
            if (!this.isEnabled() || this.getRunningUpdate().channel !== UpdateChannel.Developer) {
                return false;
            }

            await this.setRequestParams({ 'ota-exit': '1' });
            try {
                const fetched = await Updates.fetchUpdateAsync();
                if (fetched.isRollBackToEmbedded) {
                    return true;
                }
                await this.guard(fetched, [UpdateChannel.Exit, UpdateChannel.General]);
                return fetched.isNew;
            } finally {
                await this.setRequestParams({});
            }
        });
    };

    /**
     * Back to the store version on the next launch, also offline. The running update is never
     * accepted again on this device.
     */
    revertToStoreVersion = async (): Promise<void> => {
        const running = this.getRunningUpdate();
        await OtaRecoveryModule.scheduleRevert(running.updateId, running.otaId);
    };

    /**
     * Run the downloaded update (or the store version after a rollback) now
     */
    reloadNow = (): Promise<void> => {
        return Updates.reloadAsync();
    };

    getRecoveryState = async (): Promise<RecoveryState | undefined> => {
        try {
            const state: RecoveryState = await OtaRecoveryModule.getState();
            // the native side hands out a revert only once: keep it until it is reported
            if (state?.revertedUpdateId) {
                this.revertedUpdateId = state.revertedUpdateId;
            }
            return state;
        } catch (error) {
            this.logger.warn('Unable to read the update recovery state', error);
            return undefined;
        }
    };

    /* Internals  ==================================================================== */

    private markHealthy = () => {
        OtaRecoveryModule.markHealthy();
        this.healthyUpdateId = this.getRunningUpdate().updateId;
    };

    private channelOf = (manifest: Manifest): UpdateChannel => {
        const channel = manifest?.extra?.xaman?.channel;
        return Object.values(UpdateChannel).includes(channel as UpdateChannel)
            ? (channel as UpdateChannel)
            : UpdateChannel.Embedded;
    };

    /**
     * The server sent something else than what this request accepts: never let it run
     */
    private guard = async (fetched: Updates.UpdateFetchResult, accepted: UpdateChannel[]) => {
        if (!fetched.isNew || fetched.isRollBackToEmbedded) {
            return;
        }
        const manifest = fetched.manifest as Manifest;
        if (!accepted.includes(this.channelOf(manifest))) {
            await this.refuse(manifest, `channel ${this.channelOf(manifest)}`);
        }
    };

    private refuse = async (manifest: Manifest, reason: string) => {
        // wipes every downloaded update before the next launch; the GA update comes back later
        await OtaRecoveryModule.scheduleRevert(manifest?.id ?? null, Number(manifest?.extra?.xaman?.otaId) || 0);
        throw new Error(`Refused a downloaded update: ${reason}`);
    };

    private isBlocked = async (manifest: Manifest): Promise<boolean> => {
        const state = await this.getRecoveryState();
        const otaId = Number(manifest?.extra?.xaman?.otaId) || 0;
        return (
            (!!manifest?.id && !!state?.blockedUpdateIds?.includes(manifest.id)) ||
            (otaId > 0 && !!state?.blockedOtaIds?.includes(otaId))
        );
    };

    /**
     * Sets every parameter on each request: values left behind by an install or exit that was
     * interrupted (app killed) never reach a later request.
     */
    private setRequestParams = async (request: Partial<ExtraParams>) => {
        const state = await this.getRecoveryState();

        const params: ExtraParams = {
            'ota-install': null,
            'ota-token': null,
            'ota-exit': null,
            'ota-blocked': state?.blockedUpdateIds?.length ? state.blockedUpdateIds.join(',') : null,
            'ota-reverted': this.revertedUpdateId,
            'ota-healthy': this.healthyUpdateId,
            ...request,
        };

        for (const [key, value] of Object.entries(params)) {
            await Updates.setExtraParamAsync(key, value);
        }
    };

    private enqueue = <T>(task: () => Promise<T>): Promise<T> => {
        const run = this.queue.then(task, task);
        this.queue = run.catch(() => undefined);
        return run;
    };
}

export default new UpdateService();
