import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AndroidWindowSurroundContext } from '@common/helpers/androidWindowContext';
import SecurePinInput from '../SecurePinInput';
import { AndroidPinEntryScroll, AndroidPinEntrySlot } from '../AndroidPinEntry';
import pinStyles, { normalPinEntryHeight, normalPinEntryWidth } from '../styles';

let mockCapable = false;
jest.mock('@common/helpers/androidMultiWindow', () => ({ supportsAndroidMultiWindowLayout: () => mockCapable }));

const originalOS = Platform.OS;
const pane = { left: 0, width: 407, height: 387, columnWidth: 407, scale: 1, fullPane: true, topInset: 28 };
const content = () => <AndroidPinEntrySlot>{(paneLayout) => <SecurePinInput
    virtualKeyboard supportBiometric length={6} paneLayout={paneLayout} onInputFinish={jest.fn()} />}
</AndroidPinEntrySlot>;

const nativePayload = require(
    'react-native/Libraries/ReactNative/ReactFabricPublicInstance/ReactNativeAttributePayload',
);

const flexAttributes = { style: { flex: true, flexGrow: true, flexShrink: true, flexBasis: true } };

const effectiveNativeFlex = (frames: any[]) => {
    const native: any = {};
    frames.forEach((style, index) => {
        const props = { style };
        const payload = index === 0 ? nativePayload.create(props, flexAttributes)
            : nativePayload.diff({ style: frames[index - 1] }, props, flexAttributes);
        Object.entries(payload ?? {}).forEach(([key, value]) => {
            // RN0.74 ReactAndroid/src/main/java/com/facebook/react/uimanager/
            // LayoutShadowNode.java and ViewManagersPropertyCache.java reset removed floats to 0.
            native[key] = value === null ? key === 'flexBasis' ? undefined : 0 : value;
        });
    });
    // ReactCommon/yoga/yoga/node/Node.cpp prioritizes explicit grow over positive flex;
    // positive flex still resolves an automatic/undefined basis to zero.
    return {
        grow: native.flexGrow ?? Math.max(0, native.flex ?? 0),
        basis: native.flexBasis != null && native.flexBasis !== 'auto'
            ? native.flexBasis : native.flex > 0 ? 0 : 'auto',
    };
};

afterEach(() => { Platform.OS = originalOS; mockCapable = false; });

it('keeps native content growth after two pane returns without replacing the empty PIN or keys', () => {
    Platform.OS = 'android';
    mockCapable = true;
    const render = (context?: typeof pane) => (
        <AndroidWindowSurroundContext.Provider value={context}>
            <AndroidPinEntryScroll normalHeight={normalPinEntryHeight()} normalWidth={normalPinEntryWidth()}>
                {content()}
            </AndroidPinEntryScroll>
        </AndroidWindowSurroundContext.Provider>
    );
    const tree = renderer.create(render());
    const input = tree.root.findByType(SecurePinInput).instance;
    const key = tree.root.findAllByProps({ testID: '0-key' })[0];
    const frames = [tree.root.findByType(ScrollView).props.contentContainerStyle];
    expect(effectiveNativeFlex(frames)).toEqual({ grow: 1, basis: 0 });
    for (let cycle = 0; cycle < 2; cycle++) {
        act(() => tree.update(render(pane)));
        frames.push(tree.root.findByType(ScrollView).props.contentContainerStyle);
        act(() => tree.update(render()));
        frames.push(tree.root.findByType(ScrollView).props.contentContainerStyle);
        expect(tree.root.findByType(SecurePinInput).instance).toBe(input);
        expect(tree.root.findAllByProps({ testID: '0-key' })[0]).toBe(key);
        expect(tree.root.findByType(SecurePinInput).instance.state.digits).toBe('');
        expect(effectiveNativeFlex(frames)).toEqual({ grow: 1, basis: 0 });
    }
    act(() => tree.unmount());
});

it('adds no native wrappers to older Android or iOS binaries', () => {
    const tree = renderer.create(<AndroidPinEntryScroll normalHeight={600} normalWidth={400}>
        {content()}
    </AndroidPinEntryScroll>);
    expect(tree.root.findAllByType(ScrollView)).toHaveLength(0);
    expect(tree.root.findByType(SecurePinInput).props.paneLayout).toBeUndefined();
    tree.unmount();
});

