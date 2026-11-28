import React from 'react';
import renderer from 'react-test-renderer';
import { Image, Platform, ScrollView, StyleSheet, Text } from 'react-native';

import { AndroidWindowSurroundContext } from '@common/helpers/androidWindowContext';
import LockOverlay from '../LockOverlay';
import styles from '../styles';

let mockCapable = true;
jest.mock('@common/helpers/androidMultiWindow', () => ({ supportsAndroidMultiWindowLayout: () => mockCapable }));
jest.mock('@store/repositories', () => ({ CoreRepository: { getSettings: () => ({ hapticFeedback: false }) } }));
jest.mock('@services', () => ({
    AppService: {}, AuthenticationService: {},
    StyleService: { getImage: () => 1, isDarkMode: () => false },
}));
jest.mock('@common/helpers/navigator', () => ({ Navigator: {} }));
jest.mock('@common/helpers/interface', () => ({ Prompt: jest.fn(), VibrateHapticFeedback: jest.fn() }));
jest.mock('@common/libs/biometric', () => ({ BiometricErrors: {} }));
jest.mock('@components/General', () => ({ BlurView: 'BlurView', SecurePinInput: 'SecurePinInput' }));
jest.mock('@locale', () => ({ __esModule: true, default: { t: (key: string) => key } }));
jest.mock('@common/helpers/sideSafeArea', () => ({ sideBleedAbsolute: undefined }));

const originalOS = Platform.OS;
const pane = { left: 0, width: 407, height: 387, columnWidth: 407, scale: 1, fullPane: true,
    topInset: 28 };
const paddingEdges = (style: any) => {
    const flat = StyleSheet.flatten(style);
    return {
        top: flat.paddingTop ?? flat.paddingVertical ?? flat.padding ?? 0,
        bottom: flat.paddingBottom ?? flat.paddingVertical ?? flat.padding ?? 0,
        left: flat.paddingLeft ?? flat.paddingHorizontal ?? flat.padding ?? 0,
        right: flat.paddingRight ?? flat.paddingHorizontal ?? flat.padding ?? 0,
    };
};

afterEach(() => { Platform.OS = originalOS; mockCapable = true; });

it('uses the real pane inset and compact header while preserving PIN callbacks and the full error text', () => {
    Platform.OS = 'android';
    const overlay: any = new LockOverlay({});
    overlay.context = pane;
    const error = 'A long translated error remains available in the scrolling form. '.repeat(5);
    overlay.state = { ...overlay.state, error };
    const tree = renderer.create(<AndroidWindowSurroundContext.Provider value={pane}>
        {overlay.render()}
    </AndroidWindowSurroundContext.Provider>);
    const root = tree.root.findAllByProps({ testID: 'lock-overlay' })[0];
    expect(root.props.accessibilityViewIsModal).toBe(true);
    expect(StyleSheet.flatten(root.props.style)).toMatchObject({ paddingTop: 36, paddingBottom: 8,
        paddingHorizontal: 8, marginBottom: 0 });
    const logo = tree.root.findByType(Image);
    expect(StyleSheet.flatten(logo.props.style)).toMatchObject({ width: 96, height: 28 });
    expect(paddingEdges(logo.parent?.props.style)).toEqual({ top: 4, bottom: 4, left: 4, right: 4 });
    const prompt = tree.root.findAllByType(Text).find((node) =>
        node.props.children === 'global.pleaseEnterYourPasscode');
    expect(paddingEdges(prompt?.parent?.props.style)).toEqual({ top: 4, bottom: 4, left: 4, right: 4 });
    expect(tree.root.findByType(ScrollView).props.scrollEnabled).toBe(true);
    const errorText = tree.root.findAllByType(Text).find((node) => node.props.children === error);
    expect(errorText).toBeDefined();
    expect(errorText?.props.numberOfLines).toBeUndefined();
    expect(paddingEdges(errorText?.props.style)).toEqual({ top: 4, bottom: 4, left: 4, right: 4 });
    const pin = tree.root.findByType('SecurePinInput');
    expect(pin.props.onInputFinish).toBe(overlay.onPasscodeEntered);
    expect(pin.props.onBiometryPress).toBe(overlay.requestBiometricAuthenticate);
    expect(pin.props.enableHapticFeedback).toBe(false);
    tree.unmount();
});

it.each(['android', 'ios'])('preserves the original ordinary %s root style and old-native tree', (os) => {
    Platform.OS = os as typeof Platform.OS;
    mockCapable = false;
    const overlay: any = new LockOverlay({});
    const tree = renderer.create(overlay.render());
    expect(tree.root.findAllByProps({ testID: 'lock-overlay' })[0].props.style).toBe(styles.container);
    expect(tree.root.findByType(Image).props.style).toBe(styles.logo);
    expect(tree.root.findAllByType(ScrollView)).toHaveLength(0);
    tree.unmount();
});
