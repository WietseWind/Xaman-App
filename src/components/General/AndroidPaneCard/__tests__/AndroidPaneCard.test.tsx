import React, { Component } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { AndroidWindowSurroundContext } from '@common/helpers/androidWindowContext';
import AndroidPaneCard from '../AndroidPaneCard';
import KeyboardAwareScrollView from '../../KeyboardAwareScrollView/KeyboardAwareScrollView';

let mockSupports = false;
jest.mock('@common/helpers/androidMultiWindow', () => ({
    supportsAndroidMultiWindowLayout: () => mockSupports,
}));

const pane = (width = 600, height = 340) => ({
    left: 0, width, height, columnWidth: width, scale: 1, fullPane: true,
});
const CARD_STYLE = { width: 360 };

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

afterEach(() => { mockSupports = false; });

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
