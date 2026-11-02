import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState, SafeAreaView, StyleSheet, Text } from 'react-native';
import { utils } from 'xrpl-accountlib';
import { Card } from 'tangem-sdk-react-native';
import { AccessLevels, AccountTypes } from '@store/types';
import { GetWalletDerivedPublicKey } from '@common/utils/tangem';
import fixtures from '@common/utils/__tests__/fixtures/tangem.cards.json';
import { nativeBackupDependencies } from '@common/libs/tangemBackup/native';
import { BackupDependencies } from '@common/libs/tangemBackup/flow';
import Localize from '@locale';
import StyleService from '@services/StyleService';
import BackupTangemCard from '../BackupTangemCard';

jest.mock('@common/libs/tangemBackup/native', () => ({ nativeBackupDependencies: jest.fn() }));
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
let originalAppState: typeof AppState.currentState;
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
    originalAppState = AppState.currentState;
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
});
afterEach(() => {
    act(() => tree.unmount());
    Localize.setLocale('en');
    AppState.currentState = originalAppState;
    StyleService.setTheme('light');
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('Tangem backup wizard UI', () => {
    it('walks all three real steps, presents the native-asset fee, and waits for validation', async () => {
        expect(text()).toContain(Localize.t('tangemBackup.introBody'));
        await press();
        expect(text()).toContain('Step 1 of 3');
        await press();
        expect(text()).toContain('Step 2 of 3');
        deps.scan = jest.fn(async () => backup);
        await press();
        expect(text()).toContain(Localize.t('tangemBackup.verified'));
        expect(text()).toContain(Localize.t('tangemBackup.newCard'));
        await press();
        expect(text()).toContain('Step 3 of 3');
        expect(text()).toContain('0.00012 XAH');
        expect(text()).toContain('SetRegularKey');
        expect(text()).toContain('Xahau');
        expect(text()).toContain(Localize.t('tangemBackup.reviewBody'));
        await press();
        expect(text()).toContain(Localize.t('tangemBackup.checkingTitle'));
        root = { ...root, RegularKey: destination };
        await press();
        expect(text()).toContain(Localize.t('tangemBackup.doneBody'));
        expect(deps.sign).toHaveBeenCalledTimes(1);
    });
    it('automatically confirms a pending transaction without another signing scan', async () => {
        jest.useFakeTimers();
        AppState.currentState = 'active';
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
        AppState.currentState = 'active';
        await press();
        await press();
        deps.scan = jest.fn(async () => backup);
        await press();
        await press();
        await press();
        const before = jest.mocked(deps.lookup).mock.calls.length;
        AppState.currentState = 'background';
        await act(async () => {
            jest.advanceTimersByTime(2500);
            for (let i = 0; i < 12; i++) await Promise.resolve();
        });
        expect(deps.lookup).toHaveBeenCalledTimes(before);
        root = { ...root, RegularKey: destination };
        AppState.currentState = 'active';
        await act(async () => {
            jest.advanceTimersByTime(2500);
            for (let i = 0; i < 12; i++) await Promise.resolve();
        });
        expect(text()).toContain(Localize.t('tangemBackup.doneTitle'));
        expect(deps.sign).toHaveBeenCalledTimes(1);
    });
    it('uses the current Identify palette after switching theme, including styles loaded earlier', () => {
        act(() => { StyleService.setTheme('dark'); tree.update(<BackupTangemCard account={account} />); });
        expect(StyleSheet.flatten(tree.root.findByType(SafeAreaView).props.style).backgroundColor).toBe('#12131B');
        const title = tree.root.findAllByType(Text).find(node =>
            node.props.children === Localize.t('tangemBackup.introTitle'))!;
        expect(StyleSheet.flatten(title.props.style).color).toBe('#F0F1FA');
    });
    it('shows the wrong-card serial and keeps the scan action available', async () => {
        await press();
        deps.scan = jest.fn(async () => backup);
        await press();
        expect(text()).toContain(Localize.t('tangemBackup.wrongSource'));
        expect(text()).toContain('BACKUP');
        expect(tree.root.findByProps({ testID: 'backup-next' }).props.isDisabled).toBe(false);
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
