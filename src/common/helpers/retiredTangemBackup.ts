import { Navigation } from 'react-native-navigation';
import { get } from 'lodash';
import { AppScreens } from '@common/constants';
import NavigationService, { ComponentTypes, RootType } from '@services/NavigationService';
import NetworkService from '@services/NetworkService';
import { CoreRepository } from '@store/repositories';
import { AccountTypes } from '@store/types';
import Localize from '@locale';
import { captureTangemIdentifyRoute } from './tangemIdentifyRoute';

export const isRetiredTangemBackup = (identifier?: string) => identifier?.toLowerCase() === 'xumm.tangem-backup';
let showing: Promise<void> | undefined;
const selectedNetworkId = () => {
    try {
        return NetworkService.getNetwork().id.toString();
    } catch {
        return undefined;
    }
};

/** Intercepts deep links, catalogue launches and xApp-to-xApp navigation before any token/URL request. */
export const explainRetiredTangemBackup = (): Promise<void> => {
    if (showing) return showing;
    showing = (async () => {
        const root = NavigationService.getCurrentRoot();
        const network = selectedNetworkId();
        const account = CoreRepository.getDefaultAccount();
        const address = account?.address;
        let interrupted = false;
        let cancelAlert: (() => void) | undefined;
        let alertDisappeared: { remove: () => void } | undefined;
        const invalidate = () => {
            interrupted = true;
            cancelAlert?.();
        };
        const route = captureTangemIdentifyRoute();
        const valid = () =>
            !interrupted &&
            NavigationService.getCurrentRoot() === root &&
            selectedNetworkId() === network &&
            NavigationService.getCurrentOverlay() !== AppScreens.Overlay.Lock &&
            CoreRepository.getDefaultAccount()?.address === address;
        NavigationService.on('setRoot', invalidate);
        NetworkService.on('networkChange', invalidate);
        const commands = Navigation.events().registerCommandListener((name, params) => {
            if (
                name === 'setRoot' ||
                (name === 'showOverlay' &&
                    [
                        get(params, 'layout.id'),
                        get(params, 'layout.data.name'),
                        get(params, 'layout.component.name'),
                    ].includes(AppScreens.Overlay.Lock))
            ) {
                invalidate();
            }
        });
        try {
            if (!(await route.prepare()) || !valid()) return;
            if (NavigationService.getCurrentModal() === AppScreens.Modal.XAppBrowser) {
                await Navigation.dismissModal(AppScreens.Modal.XAppBrowser);
                if (!valid()) return;
            }
            if (!valid()) return;
            const next = await new Promise<boolean>((resolve, reject) => {
                cancelAlert = () => resolve(false);
                alertDisappeared = Navigation.events().registerComponentDidDisappearListener((event) => {
                    if (event.componentName === AppScreens.Overlay.Alert) resolve(false);
                });
                const buttons = [
                    {
                        text: Localize.t('global.close'),
                        testID: 'retired-tangem-close',
                        onPress: () => resolve(false),
                        light: true,
                    },
                ];
                if (account?.type === AccountTypes.Tangem && root === RootType.DefaultRoot) {
                    buttons.push({
                        text: Localize.t(account.regularKey ? 'tangemBackup.accountSettings' : 'tangemBackup.setUp'),
                        testID: 'retired-tangem-setup',
                        onPress: () => resolve(true),
                        light: false,
                    });
                }
                const { Navigator } = require('./navigator') as typeof import('./navigator');
                Navigator.showAlertModal({
                    testID: 'retired-tangem-backup-alert',
                    type: 'info',
                    title: Localize.t('tangemBackup.title'),
                    text: Localize.t('tangemBackup.retired'),
                    buttons,
                    // The formatted alert calls onDismissed before its button callback.
                    onDismissed: () => {
                        Promise.resolve().then(() => resolve(false));
                    },
                })
                    .then((shown) => {
                        if (shown === false) resolve(false);
                    })
                    .catch(reject);
            });
            if (
                !next ||
                root !== RootType.DefaultRoot ||
                !valid() ||
                !account?.isValid() ||
                account.type !== AccountTypes.Tangem
            ) {
                return;
            }
            if (!(await route.prepare()) || !valid()) return;
            if (!account.regularKey) {
                const screen = NavigationService.getCurrentScreen();
                if (screen) {
                    await Navigation.push(screen, {
                        component: {
                            name: AppScreens.Account.Edit.BackupTangemCard,
                            id: AppScreens.Account.Edit.BackupTangemCard,
                            passProps: { account, componentType: ComponentTypes.Screen },
                        },
                    });
                }
                return;
            }
            // Rebuild the familiar Settings > Accounts > account navigation path.
            const settingsVisible = new Promise<boolean>((resolve) => {
                let timer: ReturnType<typeof setTimeout>;
                const listener = Navigation.events().registerComponentDidAppearListener((event) => {
                    if (event.componentId === AppScreens.TabBar.Settings) {
                        clearTimeout(timer);
                        listener.remove();
                        resolve(true);
                    }
                });
                timer = setTimeout(() => {
                    listener.remove();
                    resolve(false);
                }, 5000);
                Navigation.mergeOptions(RootType.DefaultRoot, {
                    bottomTabs: { currentTabId: 'bottomTab-Settings' },
                });
                Navigation.popToRoot(AppScreens.TabBar.Settings).catch(() => undefined);
                if (NavigationService.getCurrentScreen() === AppScreens.TabBar.Settings) {
                    clearTimeout(timer);
                    listener.remove();
                    resolve(true);
                }
            });
            if (!(await settingsVisible) || !valid()) return;
            await Navigation.push(AppScreens.TabBar.Settings, {
                component: {
                    name: AppScreens.Account.List,
                    id: AppScreens.Account.List,
                    passProps: { componentType: ComponentTypes.Screen },
                },
            });
            if (!valid()) return;
            await Navigation.push(AppScreens.Account.List, {
                component: {
                    name: AppScreens.Account.Edit.Settings,
                    id: AppScreens.Account.Edit.Settings,
                    passProps: { account, componentType: ComponentTypes.Screen },
                },
            });
        } finally {
            alertDisappeared?.remove();
            route.release();
            commands.remove();
            NavigationService.off('setRoot', invalidate);
            NetworkService.off('networkChange', invalidate);
        }
    })().finally(() => {
        showing = undefined;
    });
    return showing;
};
