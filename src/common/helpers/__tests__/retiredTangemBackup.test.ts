import { Alert } from 'react-native';
import { Navigation } from 'react-native-navigation';
import { AppScreens } from '@common/constants';
import { CoreRepository } from '@store/repositories';
import { AccountTypes } from '@store/types';
import NavigationService, { RootType } from '@services/NavigationService';
import NetworkService from '@services/NetworkService';
import { explainRetiredTangemBackup, isRetiredTangemBackup } from '../retiredTangemBackup';

jest.mock('@services/AccountService', () => ({
    __esModule: true,
    default: { updateAccountInfo: jest.fn(async () => undefined) },
}));
jest.mock('@store/repositories', () => ({ CoreRepository: { getDefaultAccount: jest.fn() } }));
jest.mock('@services/NetworkService', () => {
    const EventEmitter = require('events');
    return {
        __esModule: true,
        default: Object.assign(new EventEmitter(), { getNetwork: () => ({ id: 'main' }) }),
    };
});
jest.mock('@services/NavigationService', () => {
    const EventEmitter = require('events');
    return {
        __esModule: true,
        RootType: { DefaultRoot: 'app.DefaultRoot' },
        ComponentTypes: { Screen: 'Screen' },
        default: Object.assign(new EventEmitter(), {
            getCurrentRoot: jest.fn(),
            getCurrentOverlay: jest.fn(),
            getCurrentScreen: jest.fn(),
            getCurrentModal: jest.fn(),
        }),
    };
});
const flush = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
};
const selected: any = {
    address: 'rSelected',
    label: 'Original',
    type: AccountTypes.Tangem,
    isValid: () => true,
};
let buttons: any[];
let command: (name: string, params: any) => void;
let appeared: (event: any) => void;
beforeEach(() => {
    jest.clearAllMocks();
    buttons = [];
    jest.mocked(Navigation.popToRoot).mockResolvedValue('settings');
    jest.mocked(CoreRepository.getDefaultAccount).mockReturnValue(selected);
    delete selected.regularKey;
    jest.mocked(NavigationService.getCurrentRoot).mockReturnValue(RootType.DefaultRoot);
    jest.mocked(NavigationService.getCurrentOverlay).mockReturnValue(undefined);
    jest.mocked(NavigationService.getCurrentModal).mockReturnValue(undefined);
    jest.mocked(NavigationService.getCurrentScreen).mockReturnValue(AppScreens.TabBar.Home);
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, options) => {
        buttons = options!;
    });
    jest.mocked(Navigation.events).mockReturnValue({
        registerCommandListener: jest.fn((fn) => {
            command = fn as any;
            return { remove: jest.fn() };
        }),
        registerComponentDidAppearListener: jest.fn((fn) => {
            appeared = fn;
            return { remove: jest.fn() };
        }),
    } as any);
});
afterEach(() => {
    jest.restoreAllMocks();
});

describe('retired Tangem xApp entry', () => {
    it('matches only the retired identifier', () => {
        expect(isRetiredTangemBackup('xumm.tangem-backup')).toBe(true);
        expect(isRetiredTangemBackup('XUMM.TANGEM-BACKUP')).toBe(true);
        expect(isRetiredTangemBackup('xumm.other')).toBe(false);
    });
    it.each([undefined, { ...selected, type: AccountTypes.Regular }])(
        'offers only Close for %j',
        async (account) => {
            jest.mocked(CoreRepository.getDefaultAccount).mockReturnValue(account);
            const result = explainRetiredTangemBackup();
            await flush();
            expect(buttons).toHaveLength(1);
            buttons[0].onPress();
            await result;
            expect(Navigation.push).not.toHaveBeenCalled();
        },
    );
    it('explains the retired link before any account has been imported', async () => {
        jest.mocked(CoreRepository.getDefaultAccount).mockReturnValue(undefined);
        jest.mocked(NavigationService.getCurrentRoot).mockReturnValue('OnboardingRoot' as RootType);
        const result = explainRetiredTangemBackup();
        await flush();
        expect(buttons).toHaveLength(1);
        buttons[0].onPress();
        await result;
        expect(Navigation.push).not.toHaveBeenCalled();
    });
    it('opens the native wizard for a Tangem card without a regular key', async () => {
        const result = explainRetiredTangemBackup();
        await flush();
        expect(buttons).toHaveLength(2);
        buttons[1].onPress();
        await result;
        expect(Navigation.push).toHaveBeenCalledWith(
            AppScreens.TabBar.Home,
            expect.objectContaining({
                component: expect.objectContaining({
                    name: AppScreens.Account.Edit.BackupTangemCard,
                    passProps: expect.objectContaining({ account: selected }),
                }),
            }),
        );
        expect(Navigation.showModal).not.toHaveBeenCalled();
    });
    it('routes a linked card through Settings and Accounts after native tab appearance', async () => {
        selected.regularKey = 'rBackup';
        const result = explainRetiredTangemBackup();
        await flush();
        buttons[1].onPress();
        await flush();
        expect(Navigation.push).not.toHaveBeenCalled();
        appeared({ componentId: AppScreens.TabBar.Settings });
        await result;
        expect(Navigation.push).toHaveBeenNthCalledWith(
            1,
            AppScreens.TabBar.Settings,
            expect.objectContaining({
                component: expect.objectContaining({ name: AppScreens.Account.List }),
            }),
        );
        expect(Navigation.push).toHaveBeenNthCalledWith(
            2,
            AppScreens.Account.List,
            expect.objectContaining({
                component: expect.objectContaining({
                    name: AppScreens.Account.Edit.Settings,
                    passProps: expect.objectContaining({ account: selected }),
                }),
            }),
        );
    });
    it.each(['network', 'lock', 'account', 'root'])(
        'does not route a stale alert after %s changes',
        async (change) => {
            const result = explainRetiredTangemBackup();
            await flush();
            if (change === 'network') NetworkService.emit('networkChange', {} as any);
            if (change === 'lock') {
                command('showOverlay', { layout: { component: { name: AppScreens.Overlay.Lock } } });
            }
            if (change === 'root') NavigationService.emit('setRoot', RootType.DefaultRoot);
            if (change === 'account') {
                jest.mocked(CoreRepository.getDefaultAccount).mockReturnValue({
                    ...selected,
                    address: 'rOther',
                });
            }
            buttons[1].onPress();
            await result;
            expect(Navigation.push).not.toHaveBeenCalled();
        },
    );
    it('coalesces repeated links while an explanation is already open', async () => {
        const first = explainRetiredTangemBackup();
        const second = explainRetiredTangemBackup();
        expect(first).toBe(second);
        await flush();
        expect(Alert.alert).toHaveBeenCalledTimes(1);
        buttons[0].onPress();
        await first;
    });
});
