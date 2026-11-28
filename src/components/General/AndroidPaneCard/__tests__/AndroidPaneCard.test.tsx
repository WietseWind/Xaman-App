import React, { Component } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { AndroidWindowSurroundContext } from '@common/helpers/androidWindowContext';
import AndroidPaneCard from '../AndroidPaneCard';
import KeyboardAwareScrollView from '../../KeyboardAwareScrollView/KeyboardAwareScrollView';
import scrollStyles from '../../KeyboardAwareScrollView/styles';

let mockSupports = false;
jest.mock('@common/helpers/androidMultiWindow', () => ({
    supportsAndroidMultiWindowLayout: () => mockSupports,
}));
jest.mock('@common/helpers/keyboard', () => ({
    __esModule: true,
    default: { addListener: jest.fn(), removeListener: jest.fn() },
}));

const pane = (width = 600, height = 340) => ({
    left: 0, width, height, columnWidth: width, scale: 1, fullPane: true,
});
const CARD_STYLE = { width: 360 };
const originalOS = Platform.OS;
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
    // ReactCommon/yoga/yoga/node/Node.cpp uses explicit grow before flex and gives positive
    // flex a zero basis. Cold styles alone do not exercise native prop removal.
    return {
        grow: native.flexGrow ?? Math.max(0, native.flex ?? 0),
        basis: native.flexBasis != null && native.flexBasis !== 'auto'
            ? native.flexBasis : native.flex > 0 ? 0 : 'auto',
    };
};

class Draft extends Component<{}, { text: string }> {
    constructor(props: {}) {
        super(props);
        this.state = { text: '' };
    }
    render() {
        const { text } = this.state;
        return <Text>{text}</Text>;
    }
}

afterEach(() => { mockSupports = false; Platform.OS = originalOS; });

it('keeps keyboard-aware native content flexible after two pane returns with the same draft', () => {
    Platform.OS = 'android';
    mockSupports = true;
    const render = (value?: ReturnType<typeof pane>) => (
        <AndroidWindowSurroundContext.Provider value={value}>
            <KeyboardAwareScrollView><Draft /></KeyboardAwareScrollView>
        </AndroidWindowSurroundContext.Provider>
    );
    const tree = renderer.create(render());
    const draft = tree.root.findByType(Draft).instance;
    act(() => draft.setState({ text: 'public draft' }));
    const contentStyle = () => {
        const { instance } = tree.root.findByType(KeyboardAwareScrollView);
        return instance.render().props.children.props.style;
    };
    const frames = [contentStyle()];
    expect(effectiveNativeFlex(frames)).toEqual({ grow: 1, basis: 0 });
    for (let cycle = 0; cycle < 2; cycle++) {
        act(() => tree.update(render(pane())));
        frames.push(contentStyle());
        act(() => tree.update(render()));
        frames.push(contentStyle());
        expect(tree.root.findByType(Draft).instance).toBe(draft);
        expect(draft.state.text).toBe('public draft');
        expect(effectiveNativeFlex(frames)).toEqual({ grow: 1, basis: 0 });
    }
    act(() => tree.unmount());
});

it.each(['android', 'ios'])('keeps the original content style array on unsupported %s', (os) => {
    Platform.OS = os;
    mockSupports = false;
    const tree = renderer.create(<KeyboardAwareScrollView><Draft /></KeyboardAwareScrollView>);
    const { instance } = tree.root.findByType(KeyboardAwareScrollView);
    expect(instance.render().props.children.props.style).toEqual([
        scrollStyles.contentContainer, undefined, { paddingBottom: instance.state.offset },
    ]);
    act(() => tree.unmount());
});

it('retains the original native tree on older Android and iOS', () => {
    const tree = renderer.create(<AndroidPaneCard style={CARD_STYLE} normalFill normalWidth={400}>
        <Text>Content</Text>
    </AndroidPaneCard>);
    expect(tree.root.findAllByType(ScrollView)).toHaveLength(0);
    expect(tree.toJSON()).toEqual(renderer.create(<View style={CARD_STYLE}><Text>Content</Text></View>).toJSON());
    act(() => tree.unmount());
});

it('retains a full-height form and its draft while switching between normal allocation and a bounded pane', () => {
    mockSupports = true;
    const render = (value?: ReturnType<typeof pane>) => (
        <AndroidWindowSurroundContext.Provider value={value}>
            <AndroidPaneCard testID="full-form" normalFill normalWidth={400}><Draft /></AndroidPaneCard>
        </AndroidWindowSurroundContext.Provider>
    );
    const tree = renderer.create(render());
    const draft = tree.root.findByType(Draft).instance;
    act(() => draft.setState({ text: 'public draft' }));
    const allocation = () => {
        const form = tree.root.findAllByType(View).find((node) => node.props.testID === 'full-form')!;
        const scroll = tree.root.findByType(KeyboardAwareScrollView);
        return [form.parent!.props.style, form.props.style, scroll.props.style,
            scroll.props.contentContainerStyle].map((style) => StyleSheet.flatten(style));
    };
    // The old full-height Authenticate uses header/footer flex children. Its
    // parent allocation must reach them through every new scroll boundary.
    const fillsParent = (style: any) => style?.flex === 1 ||
        (style?.flexGrow === 1 && style?.flexShrink === 1 && style?.flexBasis === 0);
    expect(allocation().every(fillsParent)).toBe(true);
    act(() => tree.update(render(pane())));
    const form = tree.root.findAllByType(View).find((node) => node.props.testID === 'full-form')!;
    expect(StyleSheet.flatten(form.props.style)).toMatchObject({ width: 540, maxHeight: 320 });
    expect(tree.root.findByType(KeyboardAwareScrollView).props.contentContainerStyle.flexGrow).toBeUndefined();
    act(() => tree.update(render()));
    expect(allocation().every(fillsParent)).toBe(true);
    expect(tree.root.findByType(Draft).instance).toBe(draft);
    expect(draft.state.text).toBe('public draft');
    act(() => tree.unmount());
});

it('uses the actual pane width and bounded scroll while retaining the same draft instance across split changes', () => {
    mockSupports = true;
    const render = (value?: ReturnType<typeof pane>) => (
        <AndroidWindowSurroundContext.Provider value={value}>
            <AndroidPaneCard testID="card" style={CARD_STYLE}><Draft /></AndroidPaneCard>
        </AndroidWindowSurroundContext.Provider>
    );
    let tree: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(render()); });
    const draft = tree!.root.findByType(Draft).instance;
    act(() => draft.setState({ text: 'public draft' }));
    expect(tree!.root.findByType(KeyboardAwareScrollView).props.scrollEnabled).toBe(false);
    act(() => tree!.update(render(pane())));
    const card = tree!.root.findAllByType(View).find((node) => node.props.testID === 'card')!;
    expect(StyleSheet.flatten(card.props.style)).toMatchObject({ width: 540, maxHeight: 320 });
    expect(tree!.root.findByType(KeyboardAwareScrollView).props.scrollEnabled).toBe(true);
    act(() => tree!.update(render(pane(400, 500))));
    expect(StyleSheet.flatten(card.props.style)).toMatchObject({ width: 360, maxHeight: 480 });
    act(() => tree!.update(render()));
    expect(tree!.root.findByType(Draft).instance).toBe(draft);
    expect(draft.state.text).toBe('public draft');
    expect(StyleSheet.flatten(card.props.style)).toEqual({ width: 360 });
    act(() => tree!.unmount());
});
