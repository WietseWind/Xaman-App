import React from 'react';
import renderer, { act, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';
import { Navigation } from 'react-native-navigation';
import RNTangemSdk from 'tangem-sdk-react-native';

import StyleService from '@services/StyleService';
import LoggerService from '@services/LoggerService';
import { AccountRepository } from '@store/repositories';
import { AccountModel } from '@store/models';
import { AccountTypes } from '@store/types';
import { Images } from '@common/helpers/images';
import { prepareForTangemIdentifyNavigation } from '@common/utils/tangemIdentifyNavigation';
import { DefaultDerivationPaths } from '@common/utils/tangem';
import tangemCards from '@common/utils/__tests__/fixtures/tangem.cards.json';
import Localize from '@locale';
import { AppFonts } from '@theme';

import IdentifyTangemCardView from '../IdentifyTangemCard';

jest.mock('tangem-sdk-react-native', () => ({ __esModule: true, default: {
    startSession: jest.fn(), scanCard: jest.fn(), stopSession: jest.fn(),
} }));
jest.mock('react-native-navigation', () => ({ Navigation: { pop: jest.fn() } }));
jest.mock('@services/LoggerService', () => ({ __esModule: true, default: {
    recordError: jest.fn(), createLogger: () => ({ debug: jest.fn() }),
} }));
jest.mock('@store/repositories', () => ({ AccountRepository: { getAccounts: jest.fn() } }));
jest.mock('@store/repositories/core', () => ({ __esModule: true, default: { saveSettings: jest.fn() } }));
jest.mock('@common/helpers/device', () => ({
    GetLayoutInsets: () => ({ top: 20, bottom: 34 }), HasBottomNotch: () => true,
}));
// Keep the screen, theme, result classifier and exit barrier real. These leaf
// components expose their public props without native animation/image loading.
jest.mock('@components/General/Button', () => ({ Button: 'Button' }));
jest.mock('@components/General/Avatar', () => ({ Avatar: 'Avatar' }));
jest.mock('@components/General/Footer', () => ({ Footer: 'Footer' }));
jest.mock('@components/General/Header', () => ({ Header: 'Header' }));
jest.mock('@components/General/Icon', () => ({ Icon: 'Icon' }));
jest.mock('@components/General/Spacer', () => ({ Spacer: 'Spacer' }));

const selectedSerial = 'AC04000000000001024798';
const otherSerial = 'AC04000000000001028163';
const unknownSerial = 'AC04000000000001029999';
const selected = {
    address: 'rKymSQrwRF8DcwEzyAgNLMaaSKYSMfJNDY', label: 'Travel',
    type: AccountTypes.Tangem, additionalInfo: { cardId: selectedSerial },
};
const other = {
    address: 'rJhJRkh1cuG7T8biiGtMDNVVjYpAY71r9D', label: 'Savings',
    type: AccountTypes.Tangem, additionalInfo: { cardId: otherSerial },
};
const componentId = 'identify-instance-7';
const trees = new Set<ReactTestRenderer>();
const pending: Array<() => void> = [];

const deferred = <T,>() => {
    let resolve: (value: T) => void = () => undefined;
    let reject: (error: unknown) => void = () => undefined;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    pending.push(() => resolve(undefined as T));
    return { promise, resolve, reject };
};

const flush = async () => {
    for (let index = 0; index < 12; index++) await Promise.resolve();
};

const mount = () => {
    let tree: ReactTestRenderer;
    act(() => {
        tree = renderer.create(
            <IdentifyTangemCardView account={selected as unknown as AccountModel} componentId={componentId} />,
        );
    });
    trees.add(tree!);
    return { tree: tree!, view: tree!.getInstance() as IdentifyTangemCardView };
};

const unmount = (tree: ReactTestRenderer) => {
    act(() => tree.unmount());
    trees.delete(tree);
};

const button = (tree: ReactTestRenderer, testID: string) => tree.root.findByProps({ testID });
const text = (tree: ReactTestRenderer, value: string): ReactTestInstance =>
    tree.root.findAllByType(Text).find((node) => node.props.children === value)!;
const icons = (tree: ReactTestRenderer) => tree.root.findAllByType('Icon').map((node) => node.props.name);
const press = async (tree: ReactTestRenderer, testID: string) => {
    await act(async () => { await button(tree, testID).props.onPress(); await flush(); });
};

const expectFullText = (tree: ReactTestRenderer, value: string) => {
    const node = text(tree, value);
    expect(node).toBeDefined();
    expect(node.props.selectable).toBe(true);
    expect(node.props.numberOfLines).toBeUndefined();
    expect(node.props.ellipsizeMode).toBeUndefined();
    expect(StyleSheet.flatten(node.props.style).writingDirection).toBe('ltr');
};

beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(RNTangemSdk.startSession).mockReset().mockResolvedValue(undefined);
    jest.mocked(RNTangemSdk.scanCard).mockReset().mockResolvedValue({ cardId: selectedSerial } as any);
    jest.mocked(RNTangemSdk.stopSession).mockReset().mockResolvedValue(undefined);
    jest.mocked(Navigation.pop).mockReset().mockResolvedValue(componentId);
    jest.mocked(AccountRepository.getAccounts).mockReturnValue([selected, other] as any);
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    StyleService.setTheme('light');
});

