import { NativeModules } from 'react-native';

import { FirebaseMessagingTypes } from '@react-native-firebase/messaging';

import { AccountRepository, CoreRepository, NetworkRepository } from '@store/repositories';

import { AppScreens } from '@common/constants';
import { Navigator } from '@common/helpers/navigator';
import { Payload, PayloadOrigin, XAppOrigin } from '@common/libs/payload';

import PushNotificationsService from '../PushNotificationsService';
import NavigationService from '../NavigationService';
import NetworkService from '../NetworkService';

jest.mock('@react-native-firebase/messaging');

const { LocalNotificationModule } = NativeModules;

describe('PushNotificationsService', () => {
    const pushNotificationsService = PushNotificationsService;
    const navigationService = NavigationService;

    const signRequestMessage = {
        messageId: '1600090805361973',
        data: { category: 'SIGNTX', payload: 'c2625db5-cb34-4831-86d4-bf9f2d9285b7' },
        notification: {
            ios: { subtitle: '𝗭𝗮𝗹𝗮𝗻𝗱𝗼' },
            title: 'Sign request',
            sound: 'default',
            body: 'Payment: €100',
        },
        fcmOptions: {},
    } as FirebaseMessagingTypes.RemoteMessage;

    const notificationOpen = {
        messageId: '1600091878699703',
        data: { category: 'SIGNTX', payload: 'c2625db5-cb34-4831-86d4-bf9f2d9285b7' },
        notification: { body: 'Payment: €100', ios: { subtitle: 'Xaman' }, sound: 'default', title: 'Sign request' },
        fcmOptions: {},
    } as FirebaseMessagingTypes.RemoteMessage;

    it('should properly initialize', async () => {
        const spy = jest.spyOn(pushNotificationsService, 'createNotificationListeners');
        await pushNotificationsService.initialize();
        expect(spy).toBeCalled();
        expect(pushNotificationsService.initialized).toBe(true);
    });

    it('should request permission and receive it', async () => {
        const hasPermission = await pushNotificationsService.requestPermission();
        expect(hasPermission).toBe(true);
    });

    it('should return true when check for permission', async () => {
        const hasPermission = await pushNotificationsService.checkPermission();
        expect(hasPermission).toBe(true);
    });

    it('should get token from firebase', async () => {
        const token = await pushNotificationsService.getToken();
        expect(token).toBe('token');
    });

    it('should show sign request notification', async () => {
        const spy1 = jest.spyOn(LocalNotificationModule, 'complete');
        const spy2 = jest.spyOn(pushNotificationsService, 'emit');

        // @ts-ignore
        jest.replaceProperty(NavigationService, 'currentScreen', AppScreens.TabBar.Home);

        pushNotificationsService.handleNotification(signRequestMessage);

        expect(spy1).toBeCalledWith(signRequestMessage.messageId, true);
        expect(spy2).toBeCalledWith('signRequestUpdate');
    });

    it('should not show sign request when in review transaction screen', async () => {
        const spy1 = jest.spyOn(LocalNotificationModule, 'complete');

        // @ts-ignore
        jest.replaceProperty(navigationService, 'modals', [AppScreens.Modal.ReviewTransaction]);

        pushNotificationsService.handleNotification(signRequestMessage);

        expect(spy1).toBeCalledWith(signRequestMessage.messageId, false);
    });

    it('should handle opening sign request', async () => {
        // @ts-ignore
        jest.replaceProperty(navigationService, 'modals', []);

        const spy0 = jest.spyOn(Payload, 'from').mockImplementation(async () => {
            return new Payload();
        });
        const spy1 = jest.spyOn(Navigator, 'showModal');

        // call
        pushNotificationsService.handleNotificationOpen(notificationOpen);

        // wait
        await new Promise((resolve) => {
            setTimeout(resolve, 300);
        });

        expect(spy0).toBeCalledWith(notificationOpen?.data?.payload, PayloadOrigin.PUSH_NOTIFICATION);
        expect(spy1).toBeCalledWith(
            AppScreens.Modal.ReviewTransaction,
            { payload: expect.any(Payload), componentType: 'MODAL' },
            { modalPresentationStyle: 'fullScreen' },
        );

        spy0.mockRestore();
        spy1.mockRestore();
    });

    describe('OPENXAPP account and network switching', () => {
        const currentAccount = { address: 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY' };
        const targetAccount = { address: 'rwietsevLFg8XSmG3bEZzFein1g8RBqWDZ' };
        const currentNetwork = { key: 'MAINNET', name: 'XRPL' };
        const targetNetwork = { key: 'XAHAU', name: 'Xahau' };

        const openXAppMessage = (
            data: Record<string, string> = {},
            messageId = `xapp-${Math.random()}`,
        ): FirebaseMessagingTypes.RemoteMessage =>
            ({
                messageId,
                data: {
                    category: 'OPENXAPP',
                    xappIdentifier: 'xumm.support',
                    xappTitle: 'Support',
                    ...data,
                },
                notification: { title: 'xApp', body: 'Open xApp' },
                fcmOptions: {},
            }) as FirebaseMessagingTypes.RemoteMessage;

        const waitForRoute = () =>
            new Promise((resolve) => {
                setTimeout(resolve, 50);
            });

        let findAccount: jest.SpyInstance;
        let findNetwork: jest.SpyInstance;
        let getDefaultAccount: jest.SpyInstance;
        let setDefaultAccount: jest.SpyInstance;
        let getNetwork: jest.SpyInstance;
        let switchNetwork: jest.SpyInstance;
        let showModal: jest.SpyInstance;

        beforeEach(() => {
            // @ts-ignore
            jest.replaceProperty(navigationService, 'modals', []);

            findAccount = jest.spyOn(AccountRepository, 'findOne');
            findNetwork = jest.spyOn(NetworkRepository, 'findOne');
            getDefaultAccount = jest.spyOn(CoreRepository, 'getDefaultAccount').mockReturnValue(currentAccount as any);
            setDefaultAccount = jest.spyOn(CoreRepository, 'setDefaultAccount').mockImplementation(jest.fn());
            getNetwork = jest.spyOn(NetworkService, 'getNetwork').mockReturnValue(currentNetwork as any);
            switchNetwork = jest.spyOn(NetworkService, 'switchNetwork').mockResolvedValue(undefined);
            showModal = jest.spyOn(Navigator, 'showModal');
        });

        afterEach(() => {
            findAccount.mockRestore();
            findNetwork.mockRestore();
            getDefaultAccount.mockRestore();
            setDefaultAccount.mockRestore();
            getNetwork.mockRestore();
            switchNetwork.mockRestore();
            showModal.mockRestore();
        });

        it('opens the xApp without switching when account and network are absent', async () => {
            await pushNotificationsService.handleOpenXApp(openXAppMessage());
            await waitForRoute();

            expect(findAccount).not.toHaveBeenCalled();
            expect(findNetwork).not.toHaveBeenCalled();
            expect(setDefaultAccount).not.toHaveBeenCalled();
            expect(switchNetwork).not.toHaveBeenCalled();
            expect(showModal).toHaveBeenCalledWith(
                AppScreens.Modal.XAppBrowser,
                {
                    identifier: 'xumm.support',
                    title: 'Support',
                    origin: XAppOrigin.PUSH_NOTIFICATION,
                    originData: {
                        category: 'OPENXAPP',
                        xappIdentifier: 'xumm.support',
                        xappTitle: 'Support',
                    },
                    componentType: 'MODAL',
                },
                {
                    modalTransitionStyle: 'coverVertical',
                    modalPresentationStyle: 'fullScreen',
                },
            );
        });

        it('switches account and network and passes them into the xApp browser', async () => {
            findAccount.mockReturnValue(targetAccount);
            findNetwork.mockReturnValue(targetNetwork);

            await pushNotificationsService.handleOpenXApp(
                openXAppMessage({
                    account: targetAccount.address,
                    network: targetNetwork.key,
                }),
            );
            await waitForRoute();

            expect(findAccount).toHaveBeenCalledWith({ address: targetAccount.address });
            expect(findNetwork).toHaveBeenCalledWith({ key: targetNetwork.key });
            expect(setDefaultAccount).toHaveBeenCalledWith(targetAccount);
            expect(switchNetwork).toHaveBeenCalledWith(targetNetwork);
            expect(showModal).toHaveBeenCalledWith(
                AppScreens.Modal.XAppBrowser,
                expect.objectContaining({
                    identifier: 'xumm.support',
                    account: targetAccount,
                    network: targetNetwork,
                    origin: XAppOrigin.PUSH_NOTIFICATION,
                }),
                expect.any(Object),
            );
        });

        it('switches only the account when network is absent', async () => {
            findAccount.mockReturnValue(targetAccount);

            await pushNotificationsService.handleOpenXApp(
                openXAppMessage({
                    account: targetAccount.address,
                }),
            );
            await waitForRoute();

            expect(findNetwork).not.toHaveBeenCalled();
            expect(setDefaultAccount).toHaveBeenCalledWith(targetAccount);
            expect(switchNetwork).not.toHaveBeenCalled();
            expect(showModal).toHaveBeenCalledWith(
                AppScreens.Modal.XAppBrowser,
                expect.objectContaining({
                    account: targetAccount,
                }),
                expect.any(Object),
            );
            expect(showModal.mock.calls[0][1].network).toBeUndefined();
        });

        it('switches only the network when account is absent', async () => {
            findNetwork.mockReturnValue(targetNetwork);

            await pushNotificationsService.handleOpenXApp(
                openXAppMessage({
                    network: targetNetwork.key,
                }),
            );
            await waitForRoute();

            expect(findAccount).not.toHaveBeenCalled();
            expect(setDefaultAccount).not.toHaveBeenCalled();
            expect(switchNetwork).toHaveBeenCalledWith(targetNetwork);
            expect(showModal).toHaveBeenCalledWith(
                AppScreens.Modal.XAppBrowser,
                expect.objectContaining({
                    network: targetNetwork,
                }),
                expect.any(Object),
            );
            expect(showModal.mock.calls[0][1].account).toBeUndefined();
        });

        it('does not switch when the push account and network are already selected', async () => {
            findAccount.mockReturnValue(currentAccount);
            findNetwork.mockReturnValue(currentNetwork);

            await pushNotificationsService.handleOpenXApp(
                openXAppMessage({
                    account: currentAccount.address,
                    network: currentNetwork.key,
                }),
            );
            await waitForRoute();

            expect(setDefaultAccount).not.toHaveBeenCalled();
            expect(switchNetwork).not.toHaveBeenCalled();
            expect(showModal).toHaveBeenCalledWith(
                AppScreens.Modal.XAppBrowser,
                expect.objectContaining({
                    account: currentAccount,
                    network: currentNetwork,
                }),
                expect.any(Object),
            );
        });

        it('still opens and switches network when the account is not in the wallet', async () => {
            findAccount.mockReturnValue(undefined);
            findNetwork.mockReturnValue(targetNetwork);

            await pushNotificationsService.handleOpenXApp(
                openXAppMessage({
                    account: targetAccount.address,
                    network: targetNetwork.key,
                }),
            );
            await waitForRoute();

            expect(setDefaultAccount).not.toHaveBeenCalled();
            expect(switchNetwork).toHaveBeenCalledWith(targetNetwork);
            expect(showModal).toHaveBeenCalledWith(
                AppScreens.Modal.XAppBrowser,
                expect.objectContaining({
                    identifier: 'xumm.support',
                    network: targetNetwork,
                }),
                expect.any(Object),
            );
            expect(showModal.mock.calls[0][1].account).toBeUndefined();
        });

        it('still opens and switches account when the network is unknown', async () => {
            findAccount.mockReturnValue(targetAccount);
            findNetwork.mockReturnValue(undefined);

            await pushNotificationsService.handleOpenXApp(
                openXAppMessage({
                    account: targetAccount.address,
                    network: 'NOT_A_NETWORK',
                }),
            );
            await waitForRoute();

            expect(setDefaultAccount).toHaveBeenCalledWith(targetAccount);
            expect(switchNetwork).not.toHaveBeenCalled();
            expect(showModal).toHaveBeenCalledWith(
                AppScreens.Modal.XAppBrowser,
                expect.objectContaining({
                    identifier: 'xumm.support',
                    account: targetAccount,
                }),
                expect.any(Object),
            );
            expect(showModal.mock.calls[0][1].network).toBeUndefined();
        });

        it('does not open the xApp when the identifier is invalid', async () => {
            await pushNotificationsService.handleOpenXApp(
                openXAppMessage({
                    xappIdentifier: 'not a valid id',
                    account: targetAccount.address,
                    network: targetNetwork.key,
                }),
            );
            await waitForRoute();

            expect(setDefaultAccount).not.toHaveBeenCalled();
            expect(switchNetwork).not.toHaveBeenCalled();
            expect(showModal).not.toHaveBeenCalled();
        });
    });

    describe('TXPUSH account and network lookup', () => {
        const account = { address: 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY' };
        const network = { key: 'MAINNET', name: 'XRPL' };
        const hash = 'A'.repeat(64);

        const txMessage = (data: Record<string, string> = {}): FirebaseMessagingTypes.RemoteMessage =>
            ({
                messageId: `tx-${Math.random()}`,
                data: {
                    category: 'TXPUSH',
                    tx: hash,
                    account: account.address,
                    ...data,
                },
                notification: { title: 'Transaction', body: 'Open transaction' },
                fcmOptions: {},
            }) as FirebaseMessagingTypes.RemoteMessage;

        const waitForRoute = () =>
            new Promise((resolve) => {
                setTimeout(resolve, 50);
            });

        let findAccount: jest.SpyInstance;
        let findNetwork: jest.SpyInstance;
        let showModal: jest.SpyInstance;

        beforeEach(() => {
            // @ts-ignore
            jest.replaceProperty(navigationService, 'modals', []);
            // @ts-ignore
            jest.replaceProperty(navigationService, 'currentScreen', AppScreens.TabBar.Home);

            findAccount = jest.spyOn(AccountRepository, 'findOne');
            findNetwork = jest.spyOn(NetworkRepository, 'findOne');
            showModal = jest.spyOn(Navigator, 'showModal');
        });

        afterEach(() => {
            findAccount.mockRestore();
            findNetwork.mockRestore();
            showModal.mockRestore();
        });

        it('opens TransactionLoader with the resolved account and network', async () => {
            findAccount.mockReturnValue(account);
            findNetwork.mockReturnValue(network);

            await pushNotificationsService.handleOpenTx(
                txMessage({
                    network: network.key,
                }),
            );
            await waitForRoute();

            expect(showModal).toHaveBeenCalledWith(
                AppScreens.Modal.TransactionLoader,
                {
                    hash,
                    account,
                    network,
                    componentType: 'MODAL',
                },
                {},
            );
        });

        it('does not open TransactionLoader when the account is not in the wallet', async () => {
            findAccount.mockReturnValue(undefined);
            findNetwork.mockReturnValue(network);

            await pushNotificationsService.handleOpenTx(
                txMessage({
                    network: network.key,
                }),
            );
            await waitForRoute();

            expect(showModal).not.toHaveBeenCalled();
        });

        it('does not open TransactionLoader when the network key is unknown', async () => {
            findAccount.mockReturnValue(account);
            findNetwork.mockReturnValue(undefined);

            await pushNotificationsService.handleOpenTx(
                txMessage({
                    network: 'NOT_A_NETWORK',
                }),
            );
            await waitForRoute();

            expect(showModal).not.toHaveBeenCalled();
        });
    });
});
