import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';
import { utils } from 'xrpl-accountlib';
import { Card } from 'tangem-sdk-react-native';
import { AccessLevels, AccountTypes } from '@store/types';
import { GetWalletDerivedPublicKey } from '@common/utils/tangem';
import fixtures from '@common/utils/__tests__/fixtures/tangem.cards.json';
import { nativeBackupDependencies } from '@common/libs/tangemBackup/native';
import { BackupDependencies } from '@common/libs/tangemBackup/flow';
import Localize from '@locale';
import StyleService from '@services/StyleService';
import AppService, { AppStateStatus } from '@services/AppService';
import { Navigator } from '@common/helpers/navigator';
import BackupTangemCard from '../BackupTangemCard';

jest.mock('@services/AppService', () => ({
    __esModule: true,
    AppStateStatus: { Active: 'Active', Background: 'Background' },
    default: { currentAppState: 'Active' },
}));

jest.mock('@common/libs/tangemBackup/native', () => ({ nativeBackupDependencies: jest.fn() }));
jest.mock('@common/helpers/navigator', () => ({ Navigator: { showAlertModal: jest.fn(async () => 'alert') } }));
jest.mock('@services/NetworkService', () => {
    const EventEmitter = require('events');
    return {
        __esModule: true,
        default: Object.assign(new EventEmitter(), {
            getNativeAsset: () => 'XAH',
            getNetwork: () => ({ name: 'Xahau' }),
        }),
    };
});
jest.mock('@services/NavigationService', () => {
    const EventEmitter = require('events');
    return { __esModule: true, default: new EventEmitter() };
});
jest.mock('@services/LoggerService', () => ({ __esModule: true, default: { recordError: jest.fn() } }));
jest.mock('@components/General/Button', () => ({ Button: 'Button' }));
jest.mock('@components/General/Footer', () => ({ Footer: 'Footer' }));
jest.mock('@components/General/Header', () => ({ Header: 'Header' }));
jest.mock('@components/General/Icon', () => ({ Icon: 'Icon' }));
jest.mock('@components/General/Spacer', () => ({ Spacer: 'Spacer' }));

const sourceCard = fixtures.multiCurrency.android as unknown as Card;
const backup = { ...fixtures.normalED.android, cardId: 'BACKUP' } as unknown as Card;
const account: any = {
    address: utils.deriveAddress(GetWalletDerivedPublicKey(sourceCard)),
    label: 'Original',
    type: AccountTypes.Tangem,
    accessLevel: AccessLevels.Full,
    additionalInfo: sourceCard,
};
const destination = utils.deriveAddress(GetWalletDerivedPublicKey(backup));
let deps: BackupDependencies;
let root: any;
let tree: renderer.ReactTestRenderer;
let originalAppState: typeof AppService.currentAppState;
let scrollTo: jest.Mock;
const press = async () => {
    await act(async () => {
        await tree.root.findByProps({ testID: 'backup-next' }).props.onPress();
    });
};
const text = () =>
    tree.root
        .findAllByType(Text)
        .flatMap((node) => node.props.children)
        .join(' ')
        .replace(/\s+/g, ' ');