afterEach(async () => {
    for (const tree of trees) unmount(tree);
    await act(async () => { pending.splice(0).forEach((resolve) => resolve()); await flush(); });
    await prepareForTangemIdentifyNavigation();
    jest.restoreAllMocks();
});

describe('Tangem Identify result content', () => {
    it('keeps the full selected address/serial in scrollable content and the actions in a safe-area footer', () => {
        const { tree } = mount();
        expectFullText(tree, selected.address);
        expectFullText(tree, selectedSerial);
        const scroll = tree.root.findByType(ScrollView);
        expect(scroll.findAllByType(Text).filter((node) =>
            node.props.testID === `identify-address-${selected.address}`)).toHaveLength(1);
        expect(scroll.findAllByType('Footer')).toHaveLength(0);
        expect(tree.root.findByType(SafeAreaView).findByType('Footer')).toBeDefined();
        const title = text(tree, Localize.t('account.identifyTangemStartTitle'));
        expect(StyleSheet.flatten(title.props.style).fontFamily).toBe(AppFonts.base.familyBold);
        expect(AppFonts.base.familyBold).toMatch(/Proxima/);
        expect(StyleSheet.flatten(text(tree, '💳 Travel').props.style).fontFamily).toBe(AppFonts.base.familyBold);
    });

    it('uses the actual light/dark hero assets through the theme service', () => {
        const { tree, view } = mount();
        expect(tree.root.findByType(Image).props.source).toEqual(Images.ImageIdentifyTangem);
        act(() => { StyleService.setTheme('dark'); view.forceUpdate(); });
        expect(tree.root.findByType(Image).props.source).toEqual(Images.ImageIdentifyTangemLight);
        expect(tree.root.findByType(Image).props.accessible).toBe(false);
    });

    it.each([
        ['match', selectedSerial, 'account.tangemRightCard'],
        ['known', otherSerial, 'account.tangemDifferentCard'],
        ['unknown', unknownSerial, 'account.tangemCardNotSaved'],
    ])('shows full identifiers for a %s result without truncation', async (outcome, serial, title) => {
        jest.mocked(RNTangemSdk.scanCard).mockResolvedValue({ cardId: serial } as any);
        const { tree } = mount();
        await press(tree, 'next-button');
        expect(text(tree, Localize.t(title))).toBeDefined();
        expectFullText(tree, selected.address);
        expectFullText(tree, selectedSerial);
        if (outcome !== 'match') expectFullText(tree, serial);
        if (outcome === 'known') expectFullText(tree, other.address);
        expect(icons(tree).includes('IconCheck')).toBe(outcome === 'match');
        if (outcome === 'unknown') {
            expect(icons(tree)).not.toContain('IconAlertTriangle');
            expect(text(tree, Localize.t('account.tangemCardNotImported'))).toBeDefined();
        }
    });

    it('does not show a successful match when a result has no outcome', () => {
        const { tree, view } = mount();
        act(() => view.setState({ phase: 'result', outcome: undefined }));
        expect(icons(tree)).not.toContain('IconCheck');
        expect(text(tree, Localize.t('account.tangemRightCard'))).toBeUndefined();
    });

    it.each(['ios', 'android'] as const)('shows the real XRP address from an unknown %s HD card', async (platform) => {
        const scannedCard = { ...tangemCards.multiCurrency[platform], cardId: unknownSerial };
        jest.mocked(RNTangemSdk.scanCard).mockResolvedValue(scannedCard as any);
        const { tree, view } = mount();
        await press(tree, 'next-button');
        const address = 'r9AQ7MBgWs9ByBeAc6Ek7a46hdxBWsER4V';
        expect(view.state.scannedAddress).toBe(address);
        expectFullText(tree, address);
        expectFullText(tree, unknownSerial);
        expect(text(tree, Localize.t('account.tangemScannedAccount'))).toBeDefined();
        expect(text(tree, Localize.t('account.tangemCardNotImported'))).toBeDefined();
    });

    it('keeps an unknown card serial without inventing an address when its wallet is absent', async () => {
        jest.mocked(RNTangemSdk.scanCard).mockResolvedValue({
            cardId: unknownSerial, settings: { isHDWalletAllowed: true }, wallets: [],
        } as any);
        const { tree, view } = mount();
        await press(tree, 'next-button');
        expect(view.state.scannedAddress).toBeUndefined();
        expectFullText(tree, unknownSerial);
        expect(tree.root.findAllByProps({ testID: 'identify-address-unknown' })).toHaveLength(0);
        expect(tree.root.findAllByType(Text).filter((node) =>
            String(node.props.testID || '').startsWith('identify-address-'))).toHaveLength(1);
        expect(text(tree, Localize.t('account.tangemScannedAccount'))).toBeDefined();
        expect(LoggerService.recordError).toHaveBeenCalledWith(
            'Tangem identify could not derive the scanned address', expect.any(Error),
        );
        expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('lets the user scan again after a result, then Done closes only this screen', async () => {
        jest.mocked(RNTangemSdk.scanCard)
            .mockResolvedValueOnce({ cardId: selectedSerial } as any)
            .mockResolvedValueOnce({ cardId: unknownSerial } as any);
        const { tree } = mount();
        await press(tree, 'next-button');
        expect(button(tree, 'close-button').props.label).toBe(Localize.t('global.done'));
        await press(tree, 'scan-again-button');
        expect(RNTangemSdk.scanCard).toHaveBeenCalledTimes(2);
        expect(text(tree, Localize.t('account.tangemCardNotSaved'))).toBeDefined();
        await press(tree, 'close-button');
        expect(Navigation.pop).toHaveBeenCalledTimes(1);
        expect(Navigation.pop).toHaveBeenCalledWith(componentId);
    });
});

describe('Tangem Identify owns the start/scan/stop lifecycle', () => {
    it('starts offline with the XRP derivation path and scans without an expected card serial', async () => {
        const { tree } = mount();
        await press(tree, 'next-button');
        expect(RNTangemSdk.startSession).toHaveBeenCalledTimes(1);
        expect(RNTangemSdk.startSession).toHaveBeenCalledWith({
            attestationMode: 'offline', defaultDerivationPaths: DefaultDerivationPaths,
        });
        expect(RNTangemSdk.scanCard).toHaveBeenCalledTimes(1);
        expect(RNTangemSdk.scanCard).toHaveBeenCalledWith({
            initialMessage: Localize.t('account.tangemScanHint'),
        });
    });

    it('waits for a pending start on exit, stops its acquired session and never starts a late scan', async () => {
        const start = deferred<void>();
        jest.mocked(RNTangemSdk.startSession).mockReturnValue(start.promise);
        const { view } = mount();
        let scan: Promise<void>;
        act(() => { scan = view.onNext(); });
        await act(flush);
        const exit = view.requestExit();
        expect(RNTangemSdk.scanCard).not.toHaveBeenCalled();
        expect(Navigation.pop).not.toHaveBeenCalled();
        await act(async () => { start.resolve(); await scan!; await exit; });
        expect(RNTangemSdk.startSession).toHaveBeenCalledWith({
            attestationMode: 'offline', defaultDerivationPaths: DefaultDerivationPaths,
        });
        expect(RNTangemSdk.scanCard).not.toHaveBeenCalled();
        expect(RNTangemSdk.stopSession).toHaveBeenCalledTimes(1);
        expect(Navigation.pop).toHaveBeenCalledWith(componentId);
    });

    it('waits for the native scan and owned stop before an incoming route can pop Identify', async () => {
        const result = deferred<any>();
        const stop = deferred<void>();
        jest.mocked(RNTangemSdk.scanCard).mockReturnValue(result.promise);
        jest.mocked(RNTangemSdk.stopSession).mockReturnValue(stop.promise);
        const { tree, view } = mount();
        let scan: Promise<void>;
        act(() => { scan = view.onNext(); });
        await act(flush);
        const exit = prepareForTangemIdentifyNavigation();
        expect(RNTangemSdk.stopSession).not.toHaveBeenCalled();
        expect(Navigation.pop).not.toHaveBeenCalled();
        await act(async () => { result.resolve({ cardId: selectedSerial }); await flush(); });
        expect(RNTangemSdk.stopSession).toHaveBeenCalledTimes(1);
        expect(Navigation.pop).not.toHaveBeenCalled();
        expect(text(tree, Localize.t('account.tangemRightCard'))).toBeUndefined();
        await act(async () => { stop.resolve(); await scan!; await exit; });
        expect(Navigation.pop).toHaveBeenCalledTimes(1);
    });

    it('does not scan or stop a session whose start was rejected, and allows retry', async () => {
        jest.mocked(RNTangemSdk.startSession).mockRejectedValueOnce(new Error('Start failed'));
        const { tree } = mount();
        await press(tree, 'next-button');
        expect(RNTangemSdk.scanCard).not.toHaveBeenCalled();
        expect(RNTangemSdk.stopSession).not.toHaveBeenCalled();
        expect(Alert.alert).toHaveBeenCalledTimes(1);
        await press(tree, 'next-button');
        expect(RNTangemSdk.scanCard).toHaveBeenCalledTimes(1);
        expect(RNTangemSdk.stopSession).toHaveBeenCalledTimes(1);
    });

    it('reports an already-started session without scanning or stopping another Tangem action', async () => {
        const error = { code: 'ALREADY_STARTED', message: 'session is already started' };
        jest.mocked(RNTangemSdk.startSession).mockRejectedValueOnce(error);
        const { tree } = mount();
        await press(tree, 'next-button');
        expect(RNTangemSdk.scanCard).not.toHaveBeenCalled();
        expect(RNTangemSdk.stopSession).not.toHaveBeenCalled();
        expect(LoggerService.recordError).toHaveBeenCalledWith(
            'Unexpected error while identifying a Tangem card: Tangem session start failed (ALREADY_STARTED)', error,
        );
        expect(button(tree, 'next-button').props.isDisabled).toBe(false);
    });

    it.each([50002, '50002'])('treats German cancellation code %p as cancel rather than an error', async (code) => {
        jest.mocked(RNTangemSdk.scanCard).mockRejectedValue({ code, message: 'Der Vorgang wurde abgebrochen' });
        const { tree } = mount();
        await press(tree, 'next-button');
        expect(Alert.alert).not.toHaveBeenCalled();
        expect(RNTangemSdk.stopSession).toHaveBeenCalledTimes(1);
        expect(Navigation.pop).toHaveBeenCalledWith(componentId);
    });

    it('coalesces repeated scan taps while start is pending', async () => {
        const start = deferred<void>();
        jest.mocked(RNTangemSdk.startSession).mockReturnValue(start.promise);
        const { view } = mount();
        let first: Promise<void>;
        act(() => { first = view.onNext(); view.onNext(); view.onNext(); });
        await act(flush);
        expect(RNTangemSdk.startSession).toHaveBeenCalledTimes(1);
        await act(async () => { start.resolve(); await first!; });
        expect(RNTangemSdk.scanCard).toHaveBeenCalledTimes(1);
        expect(RNTangemSdk.stopSession).toHaveBeenCalledTimes(1);
    });

    it.each(['start', 'scan'])('keeps the unmounted %s barrier without late state writes or pop', async (stage) => {
        const operation = deferred<any>();
        const stop = deferred<void>();
        if (stage === 'start') jest.mocked(RNTangemSdk.startSession).mockReturnValue(operation.promise);
        else jest.mocked(RNTangemSdk.scanCard).mockReturnValue(operation.promise);
        jest.mocked(RNTangemSdk.stopSession).mockReturnValue(stop.promise);
        const { tree, view } = mount();
        let scan: Promise<void>;
        act(() => { scan = view.onNext(); });
        await act(flush);
        const setState = jest.spyOn(view, 'setState');
        unmount(tree);
        let released = false;
        const barrier = prepareForTangemIdentifyNavigation().then(() => { released = true; });
        await act(flush);
        expect(released).toBe(false);
        await act(async () => { operation.resolve({ cardId: selectedSerial }); await flush(); });
        expect(RNTangemSdk.scanCard).toHaveBeenCalledTimes(stage === 'start' ? 0 : 1);
        expect(RNTangemSdk.stopSession).toHaveBeenCalledTimes(1);
        expect(released).toBe(false);
        await act(async () => { stop.resolve(); await scan!; await barrier; });
        expect(released).toBe(true);
        expect(setState).not.toHaveBeenCalled();
        expect(Navigation.pop).not.toHaveBeenCalled();
    });

    it('blocks a newly mounted Identify scan until the old unmounted session has stopped', async () => {
        const oldResult = deferred<any>();
        const oldStop = deferred<void>();
        jest.mocked(RNTangemSdk.scanCard).mockReturnValueOnce(oldResult.promise);
        jest.mocked(RNTangemSdk.stopSession).mockReturnValueOnce(oldStop.promise);
        const first = mount();
        let oldScan: Promise<void>;
        let newScan: Promise<void>;
        act(() => { oldScan = first.view.onNext(); });
        await act(flush);
        unmount(first.tree);
        const next = mount();
        act(() => { newScan = next.view.onNext(); });
        await act(flush);
        expect(RNTangemSdk.startSession).toHaveBeenCalledTimes(1);
        await act(async () => { oldResult.resolve({ cardId: selectedSerial }); await flush(); });
        expect(RNTangemSdk.startSession).toHaveBeenCalledTimes(1);
        await act(async () => { oldStop.resolve(); await oldScan!; await newScan!; });
        expect(RNTangemSdk.startSession).toHaveBeenCalledTimes(2);
        expect(text(next.tree, Localize.t('account.tangemRightCard'))).toBeDefined();
        expect(Navigation.pop).not.toHaveBeenCalled();
    });

    it('allows another scan and exit attempt after a failed pop', async () => {
        jest.mocked(Navigation.pop).mockRejectedValueOnce(new Error('Pop failed'));
        const { tree } = mount();
        await press(tree, 'next-button');
        await expect(prepareForTangemIdentifyNavigation()).rejects.toThrow('Pop failed');
        await press(tree, 'scan-again-button');
        expect(RNTangemSdk.scanCard).toHaveBeenCalledTimes(2);
        await prepareForTangemIdentifyNavigation();
        expect(Navigation.pop).toHaveBeenCalledTimes(2);
    });

    it('restores the scan button when pop fails after waiting for an active scan', async () => {
        const result = deferred<any>();
        jest.mocked(RNTangemSdk.scanCard).mockReturnValueOnce(result.promise);
        jest.mocked(Navigation.pop).mockRejectedValueOnce(new Error('Pop failed'));
        const { tree, view } = mount();
        let scan: Promise<void>;
        act(() => { scan = view.onNext(); });
        await act(flush);
        const failedExit = expect(prepareForTangemIdentifyNavigation()).rejects.toThrow('Pop failed');
        await act(async () => {
            result.resolve({ cardId: selectedSerial });
            await scan!;
            await failedExit;
        });
        expect(button(tree, 'next-button').props.isDisabled).toBe(false);
        expect(button(tree, 'next-button').props.isLoading).toBe(false);
        await press(tree, 'next-button');
        expect(RNTangemSdk.scanCard).toHaveBeenCalledTimes(2);
    });

    it.each(['rejection', 'throw'])('releases an unmounted owner barrier after a stop %s', async (failure) => {
        const result = deferred<any>();
        jest.mocked(RNTangemSdk.scanCard).mockReturnValue(result.promise);
        if (failure === 'throw') {
            jest.mocked(RNTangemSdk.stopSession).mockImplementation(() => { throw new Error('Stop failed'); });
        } else {
            jest.mocked(RNTangemSdk.stopSession).mockRejectedValue(new Error('Stop failed'));
        }
        const { tree, view } = mount();
        let scan: Promise<void>;
        act(() => { scan = view.onNext(); });
        await act(flush);
        unmount(tree);
        const barrier = prepareForTangemIdentifyNavigation();
        await act(async () => { result.resolve({ cardId: selectedSerial }); await scan!; await barrier; });
        expect(LoggerService.recordError).toHaveBeenCalledWith('Tangem identify session cleanup', expect.any(Error));
        expect(Alert.alert).not.toHaveBeenCalled();
        expect(Navigation.pop).not.toHaveBeenCalled();
    });
});
