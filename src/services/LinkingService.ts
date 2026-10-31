/**
 * DeepLink service
 * handle app deep linking
 */
import { Linking, Alert, EmitterSubscription } from 'react-native';
import { OptionsModalPresentationStyle, OptionsModalTransitionStyle } from 'react-native-navigation';

import { StringTypeDetector, StringDecoder, StringType, XrplDestination, PayId } from 'xumm-string-decode';

import NavigationService, { ComponentTypes, RootType } from '@services/NavigationService';

import { Payload, PayloadOrigin, XAppOrigin } from '@common/libs/payload';
import { Navigator, AppScreenKeys } from '@common/helpers/navigator';
import { Prompt } from '@common/helpers/interface';
import { AppScreens } from '@common/constants';

import { NormalizeDestination } from '@common/utils/codec';
import { StringTypeCheck } from '@common/utils/string';
import { hasTangemIdentifyExit } from '@common/utils/tangemIdentifyNavigation';
import { captureTangemIdentifyRoute, TangemIdentifyRoute } from '@common/helpers/tangemIdentifyRoute';

import Localize from '@locale';
import { Payment, PaymentValidation } from '@common/libs/ledger/transactions';
import NetworkService from './NetworkService';
import { CoreRepository, NetworkRepository } from '@store/repositories';
import { TransactionTypes } from '@common/libs/ledger/types/enums';
// import { ReviewTransactionModalProps } from '@screens/Modal/ReviewTransaction';
import { AmountParser } from '@common/libs/ledger/parser/common';
// import { ReviewTransactionModalProps } from '@screens/Modal/ReviewTransaction';

/* Service  ==================================================================== */
class LinkingService {
    private initialURL?: string;
    private eventListener: EmitterSubscription | undefined;