beforeEach(() => {
    originalAppState = AppService.currentAppState;
    jest.mocked(Navigator.showAlertModal).mockClear();
    StyleService.setTheme('light');
    Localize.setLocale('en');
    root = { Account: account.address, Sequence: 10, Balance: '100000000', Flags: 0, LedgerIndex: 1000 };
    deps = {
        network: () => ({ id: 'xahau', key: 'XAHAU', networkId: 21337, definitionsHash: 'test' }),
        valid: () => true,
        root: async () => root,
        ledger: () => ({ Fee: 12, LastLedger: 1000 }),
        fee: async () => '120',
        accounts: () => [],
        start: async () => undefined,
        stop: async () => undefined,
        scan: jest.fn(async () => sourceCard),
        confirmImport: jest.fn(async () => true),
        create: jest.fn(async () => backup),
        save: jest.fn(async (_card, address) => ({
            address,
            label: Localize.t('tangemBackup.title'),
            type: AccountTypes.Tangem,
        })),
        sign: jest.fn(async () => ({ id: 'HASH', signedTransaction: 'BLOB' })),
        submit: jest.fn(async () => ({})),
        lookup: jest.fn(async () => ({})),
        refresh: jest.fn(async () => undefined),
    };
    jest.mocked(nativeBackupDependencies).mockReturnValue(deps);
    act(() => {
        tree = renderer.create(<BackupTangemCard account={account} />);
    });
    scrollTo = tree.root.findByType(ScrollView).instance.scrollTo;
    scrollTo.mockClear();
});
afterEach(() => {
    act(() => tree.unmount());
    Localize.setLocale('en');
    AppService.currentAppState = originalAppState;
    StyleService.setTheme('light');
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('Tangem backup wizard UI', () => {
    it('guides both card scans and confirmation without technical transaction rows', async () => {
        jest.useFakeTimers();
        expect(text()).toContain(Localize.t('tangemBackup.introBody'));
        await press();
        expect(text()).toContain('Step 1 of 3');
        expect(tree.root.findByProps({ testID: 'backup-next' }).props).toMatchObject({
            label: Localize.t('tangemBackup.scanOriginal'),
            icon: 'IconScanCard',
        });
        await press();
        expect(text()).toContain('Step 2 of 3');
        expect(tree.root.findByProps({ testID: 'backup-next' }).props).toMatchObject({
            label: Localize.t('tangemBackup.scanBackup'),
            icon: 'IconScanCard',
        });
        deps.scan = jest.fn(async () => backup);
        await press();
        expect(text()).toContain(Localize.t('tangemBackup.verified'));
        expect(text()).toContain(Localize.t('tangemBackup.newCard'));
        await press();
        expect(text()).toContain('Step 3 of 3');
        expect(text()).not.toContain('0.00012 XAH');
        expect(text()).not.toContain('SetRegularKey');
        expect(text()).not.toContain('Xahau');
        expect(text()).toContain(Localize.t('tangemBackup.reviewBody'));
        expect(tree.root.findByProps({ testID: 'backup-next' }).props.label).toBe(Localize.t('global.confirm'));
        await press();
        expect(text()).toContain(Localize.t('tangemBackup.checkingTitle'));
        root = { ...root, RegularKey: destination };
        await act(async () => {
            jest.advanceTimersByTime(2500);
            for (let i = 0; i < 12; i++) await Promise.resolve();
        });
        expect(text()).toContain(Localize.t('tangemBackup.doneBody'));
        expect(deps.sign).toHaveBeenCalledTimes(1);
    });
    it('automatically confirms a pending transaction without another signing scan', async () => {
        jest.useFakeTimers();
        AppService.currentAppState = AppStateStatus.Active;
        await press();
        await press();
        deps.scan = jest.fn(async () => backup);
        await press();
        await press();
        await press();
        expect(text()).toContain(Localize.t('tangemBackup.checkingTitle'));
        root = { ...root, RegularKey: destination };
        await act(async () => {
            jest.advanceTimersByTime(2500);
            for (let i = 0; i < 12; i++) await Promise.resolve();
        });
        expect(text()).toContain(Localize.t('tangemBackup.doneTitle'));
        expect(deps.sign).toHaveBeenCalledTimes(1);
    });
    it('pauses automatic checks in the background and resumes without signing again', async () => {
        jest.useFakeTimers();
        AppService.currentAppState = AppStateStatus.Active;
        await press();
        await press();
        deps.scan = jest.fn(async () => backup);
        await press();
        await press();
        await press();
        const before = jest.mocked(deps.lookup).mock.calls.length;
        AppService.currentAppState = AppStateStatus.Background;
        await act(async () => {
            jest.advanceTimersByTime(2500);
            for (let i = 0; i < 12; i++) await Promise.resolve();
        });
        expect(deps.lookup).toHaveBeenCalledTimes(before);
        root = { ...root, RegularKey: destination };
        AppService.currentAppState = AppStateStatus.Active;
        await act(async () => {
            jest.advanceTimersByTime(2500);
            for (let i = 0; i < 12; i++) await Promise.resolve();
        });
        expect(text()).toContain(Localize.t('tangemBackup.doneTitle'));
        expect(deps.sign).toHaveBeenCalledTimes(1);
    });
    it('keeps a steady pending loader through multiple checks and transient connection errors', async () => {
        jest.useFakeTimers();
        await press();
        await press();
        deps.scan = jest.fn(async () => backup);
        await press();
        await press();
        await press();
        deps.root = jest
            .fn()
            .mockRejectedValueOnce(new Error('temporary offline'))
            .mockImplementation(async () => root);
        for (let i = 0; i < 3; i++) {
            expect(tree.root.findByProps({ testID: 'backup-confirming' }).findByType(ActivityIndicator)).toBeDefined();
            expect(tree.root.findAllByProps({ testID: 'backup-next' })).toHaveLength(0);
            expect(tree.root.findAllByProps({ testID: 'backup-error' })).toHaveLength(0);
            expect(text()).not.toContain(Localize.t('global.tryAgain'));
            await act(async () => {
                jest.advanceTimersByTime(2500);
                for (let n = 0; n < 12; n++) await Promise.resolve();
            });
        }
        root = { ...root, RegularKey: destination };
        await act(async () => {
            jest.advanceTimersByTime(2500);
            for (let n = 0; n < 12; n++) await Promise.resolve();
        });
        expect(text()).toContain(Localize.t('tangemBackup.doneTitle'));
        expect(tree.root.findAllByProps({ testID: 'backup-confirming' })).toHaveLength(0);
        expect(deps.sign).toHaveBeenCalledTimes(1);
        expect(deps.submit).toHaveBeenCalledTimes(1);
    });
    it('offers a deliberate status retry after automatic checks are exhausted without signing again', async () => {
        jest.useFakeTimers();
        await press();
        await press();
        deps.scan = jest.fn(async () => backup);
        await press();
        await press();
        await press();
        for (let i = 0; i < 30; i++) {
            await act(async () => {
                jest.advanceTimersByTime(2500);
                for (let n = 0; n < 12; n++) await Promise.resolve();
            });
        }
        expect(tree.root.findByProps({ testID: 'backup-next' }).props.label).toBe(Localize.t('global.tryAgain'));
        await press();
        expect(tree.root.findByProps({ testID: 'backup-confirming' })).toBeDefined();
        expect(deps.sign).toHaveBeenCalledTimes(1);
        expect(deps.submit).toHaveBeenCalledTimes(1);
    });
    it('reveals overflow with a scroll control and starts each new step at the top', async () => {
        const scroll = tree.root.findByProps({ testID: 'backup-scroll' });
        act(() => {
            scroll.props.onLayout({ nativeEvent: { layout: { height: 400 } } });
            scroll.props.onContentSizeChange(345, 700);
        });
        expect(tree.root.findByProps({ testID: 'backup-more' })).toBeDefined();
        act(() => tree.root.findByProps({ testID: 'backup-more' }).props.onPress());
        expect(scrollTo).toHaveBeenCalledWith({ y: 300, animated: true });
        act(() => scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 300 } } }));
        expect(tree.root.findAllByProps({ testID: 'backup-more' })).toHaveLength(0);
        await press();
        expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: false });
        act(() => scroll.props.onContentSizeChange(345, 350));
        expect(tree.root.findAllByProps({ testID: 'backup-more' })).toHaveLength(0);
    });
    it('uses the current Identify palette after switching theme, including styles loaded earlier', () => {
        act(() => {
            StyleService.setTheme('dark');
            tree.update(<BackupTangemCard account={account} />);
        });
        expect(StyleSheet.flatten(tree.root.findByType(SafeAreaView).props.style).backgroundColor).toBe('#12131B');
        const title = tree.root
            .findAllByType(Text)
            .find((node) => node.props.children === Localize.t('tangemBackup.introTitle'))!;
        expect(StyleSheet.flatten(title.props.style).color).toBe('#F0F1FA');
    });
    it('identifies the selected card by name in the error alert and keeps scanning available', async () => {
        await press();
        deps.scan = jest.fn(async () => backup);
        await press();
        expect(Navigator.showAlertModal).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'error',
                title: Localize.t('account.tangemDifferentCard'),
                text: Localize.t('tangemBackup.wrongSource', { name: account.label }),
            }),
        );
        const message = jest.mocked(Navigator.showAlertModal).mock.calls[0][0].text as string;
        expect(message).toContain(account.label);
        expect(message).not.toContain(sourceCard.cardId);
        expect(message).not.toContain('BACKUP');
        expect(message).not.toContain(Localize.t('account.tangemScannedAccount'));
        expect(tree.root.findAllByProps({ testID: 'backup-error' })).toHaveLength(0);
        expect(tree.root.findByProps({ testID: 'backup-next' }).props.isDisabled).toBe(false);
        act(() => tree.update(<BackupTangemCard account={account} />));
        expect(Navigator.showAlertModal).toHaveBeenCalledTimes(1);
        await press();
        expect(Navigator.showAlertModal).toHaveBeenCalledTimes(2);
    });
    it('does not truncate the full address or card serial', async () => {
        const nodes = tree.root
            .findAllByType(Text)
            .filter((node) => [account.address, sourceCard.cardId].includes(node.props.children));
        expect(nodes).toHaveLength(2);
        nodes.forEach((node) => {
            expect(node.props.selectable).toBe(true);
            expect(node.props.numberOfLines).toBeUndefined();
        });
    });
});
