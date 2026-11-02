import { Alert } from 'react-native';
import { Navigation } from 'react-native-navigation';
import { get } from 'lodash';
import { AppScreens } from '@common/constants';
import NavigationService, { ComponentTypes, RootType } from '@services/NavigationService';
import NetworkService from '@services/NetworkService';
import AccountService from '@services/AccountService';
import { CoreRepository } from '@store/repositories';
import { AccountTypes } from '@store/types';
import Localize from '@locale';
import { captureTangemIdentifyRoute } from './tangemIdentifyRoute';

export const isRetiredTangemBackup = (identifier?: string) =>
    identifier?.toLowerCase() === 'xumm.tangem-backup';
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
        const invalidate = () => {
            interrupted = true;
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
            if (account?.type === AccountTypes.Tangem && root === RootType.DefaultRoot) {
                await AccountService.updateAccountInfo(account.address).catch(() => undefined);
            }
            if (!valid()) return;
            const next = await new Promise<boolean>((resolve) => {
                const buttons = [{ text: Localize.t('global.close'), onPress: () => resolve(false) }];
                if (account?.type === AccountTypes.Tangem && root === RootType.DefaultRoot) {
                    buttons.push({
                        text: Localize.t(
                            account.regularKey ? 'tangemBackup.accountSettings' : 'tangemBackup.setUp',
                        ),
                        onPress: () => resolve(true),
                    });
                }
                Alert.alert(Localize.t('tangemBackup.title'), Localize.t('tangemBackup.retired'), buttons, {
                    cancelable: true,
                    onDismiss: () => resolve(false),
                });
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