    initialize = () => {
        return new Promise<void>((resolve, reject) => {
            try {
                // listen for root changes
                NavigationService.on('setRoot', this.onRootChange);
                // resolve
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    };

    onRootChange = (root: RootType) => {
        if (root === RootType.DefaultRoot) {
            // Listen for deep link as the app is open
            this.addDeepLinkListeners();
        } else {
            this.removeDeepLinkListeners();
        }
    };

    addDeepLinkListeners = () => {
        this.eventListener = Linking.addEventListener('url', this.handleDeepLink);
    };

    removeDeepLinkListeners = () => {
        if (this.eventListener) {
            this.eventListener.remove();
        }
    };

    checkInitialDeepLink = () => {
        // handle if app opens with link
        Linking.getInitialURL().then((url) => {
            if (url && this.initialURL !== url) {
                this.initialURL = url;

                setTimeout(() => {
                    this.handleDeepLink({ url });
                }, 100);
            }
        });
    };

    routeUser = async (
        screen: AppScreenKeys,
        passProps: any,
        options: any,
        screenType?: ComponentTypes,
        presentationDelay?: number,
        inheritedIdentify?: TangemIdentifyRoute,
    ) => {
        const delay = presentationDelay ?? 10;
        const currentOverlay = NavigationService.getCurrentOverlay();
        const identifyInitially = !!inheritedIdentify?.needsPreparation() || hasTangemIdentifyExit();
        const presentationAt = Date.now() + delay;
        const interruptedAddToken = currentOverlay === AppScreens.Overlay.AddToken;
        const routeRoot = interruptedAddToken ? NavigationService.getCurrentRoot() : undefined;
        let rootChanged = false;
        let identify = inheritedIdentify;
        const onRootChange = () => { rootChanged = true; };
        const releaseGuard = () => {
            if (interruptedAddToken) NavigationService.off('setRoot', onRootChange);
            identify?.release();
        };
        const canRoute = () => !interruptedAddToken || (!rootChanged &&
            NavigationService.getCurrentRoot() === routeRoot &&
            NavigationService.getCurrentOverlay() !== AppScreens.Overlay.Lock);
        if (interruptedAddToken) NavigationService.on('setRoot', onRootChange);

        try {
            // Delayed routes also record context before a new Identify can open.
            if (!identify && (hasTangemIdentifyExit() || delay > 0)) {
                identify = captureTangemIdentifyRoute();
            }
            if (inheritedIdentify && !await inheritedIdentify.prepare()) {
                releaseGuard();
                return;
            }
            if (currentOverlay && currentOverlay !== AppScreens.Overlay.Lock) {
                await Navigator.dismissOverlay();
            }
            if (identify?.needsPreparation() && !await identify.prepare()) {
                releaseGuard();
                return;
            }
            if (interruptedAddToken) {
                // Unmount cancels AddToken's pending Review. Its own native cleanup releases this lease.
                await Navigator.waitForModalReservation(AppScreens.Modal.ReviewTransaction);
                if (!canRoute()) {
                    releaseGuard();
                    return;
                }
            }

            const type = screenType ?? NavigationService.getComponentType(screen);
            if (type === ComponentTypes.Modal || type === ComponentTypes.Screen) {
                const present = async () => {
                    try {
                        if (!identify && hasTangemIdentifyExit()) identify = captureTangemIdentifyRoute();
                        if (identify?.needsPreparation() && !await identify.prepare()) return;
                        if (!canRoute()) return;
                        if (type === ComponentTypes.Modal) Navigator.showModal(screen, passProps, options);
                        else Navigator.push(screen, passProps, options);
                    } finally {
                        releaseGuard();
                    }
                };
                const remainingDelay = identifyInitially
                    ? Math.max(0, presentationAt - Date.now()) : delay;
                if (remainingDelay > 0) {
                    setTimeout(() => {
                        present().catch((error) => {
                            Alert.alert(Localize.t('global.error'), error?.message);
                        });
                    }, remainingDelay);
                } else await present();
            } else releaseGuard();
        } catch (error) {
            releaseGuard();
            throw error;
        }
    };

    private showDeepLinkModal = (
        screen: AppScreenKeys,
        passProps: any,
        options: any,
        delay?: number,
        identify?: TangemIdentifyRoute,
    ): Promise<void> => {
        const presentationDelay = delay ?? 0;
        if (identify || hasTangemIdentifyExit()) {
            return this.routeUser(screen, passProps, options, ComponentTypes.Modal, presentationDelay, identify);
        }
        // Retain the existing direct presentation and delays outside Identify.
        if (presentationDelay > 0) {
            const delayedIdentify = captureTangemIdentifyRoute();
            setTimeout(() => {
                const present = async () => {
                    try {
                        if (delayedIdentify.needsPreparation() && !await delayedIdentify.prepare()) return;
                        Navigator.showModal(screen, passProps, options);
                    } finally {
                        delayedIdentify.release();
                    }
                };
                present().catch((error) => { Alert.alert(Localize.t('global.error'), error?.message); });
            }, presentationDelay);
            return Promise.resolve();
        }
        return Navigator.showModal(screen, passProps, options).then(() => undefined);
    };

    handlePayloadReference = async (uuid: string, entryIdentify?: TangemIdentifyRoute) => {
        const identify = entryIdentify?.fork();
        let identifyTransferred = false;
        try {
            // check if uuid is valid uuidv4 string
            if (!StringTypeCheck.isValidUUID(uuid)) {
                return;
            }

            // fetch the payload
            const payload = await Payload.from(uuid, PayloadOrigin.DEEP_LINK);

            // review the transaction
            identifyTransferred = true;
            await this.routeUser(
                AppScreens.Modal.ReviewTransaction,
                { payload },
                { modalPresentationStyle: 'fullScreen' },
                ComponentTypes.Modal,
                10,
                identify,
            );
        } catch (error: any) {
            if (!identifyTransferred && identify && !await identify.prepare()) return;
            Alert.alert(Localize.t('global.error'), error?.message, [{ text: 'OK' }], { cancelable: false });
        } finally {
            // routeUser owns its presentation guard after scheduling the timer.
            // An invalid UUID or failed fetch never transfers that ownership.
            if (!identifyTransferred) identify?.release();
        }
    };

    handleSignedTransaction = (txblob: string) => {
        Alert.alert(
            Localize.t('global.signedTransaction'),
            Localize.t('global.signedTransactionDetectedSubmit'),
            [
                {
                    text: Localize.t('global.cancel'),
                },
                {
                    text: Localize.t('global.submit'),
                    onPress: () => {
                        this.routeUser(
                            AppScreens.Modal.Submit,
                            { txblob },
                            { modalPresentationStyle: 'fullScreen' },
                            ComponentTypes.Modal,
                        );
                    },
                    style: 'default',
                },
            ],
            { cancelable: false },
        );
    };

    handleXrplDestination = async (
        destination: XrplDestination & PayId,
        entryIdentify?: TangemIdentifyRoute,
    ): Promise<any> => {
        const identify = entryIdentify?.fork();
        try {
            return await this.routeXrplDestination(destination, identify);
        } finally {
            identify?.release();
        }
    };

    private routeXrplDestination = async (
        destination: XrplDestination & PayId,
        identify?: TangemIdentifyRoute,
    ): Promise<any> => {
        if (destination.payId) {
            await this.routeUser(
                AppScreens.Transaction.Payment,
                {
                    scanResult: {
                        to: destination.payId,
                    },
                },
                {},
                ComponentTypes.Screen,
                10,
                identify?.fork(),
            );
            return;
        }

        const { to, tag } = NormalizeDestination(destination);

        const _continue = async () => {
            if (identify && !await identify.prepare()) return;
            // console.log('c', to, tag);
            // console.log('continue');
            // Traditional regular payment
            // await this.routeUser(
            //     AppScreens.Transaction.Payment,
            //     {
            //         scanResult: {
            //             to,
            //             tag,
            //         },
            //         amount,
            //     },
            //     {},
            //     ComponentTypes.Screen,
            // );
            // We do partial now
            // console.log(to, tag, amount, destination.currency, destination.issuer);

            const payment = new Payment({
                TransactionType: TransactionTypes.Payment,
                Account: CoreRepository.getDefaultAccount().address,
                Destination: to,
                Amount: !destination?.amount
                    ? new AmountParser(1, false).nativeToDrops().toString()
                    : destination?.currency && destination?.issuer
                      ? {
                            currency: destination?.currency,
                            issuer: destination?.issuer,
                            value: String(destination?.amount),
                        }
                      : new AmountParser(destination.amount || 0, false).nativeToDrops().toString(),
            });

            // const p = Payload.build(
            //     {
            //         TransactionType: TransactionTypes.Payment,
            //         Account: CoreRepository.getDefaultAccount().address,
            //         Destination: to,
            //         Amount: !destination?.amount
            //             ? '1'
            //             : destination?.currency && destination?.issuer
            //               ? {
            //                     currency: destination?.currency,
            //                     issuer: destination?.issuer,
            //                     value: String(destination?.amount),
            //                 }
            //               : new AmountParser(destination.amount || 0).nativeToDrops().toString(),
            //     },
            //     undefined, // Custom instruction
            //     true, // Submit
            //     true, // Pathfinding
            // );

            // console.log(p.getTransaction().JsonForSigning);
            // console.log(p.getTransaction().JsonRaw);

            if (typeof tag !== 'undefined' && tag !== 0) {
                payment.DestinationTag = Number(destination.tag);
            }

            // payment.Flags = {
            //     tfPartialPayment: true,
            // };

            // console.log(destination);
            if (
                destination?.invoiceid &&
                String(destination?.invoiceid)
                    .trim()
                    .match(/^[A-F0-9]{64}$/i)
            ) {
                payment.InvoiceID = destination.invoiceid.trim();
            }

            // console.log('x', payment);

            // // set the amount
            // if (typeof destination.currency === 'string') {
            //     // IOU
            //     // if issuer has transfer fee and sender/destination is not issuer, add partial payment flag
            // } else {
            //     payment.DeliverMin = {
            //         currency: NetworkService.getNativeAsset(),
            //         value: amount,
            //     };
            // }

            // set the calculated and selected fee
            // payment.Fee = {
            //     currency: NetworkService.getNativeAsset(),
            //     value: new AmountParser(selectedFee!.value).dropsToNative().toFixed(),
            // };

            // // set memo if any
            // if (memo) {
            //     payment.Memos = [Memo.Encode(memo)];
            // } else if (payment.Memos) {
            //     payment.Memos = [];
            // }

            // console.log(payment);
            // validate payment for all possible mistakes
            try {
                await PaymentValidation(payment);
                // console.log(validation);
            } catch (error: any) {
                // console.log(error);
                if (identify && !await identify.prepare()) return;
                Alert.alert(Localize.t('global.error'), error?.message, [{ text: 'OK' }], { cancelable: false });
                return;
            }

            // console.log('e');

            // sign the transaction and then submit
            // await payment.sign(source!).then(this.submit);
            const payload = Payload.build(
                {
                    ...payment.JsonForSigning,
                    ...(!destination?.amount ? { Amount: '0' } : {}),
                    // ^^ If no amount specified we allow user to enter
                },
                undefined, // Custom instruction
                true, // Submit
                true, // Pathfinding
            );

            await this.showDeepLinkModal(
                AppScreens.Modal.ReviewTransaction,
                {
                    payload,
                    // onResolve: (e) => console.log('yesyes', e), // Done here
                    // onClose: (e) => console.log('lolno', e), // Done here
                },
                { modalPresentationStyle: OptionsModalPresentationStyle.fullScreen },
                0,
                identify?.fork(),
            );
        };

        // console.log('a');

        if (destination?.network) {
            const currentNetwork = NetworkService.getNetwork();
            if (destination.network !== currentNetwork?.key) {
                const wantsNetwork = await NetworkRepository.findBy('key', destination.network.toUpperCase());
                if (wantsNetwork?.[0]?.key) {
                    if (identify && !await identify.prepare()) return;
                    // Once the confirmation is shown, Continue is a new user
                    // action. Its route still checks any newly opened Identify.
                    identify?.release();
                    identify = undefined;
                    // eslint-disable-next-line consistent-return
                    return Navigator.showAlertModal({
                        type: 'warning',
                        title: Localize.t('global.switchNetwork'),
                        text: Localize.t('settings.disableDeveloperModeRevertNetworkWarning', {
                            currentNetwork: currentNetwork.name,
                            defaultNetwork: wantsNetwork[0].name,
                        }),
                        buttons: [
                            {
                                text: Localize.t('global.cancel'),
                                type: 'dismiss',
                                light: true,
                            },
                            {
                                text: Localize.t('global.continue'),
                                onPress: async () => {
                                    // console.log('switchnetwork, then request');
                                    await NetworkService.switchNetwork(wantsNetwork[0]);
                                    requestAnimationFrame(() => {
                                        _continue();
                                    });
                                },
                                type: 'continue',
                                light: false,
                            },
                        ],
                    });
                }
            }
        }
        // console.log('b');
        // eslint-disable-next-line consistent-return
        return _continue();
    };

    handleXAPPLink = async (
        url: string,
        parsed: { xapp: string; params: any },
        entryIdentify?: TangemIdentifyRoute,
    ) => {
        const { xapp, params } = parsed;

        if (!xapp) return;

        const identify = entryIdentify?.fork();
        let identifyTransferred = false;
        try {
            let delay = 0;
            // if already in xapp try to load the xApp from notification
            if (NavigationService.getCurrentModal() === AppScreens.Modal.XAppBrowser) {
                await Navigator.dismissModal();
                // looks like a bug in navigation library, need to add a delay before showing the modal
                delay = 300;
            }

            setTimeout(() => {
                this.routeUser(
                    AppScreens.Modal.XAppBrowser,
                    {
                        identifier: xapp,
                        origin: XAppOrigin.DEEP_LINK,
                        originData: { url },
                        params,
                    },
                    {
                        modalTransitionStyle: OptionsModalTransitionStyle.coverVertical,
                        modalPresentationStyle: OptionsModalPresentationStyle.fullScreen,
                    },
                    ComponentTypes.Modal,
                    10,
                    identify,
                ).catch((error) => { Alert.alert(Localize.t('global.error'), error?.message); });
            }, delay);
            identifyTransferred = true;
        } finally {
            if (!identifyTransferred) identify?.release();
        }
    };

    handleAlternativeSeedCodec = (parsed: {
        name: string;
        alphabet: string | boolean;
        params?: Record<string, unknown>;
    }, identify?: TangemIdentifyRoute) => {
        const { alphabet } = parsed;
        if (alphabet) {
            this.routeUser(
                AppScreens.Account.Import,
                {
                    alternativeSeedAlphabet: parsed,
                },
                {},
                ComponentTypes.Screen,
                10,
                identify?.fork(),
            );
        }
    };

    handleXamanFeature = (parsed: { feature: string; type: string; params?: Record<string, unknown> }) => {
        const { feature, type } = parsed;

        // Feature: allow import of Secret Numbers without Checksum
        if (feature === 'secret' && type === 'offline-secret-numbers') {
            Prompt(
                Localize.t('global.warning'),
                Localize.t('account.importSecretWithoutChecksumWarning'),
                [
                    {
                        text: Localize.t('global.cancel'),
                    },
                    {
                        text: Localize.t('global.continue'),
                        style: 'destructive',
                        onPress: () => {
                            this.routeUser(
                                AppScreens.Account.Import,
                                {
                                    importOfflineSecretNumber: true,
                                },
                                {},
                                ComponentTypes.Screen,
                            );
                        },
                    },
                ],
                { type: 'default' },
            );
        }
    };

    handleTransactionTemplate = (parsed: any, entryIdentify?: TangemIdentifyRoute) => {
        let errorMsg = Localize.t('scan.theQRIsNotWhatWeExpect');

        try {
            const str = Buffer.from(String(parsed?.jsonhex || ''), 'hex').toString('utf-8');
            const json = JSON.parse(str);

            // resolve the network this template is intended for, without NetworkID the template
            // targets XRPL networks (id <= 1024) as these cannot include NetworkID in txn
            let templateNetwork;

            if (typeof json?.NetworkID === 'undefined') {
                if (NetworkService.getNetwork().networkId > 1024) {
                    errorMsg = Localize.t('payload.payloadForceNetworkError');
                    throw new Error('Invalid network');
                }
            } else {
                templateNetwork = NetworkRepository.findOne({ networkId: json.NetworkID });

                if (!templateNetwork) {
                    errorMsg = Localize.t('payload.payloadForceNetworkError');
                    throw new Error('Invalid network');
                }

                // NetworkID is populated at signing time based on the connected network
                delete json.NetworkID;
            }

            if (json?.TransactionType === 'TrustSet') {
                // the template unaltered: sign() refuses a ledger field the review cannot show
                const payload = Payload.build(
                    { ...json },
                    Localize.t('asset.addingAssetReserveDescription', {
                        ownerReserve: NetworkService.getNetworkReserve().OwnerReserve,
                        nativeAsset: NetworkService.getNativeAsset(),
                    }),
                );

                if (templateNetwork) {
                    // review flow will offer switching if not connected to the declared network
                    payload.meta.force_network = templateNetwork.key;
                }

                this.showDeepLinkModal(
                    AppScreens.Modal.ReviewTransaction,
                    { payload },
                    { modalPresentationStyle: OptionsModalPresentationStyle.fullScreen },
                    800,
                    entryIdentify?.fork(),
                ).catch((error) => {
                    Alert.alert(Localize.t('global.error'), error?.message);
                });

                return;
            }

            // AccountSet / Invoke templates: Debug/dev-client only AND developer
            // mode. Never ship this path in Release — a tricked user could enable
            // developer mode and scan a hostile QR.
            if (
                (json?.TransactionType === 'AccountSet' || json?.TransactionType === 'Invoke') &&
                __DEV__ &&
                CoreRepository.isDeveloperModeEnabled()
            ) {
                // the template unaltered: sign() refuses a ledger field the review cannot show
                const payload = Payload.build({ ...json });

                if (templateNetwork) {
                    payload.meta.force_network = templateNetwork.key;
                }

                this.showDeepLinkModal(
                    AppScreens.Modal.ReviewTransaction,
                    { payload },
                    { modalPresentationStyle: OptionsModalPresentationStyle.fullScreen },
                    800,
                    entryIdentify?.fork(),
                ).catch((error) => {
                    Alert.alert(Localize.t('global.error'), error?.message);
                });

                return;
            }

            throw new Error('Invalid transaction template');
        } catch (e) {
            //
        }

        const identify = entryIdentify?.fork();
        setTimeout(() => {
            const present = async () => {
                try {
                    if (identify && !await identify.prepare()) return;
                    Prompt(Localize.t('global.error'), errorMsg, [{ text: 'OK' }], {
                        cancelable: false,
                        type: 'default',
                    });
                } finally {
                    identify?.release();
                }
            };
            present().catch((error) => { Alert.alert(Localize.t('global.error'), error?.message); });
        }, 800);
    };

    private onAsyncDeepLinkError = (error: any) => {
        Alert.alert(Localize.t('global.error'), error?.message);
    };

    handle = (url: string, identify?: TangemIdentifyRoute) => {
        const detected = new StringTypeDetector(url);
        const parsed = new StringDecoder(detected).getAny();
        const identifyArgs: [] | [TangemIdentifyRoute] = identify ? [identify] : [];

        // the screen will handle the content
        switch (detected.getType()) {
            case StringType.XrplTransactionTemplate:
                this.handleTransactionTemplate(parsed, ...identifyArgs);
                break;
            case StringType.XummPayloadReference:
                this.handlePayloadReference(parsed.uuid, ...identifyArgs).catch(this.onAsyncDeepLinkError);
                break;
            case StringType.XrplSignedTransaction:
                this.handleSignedTransaction(parsed.txblob);
                break;
            case StringType.XrplDestination:
            case StringType.PayId:
                this.handleXrplDestination(parsed, ...identifyArgs).catch(this.onAsyncDeepLinkError);
                break;
            case StringType.XummXapp:
                this.handleXAPPLink(url, parsed, ...identifyArgs).catch(this.onAsyncDeepLinkError);
                break;
            case StringType.XrplAltFamilySeedAlphabet:
                this.handleAlternativeSeedCodec(parsed, ...identifyArgs);
                break;
            case StringType.XummFeature:
                this.handleXamanFeature(parsed);
                break;
            default:
                break;
        }
    };

    handleDeepLink = async ({ url }: { url: string }) => {
        // ignore if the app is not initialized or not url
        if (!url || typeof url !== 'string') return;

        if (hasTangemIdentifyExit()) {
            const identify = captureTangemIdentifyRoute();
            try {
                // Includes confirmation prompts that precede the destination route.
                if (await identify.prepare()) this.handle(url, identify);
            } catch (error: any) {
                Alert.alert(Localize.t('global.error'), error?.message);
            } finally {
                identify.release();
            }
        } else this.handle(url);
    };
}

export default new LinkingService();
