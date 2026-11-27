import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { NativeModules, Platform } from 'react-native';

import { AndroidWindowSurroundContext } from '@common/helpers/androidWindowContext';
import { MethodsContext } from '../../Vault/Context';
import PassphraseAuthentication from '../PassphraseAuthenticationOverlay';
import PassphraseMethod from '../../Vault/Methods/Passphrase/PassphraseMethod';
import PasscodeMethod from '../../Vault/Methods/Passcode/PasscodeMethod';

const mockGeometry = jest.fn();
const mockDismiss = jest.fn();
const mockSign = jest.fn();
const mockVaultOpen = jest.fn();
const mockLayout = jest.fn();
const mockRemove = jest.fn();
const mockKeyboardHandlers: Record<string, () => void> = {};

jest.mock('react-native', () => ({
    View: 'View', Text: 'Text',
    Platform: { OS: 'android' },
    NativeModules: { KeyboardModule: { getWindowGeometry: () => mockGeometry() } },
    Keyboard: {
        addListener: (name: string, listener: () => void) => {
            mockKeyboardHandlers[name] = listener;
            return { remove: () => { mockRemove(name); delete mockKeyboardHandlers[name]; } };
        },
    },
    Animated: {
        View: 'AnimatedView',
        Value: class { interpolate() { return 'backdrop'; } },
        timing: () => ({ start: jest.fn() }),
    },
    BackHandler: { addEventListener: () => ({ remove: jest.fn() }) },
    LayoutAnimation: { easeInEaseOut: () => mockLayout() },
    InteractionManager: { runAfterInteractions: jest.fn() },
    Linking: { openURL: jest.fn() }, Alert: { alert: jest.fn() },
}));
jest.mock('@common/constants', () => ({ AppScreens: { Overlay: { PassphraseAuthentication: 'Passphrase' } } }));
jest.mock('@common/constants/endpoints', () => ({ WebLinks: {} }));
jest.mock('@common/helpers/keyboard', () => ({
    __esModule: true, default: { addListener: jest.fn(), removeListener: jest.fn(), dismiss: jest.fn() },
}));
jest.mock('@common/helpers/navigator', () => ({ Navigator: { dismissOverlay: () => mockDismiss() } }));
jest.mock('@common/helpers/sideSafeArea', () => ({ SideSafeAreaFill: 'SideSafeAreaFill' }));
jest.mock('@common/helpers/interface', () => ({ Prompt: jest.fn(), VibrateHapticFeedback: jest.fn() }));
jest.mock('@common/libs/vault', () => ({
    __esModule: true, default: { open: () => mockVaultOpen() },
}));
jest.mock('@common/libs/biometric', () => ({ BiometricErrors: {} }));
jest.mock('@components/General', () => ({
    Button: 'Button', PasswordInput: 'PasswordInput', SecurePinInput: 'SecurePinInput', Spacer: 'Spacer',
}));
jest.mock('@services/StyleService', () => ({
    __esModule: true,
    default: { create: (styles: any) => styles, getBackdropInterpolateColor: () => ['white', 'black'] },
}));
jest.mock('@services', () => ({ AuthenticationService: {} }));
jest.mock('@store/repositories', () => ({ CoreRepository: { getSettings: () => ({ hapticFeedback: false }) } }));
jest.mock('@locale', () => ({ __esModule: true, default: { t: (key: string) => key } }));
jest.mock('@theme', () => ({ AppStyles: {}, AppSizes: { screen: { height: 800, width: 400 } } }));

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const context = (scale = 0.5) => ({ left: 0, width: 400, height: 800, columnWidth: 337, scale });
const methods = {
    coreSettings: { hapticFeedback: false }, preferredSigner: { label: 'Public test account' },
    isSigning: false, sign: mockSign, dismiss: mockDismiss,
};
const components = [
    ['passphrase authentication', PassphraseAuthentication],
    ['Vault passphrase', PassphraseMethod],
    ['Vault passcode', PasscodeMethod],
] as const;

const setup = (Component: any, surround: any = context()) => {
    const ref = React.createRef<any>();
    let baseY = 200;
    let appliedFraction = 1;
    let currentContext = surround === false ? undefined : surround;
    const tree = () => (
        <MethodsContext.Provider value={methods as any}>
            <AndroidWindowSurroundContext.Provider value={currentContext}>
                <Component ref={ref} account={{ isValid: () => true, label: 'Public test account' }}
                    onSuccess={jest.fn()} />
            </AndroidWindowSurroundContext.Provider>
        </MethodsContext.Provider>
    );
    let rendered: renderer.ReactTestRenderer;
    act(() => {
        rendered = renderer.create(tree(), {
            createNodeMock: (element) => ({
                focus: jest.fn(), blur: jest.fn(),
                measure: (callback: any) => callback(0, 0, 300, 200),
                measureInWindow: (callback: any) => {
                    const scale = currentContext?.scale ?? 1;
                    if (element.type === 'AnimatedView') {
                        callback(0, 0, 400, 2 * baseY / scale + 200);
                        return;
                    }
                    const instance = ref.current;
                    const applied = instance.state.offsetBottom / 2;
                    callback(0, baseY - applied * appliedFraction * scale, 300, 200);
                },
            }),
        });
    });
    return {
        instance: ref.current,
        rendered: rendered!,
        style: () => rendered!.root.findAllByType('View').find((node) => node.props.onFocus)!.props.style[1],
        update: (next: any, nextBaseY = baseY) => {
            currentContext = next; baseY = nextBaseY;
            act(() => rendered!.update(tree()));
        },
        setAppliedFraction: (fraction: number) => { appliedFraction = fraction; },
        unmount: () => act(() => rendered!.unmount()),
    };
};

beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockKeyboardHandlers).forEach((name) => delete mockKeyboardHandlers[name]);
    (Platform as any).OS = 'android';
    mockGeometry.mockResolvedValue({ keyboardTop: 220, visible: true });
    NativeModules.KeyboardModule.getWindowGeometry = () => mockGeometry();
});

describe.each(components)('%s centered keyboard offset', (name, Component) => {
    it('converts the logical offset to the existing centered margin and retains context/refs', async () => {
        const f = setup(Component);
        await act(async () => { f.instance.onKeyboardShow({ endCoordinates: { height: 703 } }); await flush(); });
        expect(f.instance.state.offsetBottom).toBe(320);
        expect(f.style()).toEqual({ marginBottom: 320 });
        expect(200 - 160 * 0.5 + 200 * 0.5).toBe(220);
        if (name.startsWith('Vault')) expect(f.instance.context).toBe(methods);
        expect(mockVaultOpen).not.toHaveBeenCalled();
        expect(mockSign).not.toHaveBeenCalled();
        f.unmount();
    });

    it('keeps the total offset stable for repeated events and recomputes it after scaling', async () => {
        const f = setup(Component);
        await act(async () => { mockKeyboardHandlers.keyboardDidShow(); await flush(); });
        await act(async () => { f.instance.onKeyboardShow({ endCoordinates: { height: 703 } }); await flush(); });
        expect(f.instance.state.offsetBottom).toBe(320);
        mockGeometry.mockResolvedValue({ keyboardTop: 200, visible: true });
        await act(async () => { f.update(context(0.4), 160); await flush(); });
        expect(f.instance.state.offsetBottom).toBe(200);
        expect(f.style()).toEqual({ marginBottom: 200 });
        await act(async () => { mockKeyboardHandlers.keyboardDidHide(); await flush(); });
        expect(f.instance.state.offsetBottom).toBe(0);
        f.unmount();
    });

    it.each(['normal Android', 'iOS', 'missing native', 'null native', 'rejected native'])(
        'keeps the legacy offset and margin style for %s', async (mode) => {
            if (mode === 'iOS') (Platform as any).OS = 'ios';
            if (mode === 'missing native') delete NativeModules.KeyboardModule.getWindowGeometry;
            if (mode === 'null native') mockGeometry.mockResolvedValue(null);
            if (mode === 'rejected native') mockGeometry.mockRejectedValue(new Error('window unavailable'));
            const f = setup(Component, mode === 'normal Android' ? false : context());
            await act(async () => { f.instance.onKeyboardShow({ endCoordinates: { height: 400 } }); await flush(); });
            expect(f.instance.state.offsetBottom).toBe(200);
            expect(f.style()).toEqual({ marginBottom: 200 });
            act(() => f.instance.onKeyboardHide());
            expect(f.instance.state.offsetBottom).toBe(0);
            f.unmount();
        },
    );

    it.each([220, 250])('reconstructs the unshifted anchor after a legacy fallback at native top %s', async (top) => {
        mockGeometry.mockResolvedValue(null);
        const f = setup(Component);
        await act(async () => { f.instance.onKeyboardShow({ endCoordinates: { height: 400 } }); await flush(); });
        expect(f.instance.state.offsetBottom).toBe(200);
        expect(f.style()).toEqual({ marginBottom: 200 });
        expect(f.instance.adaptiveOffset).toBe(100);
        mockGeometry.mockResolvedValue({ keyboardTop: top, visible: true });
        await act(async () => { mockKeyboardHandlers.keyboardDidShow(); await flush(); });
        const offset = (300 - top) / 0.5;
        expect(f.instance.state.offsetBottom).toBe(offset * 2);
        expect(f.style()).toEqual({ marginBottom: offset * 2 });
        expect(200 - offset * 0.5 + 200 * 0.5).toBe(top);
        await act(async () => { mockKeyboardHandlers.keyboardDidHide(); await flush(); });
        expect(f.instance.state.offsetBottom).toBe(0);
        expect(f.instance.adaptiveOffset).toBe(0);
        f.unmount();
    });

    it('uses the unshifted parent while the previous LayoutAnimation is only partly applied', async () => {
        const f = setup(Component);
        await act(async () => { mockKeyboardHandlers.keyboardDidShow(); await flush(); });
        expect(f.instance.state.offsetBottom).toBe(320);
        f.setAppliedFraction(0.25);
        mockGeometry.mockResolvedValue({ keyboardTop: 200, visible: true });
        await act(async () => { f.update(context(0.4), 160); await flush(); });
        expect(f.instance.state.offsetBottom).toBe(200);
        expect(f.style()).toEqual({ marginBottom: 200 });
        f.unmount();
    });

    it('uses the unshifted parent while a fallback margin animation is only partly applied', async () => {
        mockGeometry.mockResolvedValue(null);
        const f = setup(Component);
        await act(async () => { f.instance.onKeyboardShow({ endCoordinates: { height: 400 } }); await flush(); });
        f.setAppliedFraction(0.25);
        mockGeometry.mockResolvedValue({ keyboardTop: 220, visible: true });
        await act(async () => { mockKeyboardHandlers.keyboardDidShow(); await flush(); });
        expect(f.instance.state.offsetBottom).toBe(320);
        expect(f.style()).toEqual({ marginBottom: 320 });
        f.unmount();
    });

    it('discards a pending parent measurement after the keyboard hides', async () => {
        const f = setup(Component);
        let complete: any;
        f.instance.containerViewRef.current.measureInWindow = (callback: any) => { complete = callback; };
        await act(async () => { mockKeyboardHandlers.keyboardDidShow(); await flush(); });
        act(() => mockKeyboardHandlers.keyboardDidHide());
        await act(async () => { complete(0, 0, 400, 1000); await flush(); });
        expect(f.instance.state.offsetBottom).toBe(0);
        expect(mockLayout).not.toHaveBeenCalled();
        f.unmount();
    });

    it('resets a legacy fallback through RN-only Hide and consumes the duplicate custom Hide', async () => {
        mockGeometry.mockResolvedValue(null);
        const f = setup(Component);
        await act(async () => { f.instance.onKeyboardShow({ endCoordinates: { height: 400 } }); await flush(); });
        expect(f.instance.state.offsetBottom).toBe(200);
        act(() => mockKeyboardHandlers.keyboardDidHide());
        expect(f.instance.state.offsetBottom).toBe(0);
        expect(f.instance.adaptiveOffset).toBe(0);
        const resets = mockLayout.mock.calls.length;
        act(() => f.instance.onKeyboardHide());
        expect(mockLayout).toHaveBeenCalledTimes(resets);
        f.unmount();
    });

    it('remeasures a new context while its first keyboard query is still pending', async () => {
        let finishFirst: any;
        mockGeometry.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
            .mockResolvedValue({ keyboardTop: 200, visible: true });
        const f = setup(Component);
        await act(async () => { mockKeyboardHandlers.keyboardDidShow(); await flush(); });
        await act(async () => { f.update(context(0.4), 160); await flush(); });
        expect(mockGeometry).toHaveBeenCalledTimes(2);
        expect(f.instance.state.offsetBottom).toBe(200);
        await act(async () => { finishFirst({ keyboardTop: 10, visible: true }); await flush(); });
        expect(f.instance.state.offsetBottom).toBe(200);
        f.unmount();
    });

    it('discards an adaptive fallback measurement after keyboard hide', async () => {
        mockGeometry.mockResolvedValue(null);
        let measure: any;
        const f = setup(Component);
        f.instance.contentViewRef.current.measure = (callback: any) => { measure = callback; };
        await act(async () => { f.instance.onKeyboardShow({ endCoordinates: { height: 400 } }); await flush(); });
        act(() => f.instance.onKeyboardHide());
        const calls = mockLayout.mock.calls.length;
        act(() => measure(0, 0, 300, 200));
        expect(f.instance.state.offsetBottom).toBe(0);
        expect(mockLayout).toHaveBeenCalledTimes(calls);
        f.unmount();
    });

    it('discards a native query when its context is lost or the component unmounts', async () => {
        let complete: any;
        mockGeometry.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
        const f = setup(Component);
        await act(async () => { mockKeyboardHandlers.keyboardDidShow(); await flush(); });
        f.update(undefined);
        await act(async () => { complete({ keyboardTop: 220, visible: true }); await flush(); });
        expect(f.instance.state.offsetBottom).toBe(0);
        expect(mockLayout).not.toHaveBeenCalled();
        f.update(context());
        await act(async () => { mockKeyboardHandlers.keyboardDidShow(); await flush(); });
        f.unmount();
        await act(async () => { complete({ keyboardTop: 220, visible: true }); await flush(); });
        expect(mockLayout).not.toHaveBeenCalled();
    });

    it('does not apply a pending offset after closing or unmounting', async () => {
        let complete: any;
        mockGeometry.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
        const f = setup(Component);
        act(() => f.instance.onKeyboardShow({ endCoordinates: { height: 703 } }));
        await act(async () => { await flush(); });
        act(() => { if (name.startsWith('Vault')) f.instance.dismiss(); else f.instance.close(); });
        await act(async () => { complete({ keyboardTop: 220, visible: true }); await flush(); });
        expect(f.instance.state.offsetBottom).toBe(0);
        expect(mockLayout).not.toHaveBeenCalled();
        expect(mockDismiss).toHaveBeenCalledTimes(1);
        f.unmount();
        expect(mockRemove).toHaveBeenCalledTimes(2);
    });
});
