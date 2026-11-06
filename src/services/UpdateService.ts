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
 * - Everything it decides goes to the session log (Settings > Advanced > Session log), prefixed
 *   "OTA updates:". Install tokens never do.
 * - Going back to the store version never leaves it "newer" than the updates (see exitDeveloperChannel),
 *   so a developer can install the same update again.
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

// how the session log names each channel
const CHANNEL_LABEL: Record<UpdateChannel, string> = {
    [UpdateChannel.Embedded]: 'store version',
    [UpdateChannel.Developer]: 'test',
    [UpdateChannel.General]: 'GA',
    [UpdateChannel.Exit]: 'public',
};

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
        if (this.started) {
            return;
        }
        this.started = true;

        if (!this.isEnabled()) {
            this.logger.debug('OTA updates: off in this build');
            return;
        }

        const running = this.getRunningUpdate();
        const state = await this.getRecoveryState();
        const emergency = running.isEmergencyLaunch ? ': EMERGENCY LAUNCH, the update failed to start' : '';
        this.logger.debug(
            `OTA updates: running ${this.describeRunning(running)}, store build ${running.runtimeVersion}${emergency}`,
        );
        if (state?.revertedUpdateId) {
            this.logger.warn(
                `OTA updates: update ${state.revertedUpdateId} was reverted to the store version before this ` +
                    'launch (by hand or by the launch watchdog); this device never installs it again',
            );
        }
        if (running.otaId > 0 && state && state.unhealthyLaunches > 1) {
            this.logger.warn(
                `OTA updates: ${state.unhealthyLaunches - 1} earlier launch(es) of this update did not reach a ` +
                    `healthy screen; it is reverted after ${state.watchdogLimit}`,
            );
        }
        if (state?.blockedOtaIds?.length || state?.blockedUpdateIds?.length) {
            this.logger.debug(
                `OTA updates: never installed again on this device: update(s) ${
                    state.blockedOtaIds?.join(', ') || '-'
                } (${state.blockedUpdateIds?.length ?? 0} id(s))`,
            );
        }
        if (state?.automatedTest) {
            // e2e runs must test the build itself, not whatever update is published
            this.logger.debug('OTA updates: automated test run, no checks');
            return;
        }

        setTimeout(this.markHealthy, HEALTHY_AFTER_MS);
        setTimeout(() => {
            this.checkAfterStart().catch((error) => {
                this.logger.warn('OTA updates: the check after start failed', error);
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
            this.logger.debug('OTA updates: developer mode is off but a test update runs: leaving it');
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
                this.logger.warn('OTA updates: rollback to the store version received; it applies on the next start');
                await Updates.fetchUpdateAsync();
                return true;
            }

            if (!result.isAvailable) {
                this.logger.debug('OTA updates: no new GA update');
                return false;
            }

            const offered = result.manifest as Manifest;
            if (this.channelOf(offered) !== UpdateChannel.General) {
                this.logger.warn(`OTA updates: ignoring ${this.describeManifest(offered)}: not a GA update`);
                return false;
            }

            // reverted on this device before (also when re-issued under a new id): never again,
            // whatever the server says
            if (await this.isBlocked(offered)) {
                this.logger.warn(`OTA updates: ignoring ${this.describeManifest(offered)}: reverted on this device before`);
                return false;
            }

            this.logger.debug(`OTA updates: downloading ${this.describeManifest(offered)}`);
            const fetched = await Updates.fetchUpdateAsync();
            await this.guard(fetched, [UpdateChannel.General]);
            this.logFetched(fetched);
            return fetched.isNew;
        });
    };

    /**
     * Developer mode: install one specific update (token from the backend developer list).
     * Returns true when it is ready; call reloadNow() to run it.
     */
    installDeveloperUpdate = (manifestId: string, installToken: string): Promise<boolean> => {
        return this.enqueue(async () => {
            this.logger.debug(`OTA updates: installing ${manifestId} by hand (developer mode)`);
            await this.setRequestParams({ 'ota-install': manifestId, 'ota-token': installToken });
            try {
                const fetched = await Updates.fetchUpdateAsync();
                if (fetched.isNew && (fetched.manifest as Manifest)?.id !== manifestId) {
                    await this.refuse(fetched.manifest as Manifest, 'not the requested update');
                }
                await this.guard(fetched, [UpdateChannel.Developer, UpdateChannel.General]);
                if (!fetched.isNew) {
                    this.logger.debug('OTA updates: not installed: this device already has that update or a newer one');
                }
                this.logFetched(fetched);
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
            const running = this.getRunningUpdate();
            if (!this.isEnabled() || running.channel !== UpdateChannel.Developer) {
                return false;
            }

            this.logger.debug(`OTA updates: leaving ${this.describeRunning(running)} for the public version`);
            await this.setRequestParams({ 'ota-exit': '1' });
            try {
                const fetched = await Updates.fetchUpdateAsync();
                if (fetched.isRollBackToEmbedded) {
                    // expo-updates stamps the store version with the directive's time, which would make
                    // every earlier update "older" on this phone. Clearing the downloaded updates at the
                    // next start gives the same store version without the stamp.
                    await OtaRecoveryModule.scheduleRevert(null, 0);
                    this.logger.debug('OTA updates: back to the store version from the next start');
                    return true;
                }
                await this.guard(fetched, [UpdateChannel.Exit, UpdateChannel.General]);
                if (!fetched.isNew) {
                    this.logger.warn('OTA updates: no public version received: the test update stays for now');
                }
                this.logFetched(fetched);
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
        this.logger.warn(
            `OTA updates: revert to the store version scheduled for ${this.describeRunning(running)}; ` +
                'it applies when the app opens again, and this device never installs that update again',
        );
    };

    /**
     * Clears every downloaded update at the next start without blocking any: the store version runs, and
     * any published update can be installed again (expo-updates only installs updates newer than what it
     * last applied). The caller asks the user to close and reopen the app.
     */
    resetUpdateStorage = async (): Promise<void> => {
        await OtaRecoveryModule.scheduleRevert(null, 0);
        this.logger.warn('OTA updates: downloaded updates are cleared at the next start (nothing blocked)');
    };

    /**
     * Run the downloaded update (or the store version after a rollback) now
     */
    reloadNow = (): Promise<void> => {
        this.logger.debug('OTA updates: restarting to run the downloaded update');
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
            this.logger.warn('OTA updates: unable to read the recovery state', error);
            return undefined;
        }
    };

    /* Internals  ==================================================================== */

    private markHealthy = () => {
        OtaRecoveryModule.markHealthy();
        const running = this.getRunningUpdate();
        this.healthyUpdateId = running.updateId;
        if (running.otaId > 0) {
            this.logger.debug(`OTA updates: ${this.describeRunning(running)} reached a healthy screen`);
        }
    };

    /** "update 12 (GA, <id>)" for a manifest, for the session log */
    private describeManifest = (manifest: Manifest): string => {
        const otaId = Number(manifest?.extra?.xaman?.otaId) || 0;
        return `update ${otaId} (${CHANNEL_LABEL[this.channelOf(manifest)]}, ${manifest?.id ?? 'no id'})`;
    };

    /** "the store version" or "update 12 (test, <id>)" for what runs, for the session log */
    private describeRunning = (running: RunningUpdate): string => {
        return running.otaId === 0
            ? 'the store version'
            : `update ${running.otaId} (${CHANNEL_LABEL[running.channel]}, ${running.updateId})`;
    };

    private logFetched = (fetched: Updates.UpdateFetchResult) => {
        if (fetched.isNew) {
            this.logger.debug(
                `OTA updates: ${this.describeManifest(fetched.manifest as Manifest)} downloaded; it runs from the next start`,
            );
        }
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
        this.logger.warn(`OTA updates: refused ${this.describeManifest(manifest)}: ${reason}; wiped before the next start`);
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