it('keeps the original keypad width outside a padded normal caller without replacing keys on mode change', () => {
    mockCapable = true;
    const width = Number(StyleSheet.flatten(pinStyles.keyboardWrap).width);
    expect(normalPinEntryWidth()).toBe(width);
    const render = (context: typeof pane | undefined) => (
        <AndroidWindowSurroundContext.Provider value={context}>
            <View style={{ width: width - 60 }}>
                <AndroidPinEntryScroll normalHeight={normalPinEntryHeight()} normalWidth={normalPinEntryWidth()}>
                    {content()}
                </AndroidPinEntryScroll>
            </View>
        </AndroidWindowSurroundContext.Provider>
    );
    const tree = renderer.create(render(undefined));
    const input = tree.root.findByType(SecurePinInput).instance;
    const key = tree.root.findAllByProps({ testID: '0-key' })[0];
    const normal = StyleSheet.flatten(tree.root.findByType(ScrollView).props.style);
    // A padded parent's narrower clip must not remove the original outer key
    // touch area. The scroll viewport must contain the whole legacy keyboard.
    expect(normal.width ?? width - 60).toBeGreaterThanOrEqual(width);
    expect(normal.alignSelf).toBe('center');
    act(() => tree.update(render(pane)));
    const split = StyleSheet.flatten(tree.root.findByType(ScrollView).props.style);
    expect(split.width).toBeUndefined();
    expect(split.height).toBeUndefined();
    expect(split.alignSelf).toBe('stretch');
    act(() => tree.update(render(undefined)));
    expect(tree.root.findByType(SecurePinInput).instance).toBe(input);
    expect(tree.root.findAllByProps({ testID: '0-key' })[0]).toBe(key);
    act(() => tree.unmount());
});

it('measures the actual slot and preserves the widget and keys through split and fullscreen changes', () => {
    Platform.OS = 'android';
    mockCapable = true;
    const render = (context: typeof pane | undefined) => (
        <AndroidWindowSurroundContext.Provider value={context}>
            <AndroidPinEntryScroll>{content()}</AndroidPinEntryScroll>
        </AndroidWindowSurroundContext.Provider>
    );
    const tree = renderer.create(render(pane));
    const input = tree.root.findByType(SecurePinInput).instance;
    const key = tree.root.findAllByProps({ testID: '0-key' })[0];
    const slot = tree.root.findByType(AndroidPinEntrySlot).findAllByType(View)[0];
    expect(StyleSheet.flatten(slot.props.style).minHeight).toBe(232);
    act(() => { slot.props.onLayout({ nativeEvent: { layout: { width: 367, height: 248 } } }); });
    expect(tree.root.findByType(SecurePinInput).props.paneLayout).toMatchObject({ width: 367, height: 248 });
    expect(tree.root.findByType(ScrollView).props.scrollEnabled).toBe(true);
    tree.update(render(undefined));
    expect(tree.root.findByType(SecurePinInput).instance).toBe(input);
    expect(tree.root.findAllByProps({ testID: '0-key' })[0]).toBe(key);
    expect(tree.root.findByType(ScrollView).props.scrollEnabled).toBe(false);
    expect(tree.root.findByType(SecurePinInput).props.paneLayout).toBeUndefined();
    tree.unmount();
});

it('keeps the original intrinsic normal-mode height for the unbounded secret-number wrapper', () => {
    mockCapable = true;
    const expected = Number(StyleSheet.flatten(pinStyles.digits).height) +
        Number(StyleSheet.flatten(pinStyles.keyboardWrap).marginTop) +
        4 * (Number(StyleSheet.flatten(pinStyles.line).height) + 2 * Number(StyleSheet.flatten(pinStyles.line).margin));
    expect(normalPinEntryHeight()).toBe(expected);
    const tree = renderer.create(
        <AndroidPinEntryScroll normalHeight={normalPinEntryHeight()}>{content()}</AndroidPinEntryScroll>,
    );
    expect(StyleSheet.flatten(tree.root.findByType(ScrollView).props.style)).toMatchObject({ height: expected,
        flexGrow: 0, flexShrink: 0 });
    tree.unmount();
});
