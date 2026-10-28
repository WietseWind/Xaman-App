import NetworkRepository from '@store/repositories/network';

import NetworkService from '../NetworkService';

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
            jest.replaceProperty(networkService, 'network', network() as any);
            send = jest.spyOn(networkService, 'send');
            update = jest.spyOn(NetworkRepository, 'update').mockImplementation(jest.fn());
        });
        afterEach(() => {
            send.mockRestore();
            update.mockRestore();
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
            expect(stored).toEqual({ ...normalizeDefinitions(reply),
                __xamanDefinitionVersion: DEFINITION_CACHE_VERSION });
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

        it('accepts a hash-only response only for a complete current cache', async () => {
            const cached = { ...normalizeDefinitions(xrplReply),
                __xamanDefinitionVersion: DEFINITION_CACHE_VERSION };
            jest.replaceProperty(networkService, 'network', network({ definitions: cached }) as any);
            send.mockResolvedValue({ hash: cached.hash });
            await networkService.updateNetworkDefinitions();
            expect(send).toHaveBeenCalledWith({ command: 'server_definitions', hash: cached.hash });
            expect(update).not.toHaveBeenCalled();
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

        it('does not send a hash from an incomplete or corrupt cache', async () => {
            const current = network({ definitions: { hash: 'old',
                __xamanDefinitionVersion: DEFINITION_CACHE_VERSION } });
            jest.replaceProperty(networkService, 'network', current as any);
            send.mockResolvedValue(xrplReply);
            await networkService.updateNetworkDefinitions();
            expect(send).toHaveBeenLastCalledWith({ command: 'server_definitions' });
            Object.defineProperty(current, 'definitions', { get: () => { throw new Error('Invalid JSON'); } });
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
