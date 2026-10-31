import { InteractionManager } from 'react-native';
import NetworkRepository from '@store/repositories/network';
import CoreRepository from '@store/repositories/core';

import NetworkService, { NetworkStateStatus } from '../NetworkService';

import * as FeeUtils from '@common/utils/fee';

import { NetworkConfig } from '@common/constants';
import ProfileRepository from '@store/repositories/profile';
import {
    createNetworkDefinitions, DEFINITION_CACHE_VERSION, normalizeDefinitions,
} from '@common/libs/ledger/utils/normalizeDefinitions';
import xrplReply from '@common/libs/ledger/utils/__tests__/fixtures/definitions/live-xrpl.json';
import xahauReply from '@common/libs/ledger/utils/__tests__/fixtures/definitions/live-xahau.json';
import packageXrpl from '@common/libs/ledger/utils/__tests__/fixtures/definitions/package-xrpl.json';
import packageXahau from '@common/libs/ledger/utils/__tests__/fixtures/definitions/package-xahau.json';

describe('NetworkService', () => {
    const networkService = NetworkService;

    const coreSettings = {
        network: { baseReserve: 10, ownerReserve: 2, isFeatureEnabled: () => {}, definitions: {} },
    } as any;

    const profile = { deviceUUID: 'MOCKED_UUID' } as any;

    beforeAll(() => {
        const logFn = console.warn;
        jest.spyOn(console, 'warn').mockImplementation((...args) => {
            if (typeof args[0] === 'string' && args[0].match(/server_definitions got invalid/)) {
                return;
            }

            logFn(...args);
        });
    });

    afterAll(() => {
        jest.clearAllMocks();
    });

    it('should properly initialize', async () => {
        ProfileRepository.getProfile = jest.fn(() => profile);

        await networkService.initialize(coreSettings);

        // check  sets network reserves
        expect(networkService.getNetworkReserve()).toStrictEqual({
            BaseReserve: 10,
            OwnerReserve: 2,
        });
    });

    describe('update network definitions', () => {
        let send: jest.SpyInstance;
        let update: jest.SpyInstance;
        const network = (extra = {}) => ({
            id: 'object_id', networkId: 1337, nativeAsset: { asset: 'XRP' },
            isFeatureEnabled: jest.fn(), ...extra,
        });
        beforeEach(() => {
            jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
            jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback: any) => {
                callback();
                return { then: Promise.resolve().then.bind(Promise.resolve()), cancel: jest.fn() } as any;
            });
            (networkService as any).definitionsCache.clear();
            jest.replaceProperty(networkService, 'network', network() as any);
            send = jest.spyOn(networkService, 'send');
            update = jest.spyOn(NetworkRepository, 'update').mockImplementation((data) => {
                if (networkService.network?.id === data.id) {
                    networkService.network!.definitionsString = data.definitionsString;
                }
                return data as any;
            });
        });
        afterEach(() => {
            send.mockRestore();
            update.mockRestore();
            jest.mocked(InteractionManager.runAfterInteractions).mockRestore();
            jest.clearAllTimers();
            jest.useRealTimers();
            jest.clearAllMocks();
        });

        it.each([
            ['live XRPL', xrplReply], ['live Xahau', xahauReply],
            ['package XRPL', packageXrpl], ['package Xahau', packageXahau],
        ])('stores complete %s metadata and builds a usable schema', async (_name, reply) => {
            send.mockResolvedValue(reply);
            await networkService.updateNetworkDefinitions();
            expect(send).toHaveBeenCalledWith({ command: 'server_definitions' });
            const stored = JSON.parse(update.mock.calls[0][0].definitionsString);
            const expected = normalizeDefinitions(reply);
            expected.TRANSACTION_TYPES.SignIn = 999;
            expect(stored).toEqual({ ...expected, __xamanDefinitionVersion: DEFINITION_CACHE_VERSION,
                __xamanDefinitionsCheckedAt: Date.now(), __xamanDefinitionsEndpoint: '' });
            expect(createNetworkDefinitions(stored).field.TransactionType.associatedType).toBeDefined();
        });

        it.each([null, 'invalid', {}, { error: 'failed' }, { hash: 'new', FIELDS: [] }])(
            'keeps the previous cache on an invalid response %p', async (reply) => {
                const cached = { ...normalizeDefinitions(xrplReply),
                    __xamanDefinitionVersion: DEFINITION_CACHE_VERSION };
                jest.replaceProperty(networkService, 'network', network({ definitions: cached }) as any);
                send.mockResolvedValue(reply);
                await networkService.updateNetworkDefinitions();
                expect(update).not.toHaveBeenCalled();
                expect(networkService.network!.definitions).toBe(cached);
            },
        );

        it('accepts a hash-only response only for a complete expired cache', async () => {
            const cached = { ...normalizeDefinitions(xrplReply),
                __xamanDefinitionVersion: DEFINITION_CACHE_VERSION,
                __xamanDefinitionsCheckedAt: Date.now() - 61 * 60 * 1000, __xamanDefinitionsEndpoint: '' };
            jest.replaceProperty(networkService, 'network', network({ definitions: cached }) as any);
            send.mockResolvedValue({ hash: cached.hash });
            await networkService.updateNetworkDefinitions();
            expect(send).toHaveBeenCalledWith({ command: 'server_definitions', hash: cached.hash });
            expect(update).toHaveBeenCalledTimes(1);
            expect(JSON.parse(update.mock.calls[0][0].definitionsString).__xamanDefinitionsCheckedAt).toBe(Date.now());
        });

        it('fetches full metadata for an old cache even when the server hash is unchanged', async () => {
            const cached = normalizeDefinitions(xrplReply);
            delete cached.ACCOUNT_SET_FLAGS;
            delete cached.TRANSACTION_FLAGS_INDICES;
            jest.replaceProperty(networkService, 'network', network({ definitions: cached }) as any);
            send.mockResolvedValue(xrplReply);
            await networkService.updateNetworkDefinitions();
            expect(send).toHaveBeenCalledWith({ command: 'server_definitions' });
            const stored = JSON.parse(update.mock.calls[0][0].definitionsString);
            expect(stored.hash).toBe(cached.hash);
            expect(stored.ACCOUNT_SET_FLAGS).toBeDefined();
            expect(stored.TRANSACTION_FLAGS_INDICES.AccountSet).toEqual(stored.ACCOUNT_SET_FLAGS);
        });

        it('uses a small hash check for a complete older cache without a freshness record', async () => {
            const cached = { ...normalizeDefinitions(xrplReply), __xamanDefinitionVersion: DEFINITION_CACHE_VERSION };
            jest.replaceProperty(networkService, 'network',
                network({ definitionsString: JSON.stringify(cached) }) as any);
            send.mockResolvedValue({ hash: cached.hash });
            await networkService.updateNetworkDefinitions();
            expect(send).toHaveBeenCalledWith({ command: 'server_definitions', hash: cached.hash });
            expect(networkService.getNetworkDefinitions().getHash()).toBe(cached.hash);
            expect(JSON.parse(update.mock.calls[0][0].definitionsString).__xamanDefinitionsCheckedAt).toBe(Date.now());
        });

        it('does not send a hash from an incomplete or corrupt cache', async () => {
            const current = network({ definitions: { hash: 'old',
                __xamanDefinitionVersion: DEFINITION_CACHE_VERSION } });
            jest.replaceProperty(networkService, 'network', current as any);
            send.mockResolvedValue(xrplReply);
            await networkService.updateNetworkDefinitions();
            expect(send).toHaveBeenLastCalledWith({ command: 'server_definitions' });
            (current as any).definitionsString = '{invalid JSON';
            await networkService.updateNetworkDefinitions();
            expect(send).toHaveBeenLastCalledWith({ command: 'server_definitions' });
            expect(update).toHaveBeenCalledTimes(2);
        });

        it('retains an old schema object when a new response is stored', async () => {
            const cached = normalizeDefinitions(xrplReply);
            jest.replaceProperty(networkService, 'network', network({ definitions: cached }) as any);
            const previous = networkService.getNetworkDefinitions();
            const next = normalizeDefinitions(xrplReply);
            next.TRANSACTION_TYPES.FutureTransaction = 4094;
            next.hash = 'changed';
            send.mockResolvedValue(next);
            await networkService.updateNetworkDefinitions();
            expect(previous.transactionNames).not.toContain('FutureTransaction');
            expect(cached.TRANSACTION_TYPES.SignIn).toBeUndefined();
            expect(createNetworkDefinitions(JSON.parse(update.mock.calls[0][0].definitionsString))
                .transactionNames).toContain('FutureTransaction');
        });

        it('reuses a schema only for the same network, stored JSON and native asset', () => {
            const current = network({ definitionsString: JSON.stringify(normalizeDefinitions(xrplReply)) });
            jest.replaceProperty(networkService, 'network', current as any);
            const first = networkService.getNetworkDefinitions();
            expect(networkService.getNetworkDefinitions()).toBe(first);
            current.id = 'another_network';
            expect(networkService.getNetworkDefinitions()).not.toBe(first);
            const other = networkService.getNetworkDefinitions();
            const changed = normalizeDefinitions(xrplReply);
            changed.TRANSACTION_TYPES.FutureTransaction = 4094;
            current.definitionsString = JSON.stringify(changed);
            expect(networkService.getNetworkDefinitions()).not.toBe(other);
            expect(networkService.getNetworkDefinitions().transactionNames).toContain('FutureTransaction');
        });

        const fresh = (extra = {}) => ({ ...normalizeDefinitions(xrplReply),
            __xamanDefinitionVersion: DEFINITION_CACHE_VERSION,
            __xamanDefinitionsCheckedAt: Date.now(), __xamanDefinitionsEndpoint: '', ...extra });
        const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

        it('uses a fresh persistent cache across app boots without any definitions request', async () => {
            const stored = JSON.stringify(fresh({ __xamanDefinitionsCheckedAt: Date.now() - 30 * 60 * 1000 }));
            jest.replaceProperty(networkService, 'network', network({ definitionsString: stored }) as any);
            await networkService.updateNetworkDefinitions();
            const parsed = networkService.getNetworkDefinitions();
            expect(networkService.getRawNetworkDefinitions()).toBe((parsed as any).rawDefinitions);
            // A new process has the same Realm string, but no parsed objects.
            (networkService as any).definitionsCache.clear();
            await networkService.updateNetworkDefinitions();
            expect(networkService.getNetworkDefinitions().getHash()).toBe(parsed.getHash());
            expect(send).not.toHaveBeenCalled();
            expect(update).not.toHaveBeenCalled();
        });

        it('checks an expired hash, renews freshness, and retains the parsed instance', async () => {
            const cached = fresh({ __xamanDefinitionsCheckedAt: Date.now() - 60 * 60 * 1000 });
            jest.replaceProperty(networkService, 'network',
                network({ definitionsString: JSON.stringify(cached) }) as any);
            const parsed = networkService.getNetworkDefinitions();
            send.mockResolvedValue({ hash: cached.hash });
            await networkService.updateNetworkDefinitions();
            expect(send).toHaveBeenCalledWith({ command: 'server_definitions', hash: cached.hash });
            expect(networkService.getNetworkDefinitions()).toBe(parsed);
            (networkService as any).definitionsCache.clear();
            await networkService.updateNetworkDefinitions();
            expect(send).toHaveBeenCalledTimes(1);
            expect(networkService.getRawNetworkDefinitions().FIELDS).toEqual(cached.FIELDS);
        });

        it('can check for a new transaction type before the normal expiry without a full download', async () => {
            const cached = fresh();
            jest.replaceProperty(networkService, 'network',
                network({ definitionsString: JSON.stringify(cached) }) as any);
            send.mockResolvedValue({ hash: cached.hash });
            await networkService.updateNetworkDefinitions();
            expect(send).not.toHaveBeenCalled();
            await networkService.updateNetworkDefinitions(true);
            expect(send).toHaveBeenCalledWith({ command: 'server_definitions', hash: cached.hash });
            expect(update).toHaveBeenCalledTimes(1);
        });

        it('keeps expired definitions usable when offline and does not extend their freshness', async () => {
            const stored = JSON.stringify(fresh({ __xamanDefinitionsCheckedAt: Date.now() - 61 * 60 * 1000 }));
            jest.replaceProperty(networkService, 'network', network({ definitionsString: stored }) as any);
            const parsed = networkService.getNetworkDefinitions();
            send.mockRejectedValue(new Error('offline'));
            await networkService.updateNetworkDefinitions();
            expect(networkService.getNetworkDefinitions()).toBe(parsed);
            expect(networkService.network!.definitionsString).toBe(stored);
            expect(update).not.toHaveBeenCalled();
        });

        it('does not treat a timestamp in the future as fresh after a clock change', async () => {
            const cached = fresh({ __xamanDefinitionsCheckedAt: Date.now() + 60 * 60 * 1000 });
            jest.replaceProperty(networkService, 'network',
                network({ definitionsString: JSON.stringify(cached) }) as any);
            send.mockResolvedValue({ hash: cached.hash });
            await networkService.updateNetworkDefinitions();
            expect(send).toHaveBeenCalledTimes(1);
        });

        it('keeps parsed definitions for both networks when switching back, even with the same hash', () => {
            const a = network({ id: 'network-a', definitionsString: JSON.stringify(fresh()) });
            const b = network({ id: 'network-b', nativeAsset: { asset: 'XAH' },
                definitionsString: JSON.stringify({ ...normalizeDefinitions(xahauReply), hash: fresh().hash }) });
            jest.replaceProperty(networkService, 'network', a as any);
            const parsedA = networkService.getNetworkDefinitions();
            jest.replaceProperty(networkService, 'network', b as any);
            const parsedB = networkService.getNetworkDefinitions();
            expect(parsedB.transactionFlagsIndices!.AccountSet.asfAllowTrustLineClawback).toBe(17);
            jest.replaceProperty(networkService, 'network', a as any);
            expect(networkService.getNetworkDefinitions()).toBe(parsedA);
            expect(parsedA.transactionFlagsIndices!.AccountSet.asfAllowTrustLineClawback).toBe(16);
            jest.replaceProperty(networkService, 'network', b as any);
            expect(networkService.getNetworkDefinitions()).toBe(parsedB);
        });

        it('shares one pending request for the same network, node and connection', async () => {
            let answer!: (value: any) => void;
            send.mockReturnValue(new Promise(resolve => { answer = resolve; }));
            const first = networkService.updateNetworkDefinitions();
            const second = networkService.updateNetworkDefinitions();
            expect(second).toBe(first);
            await settle();
            expect(send).toHaveBeenCalledTimes(1);
            answer(xrplReply);
            await first;
            expect(update).toHaveBeenCalledTimes(1);
            const ready = networkService.getNetworkDefinitions();
            await networkService.updateNetworkDefinitions();
            expect(send).toHaveBeenCalledTimes(1);
            expect(networkService.getNetworkDefinitions()).toBe(ready);
        });

        it('ignores a delayed response from the previous network', async () => {
            let answer!: (value: any) => void;
            send.mockReturnValue(new Promise(resolve => { answer = resolve; }));
            const pending = networkService.updateNetworkDefinitions();
            await settle();
            jest.replaceProperty(networkService, 'network', network({ id: 'network-b',
                definitionsString: JSON.stringify(normalizeDefinitions(xahauReply)) }) as any);
            answer(xrplReply);
            await pending;
            expect(update).not.toHaveBeenCalled();
            expect(networkService.getNetworkDefinitions().transactionNames).toContain('ClaimReward');
        });

        it('a new connection starts its own check and an old reply cannot cancel or replace it', async () => {
            let oldAnswer!: (value: any) => void;
            let newAnswer!: (value: any) => void;
            send.mockReturnValueOnce(new Promise(resolve => { oldAnswer = resolve; }))
                .mockReturnValueOnce(new Promise(resolve => { newAnswer = resolve; }));
            const old = networkService.updateNetworkDefinitions();
            await settle();
            const priorConnection = networkService.connection;
            jest.replaceProperty(networkService, 'connection', {} as any);
            const next = networkService.updateNetworkDefinitions();
            await settle();
            expect(send).toHaveBeenCalledTimes(2);
            oldAnswer(xrplReply);
            await old;
            expect(networkService.updateNetworkDefinitions()).toBe(next);
            const changed = { ...normalizeDefinitions(xrplReply), hash: 'new-connection-hash' };
            newAnswer(changed);
            await next;
            expect(update).toHaveBeenCalledTimes(1);
            expect(networkService.getNetworkDefinitions().getHash()).toBe(changed.hash);
            jest.replaceProperty(networkService, 'connection', priorConnection);
        });

        it('checks a new node even while the same connection has an older request pending', async () => {
            let oldAnswer!: (value: any) => void;
            send.mockReturnValueOnce(new Promise(resolve => { oldAnswer = resolve; }))
                .mockResolvedValueOnce(xrplReply);
            const old = networkService.updateNetworkDefinitions();
            await settle();
            (networkService as any).connectedEndpoint = 'wss://other.example';
            await networkService.updateNetworkDefinitions();
            oldAnswer(xrplReply);
            await old;
            expect(send).toHaveBeenCalledTimes(2);
            expect(update).toHaveBeenCalledTimes(1);
            expect(JSON.parse(update.mock.calls[0][0].definitionsString).__xamanDefinitionsEndpoint)
                .toBe('wss://other.example');
            (networkService as any).connectedEndpoint = undefined;
        });

        it('refreshes an expired active network, and cancels the timer when disconnected', async () => {
            const cached = fresh();
            jest.replaceProperty(networkService, 'network',
                network({ definitionsString: JSON.stringify(cached) }) as any);
            const priorConnection = networkService.connection;
            jest.replaceProperty(networkService, 'connection', {} as any);
            networkService.setConnectionStatus(NetworkStateStatus.Connected);
            send.mockResolvedValue({ hash: cached.hash });
            await networkService.updateNetworkDefinitions();
            expect(send).not.toHaveBeenCalled();
            await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
            expect(send).toHaveBeenCalledTimes(1);
            networkService.setConnectionStatus(NetworkStateStatus.Disconnected);
            await jest.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
            expect(send).toHaveBeenCalledTimes(1);
            jest.replaceProperty(networkService, 'connection', priorConnection);
        });


        it('returns from a network switch before preparing definitions after interactions', async () => {
            const tasks: Array<() => void> = [];
            jest.mocked(InteractionManager.runAfterInteractions).mockImplementation((callback: any) => {
                tasks.push(callback);
                return { cancel: jest.fn(), then: jest.fn() } as any;
            });
            const core = jest.spyOn(CoreRepository, 'setDefaultNetwork').mockImplementation(jest.fn());
            const connect = jest.spyOn(networkService, 'connect').mockImplementation(jest.fn());
            const destroy = jest.spyOn(networkService, 'destroyConnection').mockImplementation(jest.fn());
            const selected = network({ id: { toString: () => 'switched', equals: () => false },
                name: 'Selected network', defaultNode: { endpoint: '' }, definitionsString: JSON.stringify(fresh()) });
            await networkService.switchNetwork(selected as any);
            expect(connect).toHaveBeenCalledTimes(1);
            expect(tasks).toHaveLength(1);
            const refresh = networkService.updateNetworkDefinitions();
            expect(tasks).toHaveLength(1); // the same preparation is shared with the refresh
            expect(send).not.toHaveBeenCalled();
            tasks.shift()!();
            await refresh;
            expect(send).not.toHaveBeenCalled();
            expect(networkService.getNetworkDefinitions().getHash()).toBe(fresh().hash);
            core.mockRestore();
            connect.mockRestore();
            destroy.mockRestore();
        });

        it('retries a failed refresh after one minute while retaining the stale schema', async () => {
            const cached = fresh({ __xamanDefinitionsCheckedAt: Date.now() - 61 * 60 * 1000 });
            jest.replaceProperty(networkService, 'network',
                network({ definitionsString: JSON.stringify(cached) }) as any);
            const priorConnection = networkService.connection;
            jest.replaceProperty(networkService, 'connection', {} as any);
            networkService.setConnectionStatus(NetworkStateStatus.Connected);
            const parsed = networkService.getNetworkDefinitions();
            send.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ hash: cached.hash });
            await networkService.updateNetworkDefinitions();
            expect(networkService.getNetworkDefinitions()).toBe(parsed);
            expect(update).not.toHaveBeenCalled();
            await jest.advanceTimersByTimeAsync(59 * 1000);
            expect(send).toHaveBeenCalledTimes(1);
            await jest.advanceTimersByTimeAsync(1000);
            expect(send).toHaveBeenCalledTimes(2);
            expect(update).toHaveBeenCalledTimes(1);
            networkService.setConnectionStatus(NetworkStateStatus.Disconnected);
            jest.replaceProperty(networkService, 'connection', priorConnection);
        });

    });

    describe('calculate fee', () => {
        describe('Not Hooks enabled network', () => {
            let isFeatureEnabledSpy: any;
            let prepareTxForHookFeeSpy: any;

            beforeAll(() => {
                // set the network as normal network without hooks amendment
                isFeatureEnabledSpy = jest
                    .spyOn(networkService.network!, 'isFeatureEnabled')
                    .mockImplementation(() => false);
                prepareTxForHookFeeSpy = jest
                    .spyOn(FeeUtils, 'PrepareTxForHookFee')
                    .mockImplementation(() => 'SIGNED_TX');
            });

            afterAll(() => {
                isFeatureEnabledSpy.mockRestore();
                prepareTxForHookFeeSpy.mockRestore();
            });

            it('should return right calculated available fees', async () => {
                // normal network fees
                const spy0 = jest.spyOn(networkService, 'send').mockImplementation(() =>
                    Promise.resolve({
                        drops: { base_fee: '15' },
                    } as any),
                );

                const availableFees = await networkService.getAvailableNetworkFee({});

                expect(availableFees).toStrictEqual({
                    availableFees: [
                        { type: 'LOW', value: '15' },
                        { type: 'MEDIUM', value: '20' },
                        { type: 'HIGH', value: '30' },
                    ],
                    feeHooks: 0,
                    suggested: 'LOW',
                });

                spy0.mockRestore();
            });
        });

        describe('Hooks enabled network', () => {
            let isFeatureEnabledSpy: any;
            let prepareTxForHookFeeSpy: any;

            beforeAll(() => {
                // set the network as hook enabled network
                isFeatureEnabledSpy = jest
                    .spyOn(networkService.network!, 'isFeatureEnabled')
                    .mockImplementation(() => true);
                prepareTxForHookFeeSpy = jest
                    .spyOn(FeeUtils, 'PrepareTxForHookFee')
                    .mockImplementation(() => 'SIGNED_TX');
            });

            afterAll(() => {
                isFeatureEnabledSpy.mockRestore();
                prepareTxForHookFeeSpy.mockRestore();
            });

            it('should return right calculated available fees', async () => {
                // normal network fees
                const spy0 = jest.spyOn(networkService, 'send').mockImplementation(() =>
                    Promise.resolve({
                        drops: {
                            base_fee: '6176',
                        },
                        fee_hooks_feeunits: '6186',
                    } as any),
                );

                const availableFees = await networkService.getAvailableNetworkFee({
                    TransactionType: 'Payment',
                });

                expect(availableFees).toStrictEqual({
                    availableFees: [
                        { type: 'LOW', value: '6176' },
                        { type: 'MEDIUM', value: '7500' },
                        { type: 'HIGH', value: '11000' },
                    ],
                    feeHooks: 10,
                    suggested: 'LOW',
                });

                spy0.mockRestore();
            });
        });
    });
    describe('normalize endpoint', () => {
        test('Should append ORIGIN and userId for cluster endpoints', () => {
            const endpoint = NetworkConfig.clusterEndpoints[0];
            expect(networkService.normalizeEndpoint(endpoint)).toBe(
                `${endpoint}${networkService.Origin}?user_id=${profile.deviceUUID}`,
            );
        });

        test('Should use custom proxy for non-whitelisted endpoints and append userId', () => {
            const endpoint = 'wss://mycustomnetwork.dev';
            expect(networkService.normalizeEndpoint(endpoint)).toBe(
                `${NetworkConfig.customNodeProxy}/${endpoint.replace('wss://', '')}?user_id=${profile.deviceUUID}`,
            );
        });

        test('Should return the endpoint if it is in the whitelisted networks', () => {
            const endpoint = 'wss://s2.ripple.com';
            expect(networkService.normalizeEndpoint(endpoint)).toBe(endpoint);
        });

        test('Should connect to Xahau testnet directly instead of the custom-node proxy', () => {
            expect(networkService.normalizeEndpoint('wss://xahau-test.net')).toBe('wss://xahau-test.net');
        });

        test('Should append ORIGIN and userId for RPC hosts listed as cluster endpoints', () => {
            const rpcClusterEndpoints = [
                'wss://rpc.xrpl-labs.com',
                'wss://rpc.xahau.network',
                'wss://rpc.xahau-test.net',
            ];
            for (const endpoint of rpcClusterEndpoints) {
                expect(networkService.normalizeEndpoint(endpoint)).toBe(
                    `${endpoint}${networkService.Origin}?user_id=${profile.deviceUUID}`,
                );
            }
        });

        test('Should return the endpoint if it is a direct RPC URL', () => {
            for (const endpoint of NetworkConfig.directRpcEndpoints) {
                if (NetworkConfig.clusterEndpoints.includes(endpoint)) {
                    continue;
                }
                expect(networkService.normalizeEndpoint(endpoint)).toBe(endpoint);
            }
        });
    });

    describe('connected endpoint', () => {
        const defaultEndpoint = 'wss://xrplcluster.com';
        const fallbackEndpoint = 'wss://rpc.xrpl-labs.com';

        beforeEach(() => {
            jest.replaceProperty(networkService, 'network', {
                key: 'MAINNET',
                networkId: 0,
                type: 'Mainnet',
                defaultNode: { endpoint: defaultEndpoint },
            } as any);
            (networkService as any).connectedEndpoint = undefined;
        });

        test('Should fall back to the network default node before a live socket exists', () => {
            expect(networkService.getConnectedEndpoint()).toBe(defaultEndpoint);
            expect(networkService.getConnectionDetails().node).toBe(defaultEndpoint);
        });

        test('Should store the live socket URI on connect, including after uplink failover', () => {
            const origin = networkService.Origin;
            const liveUri = `${fallbackEndpoint}${origin}?user_id=${profile.deviceUUID}`;

            jest.replaceProperty(networkService, 'connection', {
                getState: () => ({
                    server: { uri: liveUri, publicKey: 'NODE_PUBKEY' },
                }),
            } as any);

            const reserveSpy = jest.spyOn(networkService, 'updateNetworkReserve').mockImplementation(jest.fn());
            const definitionsSpy = jest
                .spyOn(networkService, 'updateNetworkDefinitions')
                .mockImplementation(jest.fn());
            const featuresSpy = jest.spyOn(networkService, 'updateNetworkFeatures').mockImplementation(jest.fn());
            const statusSpy = jest.spyOn(networkService, 'setConnectionStatus').mockImplementation(jest.fn());

            networkService.onConnect();

            expect(networkService.getConnectedEndpoint()).toBe(fallbackEndpoint);
            expect(networkService.getConnectionDetails().node).toBe(fallbackEndpoint);
            expect(networkService.displayEndpoint(liveUri)).toBe(fallbackEndpoint);

            reserveSpy.mockRestore();
            definitionsSpy.mockRestore();
            featuresSpy.mockRestore();
            statusSpy.mockRestore();
        });
    });

    describe('hasSwap', () => {
        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('does not throw when profile or swapNetworks is missing', () => {
            const spy = jest.spyOn(ProfileRepository, 'getProfile');
            spy.mockReturnValue(undefined);
            expect(() => networkService.hasSwap()).not.toThrow();
            expect(networkService.hasSwap()).toBe(false);

            spy.mockReturnValue({} as any);
            expect(() => networkService.hasSwap()).not.toThrow();
            expect(networkService.hasSwap()).toBe(false);
        });

        it('is true when the current network key is listed', () => {
            jest.replaceProperty(networkService, 'network', { key: 'MAINNET' } as any);
            jest.spyOn(ProfileRepository, 'getProfile').mockReturnValue({ swapNetworks: 'MAINNET,XAHAU' } as any);
            expect(networkService.hasSwap()).toBe(true);
        });
    });

    describe('prepareForAccountLookup', () => {
        const service = networkService as any;
        let connection: any;

        beforeEach(() => {
            connection = service.connection;
        });

        afterEach(() => {
            service.connection = connection;
            jest.useRealTimers();
            jest.restoreAllMocks();
        });

        it('leaves a socket that spoke within the last 8 seconds', async () => {
            const reconnect = jest.spyOn(networkService, 'reconnect').mockImplementation(() => undefined);
            service.connection = { getState: () => ({ online: true, secLastContact: 8 }) };

            await networkService.prepareForAccountLookup();

            expect(reconnect).not.toHaveBeenCalled();
        });

        it('reconnects when the socket has been quiet for more than 8 seconds', async () => {
            jest.useFakeTimers();
            const reconnect = jest.spyOn(networkService, 'reconnect').mockImplementation(() => undefined);
            service.connection = { getState: () => ({ online: true, secLastContact: 9 }) };

            const pending = networkService.prepareForAccountLookup();
            await jest.advanceTimersByTimeAsync(1500);
            await pending;

            expect(reconnect).toHaveBeenCalledTimes(1);
        });

        it('reconnects when the socket is offline', async () => {
            jest.useFakeTimers();
            const reconnect = jest.spyOn(networkService, 'reconnect').mockImplementation(() => undefined);
            service.connection = { getState: () => ({ online: false, secLastContact: 0 }) };

            const pending = networkService.prepareForAccountLookup();
            await jest.advanceTimersByTimeAsync(1500);
            await pending;

            expect(reconnect).toHaveBeenCalledTimes(1);
        });
    });
});
