import React from 'react';
import { Animated, Image, Share, StyleSheet, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { Navigator } from '@common/helpers/navigator';
import { AppScreens } from '@common/constants';
import { HOSTNAME } from '@common/constants/endpoints';
import { XAppOrigin } from '@common/libs/payload';
import AppItem, { AppActions, AppType, Props } from '../AppItem';

jest.mock('@common/helpers/navigator', () => ({
    Navigator: { showModal: jest.fn().mockResolvedValue('browser'), showOverlay: jest.fn().mockResolvedValue('about') },
}));
jest.mock('@common/libs/payload', () => jest.requireActual('@common/libs/payload/types'));
jest.mock('@components/General/TouchableDebounce', () => ({ TouchableDebounce: 'TouchableDebounce' }));
jest.mock('@components/General/Icon', () => ({ Icon: 'Icon' }));
jest.mock('@screens/Overlay/XAppInfo', () => ({ DisplayButtonTypes: { OPEN: 'OPEN', SHARE: 'SHARE' } }));

const app = (id = 'first'): AppType => ({
    identifier: `public.${id}`, title: `Public ${id}`, description: `Description ${id}`, icon: `https://example.com/${id}.png`,
});
const props = (item?: AppType, extra: Partial<Props> = {}): Props => ({
    item, action: AppActions.OPEN_ABOUT, origin: XAppOrigin.XAPP_STORE, ...extra,
});
const target = (tree: renderer.ReactTestRenderer, id: string) => tree.root.findByProps({ testID: id });
const text = (tree: renderer.ReactTestRenderer, value: string) => tree.root.findAllByType(Text)
    .find(node => node.props.children === value)!;
const titleLayout = (lines: number) => ({ nativeEvent: { lines: Array.from({ length: lines }, () => ({})) } });
const iconImage = (tree: renderer.ReactTestRenderer, item: AppType) => tree.root.findAllByType(Image)
    .find(node => node.props.source?.uri === item.icon && typeof node.props.onError === 'function')!;

const composite = () => {
    let callback: ((result: { finished: boolean }) => void) | undefined;
    return {
        start: jest.fn((next?: typeof callback) => { callback = next; }),
        stop: jest.fn(() => callback?.({ finished: false })),
        reset: jest.fn(),
    };
};
let loops: ReturnType<typeof composite>[];
let trees: renderer.ReactTestRenderer[];
const mount = (value: Props) => {
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(React.createElement(AppItem, value)); });
    trees.push(tree);
    return tree;
};

beforeEach(() => {
    loops = [];
    trees = [];
    jest.clearAllMocks();
    jest.spyOn(Animated, 'timing').mockImplementation(composite);
    jest.spyOn(Animated, 'sequence').mockImplementation(composite);
    jest.spyOn(Animated, 'loop').mockImplementation(() => {
        const animation = composite();
        loops.push(animation);
        return animation;
    });
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
});
afterEach(() => {
    trees.forEach(tree => act(() => tree.unmount()));
    jest.restoreAllMocks();
});

it('keeps Info and Open as sibling targets, and an Info press never launches the xApp', () => {
    const item = app();
    const tree = mount(props(item));
    const info = target(tree, `xapp-info-${item.identifier}`);
    const open = target(tree, `xapp-open-${item.identifier}`);
    expect(info.parent).toBe(open.parent);
    expect(info.findAllByProps({ testID: `xapp-open-${item.identifier}` })).toHaveLength(0);
    act(() => info.props.onPress());
    expect(Navigator.showOverlay).toHaveBeenCalledTimes(1);
    expect(Navigator.showModal).not.toHaveBeenCalled();
    act(() => open.props.onPress());
    expect(Navigator.showModal).toHaveBeenCalledTimes(1);
    expect(Navigator.showOverlay).toHaveBeenCalledTimes(1);
    expect(open.props.accessibilityRole).toBe('button');
    expect(info.props.accessibilityLabel).toContain(item.title);
});

it('retains the exact browser payload, origin and modal presentation options', () => {
    const item = app();
    const tree = mount(props(item, { origin: XAppOrigin.XAPP_STORE_MESSAGE }));
    act(() => target(tree, `xapp-open-${item.identifier}`).props.onPress());
    expect(Navigator.showModal).toHaveBeenCalledWith(AppScreens.Modal.XAppBrowser, {
        identifier: item.identifier, title: item.title, icon: item.icon, origin: XAppOrigin.XAPP_STORE_MESSAGE,
    }, { modalTransitionStyle: 'coverVertical', modalPresentationStyle: 'overFullScreen' });
});

it('keeps delayed About Open and Share bound to the clicked app after replacement and unmount', () => {
    const first = app();
    const original = { ...first };
    const tree = mount(props(first));
    act(() => target(tree, `xapp-info-${first.identifier}`).props.onPress());
    const [screen, about] = jest.mocked(Navigator.showOverlay).mock.calls[0];
    expect(screen).toBe(AppScreens.Overlay.XAppInfo);
    expect(about).toMatchObject({
        identifier: original.identifier, title: original.title, icon: original.icon,
        displayButtonTypes: ['OPEN', 'SHARE'],
    });
    act(() => tree.update(React.createElement(AppItem,
        props(app('second'), { origin: XAppOrigin.XAPP_STORE_MESSAGE }))));
    first.title = 'Changed after the user opened About';
    act(() => tree.unmount());
    act(() => {
        (about as any).onOpenPress();
        (about as any).onSharePress();
    });
    expect(Navigator.showModal).toHaveBeenCalledWith(AppScreens.Modal.XAppBrowser, {
        identifier: original.identifier, title: original.title, icon: original.icon, origin: XAppOrigin.XAPP_STORE,
    }, expect.anything());
    expect(Share.share).toHaveBeenCalledWith({
        title: original.title, message: `https://${HOSTNAME}/detect/xapp:${original.identifier}`, url: undefined,
    });
});

it('keeps featured body and action as separate launch targets with the message origin', () => {
    const item = app();
    const tree = mount(props(item, {
        action: AppActions.LUNCH_APP, variant: 'featured', origin: XAppOrigin.XAPP_STORE_MESSAGE,
    }));
    const body = target(tree, `xapp-open-${item.identifier}`);
    const button = target(tree, `xapp-featured-action-${item.identifier}`);
    expect(body.parent).toBe(button.parent);
    act(() => body.props.onPress());
    act(() => button.props.onPress());
    expect(Navigator.showOverlay).not.toHaveBeenCalled();
    expect(Navigator.showModal).toHaveBeenCalledTimes(2);
    expect(jest.mocked(Navigator.showModal).mock.calls.every(([, input]) =>
        (input as any).origin === XAppOrigin.XAPP_STORE_MESSAGE)).toBe(true);
});

it('uses a full description row when the title wraps, and restores two rows when it fits', () => {
    const item = app();
    const tree = mount(props(item));
    expect(text(tree, item.description).props.numberOfLines).toBe(2);
    act(() => text(tree, item.title).props.onTextLayout(titleLayout(2)));
    expect(text(tree, item.description).props.numberOfLines).toBe(1);
    act(() => text(tree, item.title).props.onTextLayout(titleLayout(1)));
    expect(text(tree, item.description).props.numberOfLines).toBe(2);
    expect(text(tree, item.title).props.numberOfLines).toBe(2);
});

it('ignores an old title layout after a virtualized cell receives another app', () => {
    const first = app();
    const second = app('second');
    const tree = mount(props(first));
    const oldLayout = text(tree, first.title).props.onTextLayout;
    act(() => oldLayout(titleLayout(2)));
    act(() => tree.update(React.createElement(AppItem, props(second))));
    act(() => oldLayout(titleLayout(2)));
    expect(text(tree, second.description).props.numberOfLines).toBe(2);
});

it('grows the tile for larger system text without moving the icon or caption start', () => {
    const item = app();
    const normal = mount(props(item, { fontScale: 1 }));
    const large = mount(props(item, { fontScale: 1.5 }));
    const normalStyle = StyleSheet.flatten(target(normal, `xapp-tile-${item.identifier}`).props.style);
    const largeStyle = StyleSheet.flatten(target(large, `xapp-tile-${item.identifier}`).props.style);
    expect(normalStyle.height).toBe(132);
    expect(largeStyle.height).toBeGreaterThan(normalStyle.height);
    const normalIcon = StyleSheet.flatten(iconImage(normal, item).props.style);
    const largeIcon = StyleSheet.flatten(iconImage(large, item).props.style);
    expect(largeIcon.width).toBe(normalIcon.width);
    expect(largeIcon.height).toBe(normalIcon.height);
    const normalCaption = StyleSheet.flatten(text(normal, item.title).parent!.props.style);
    const largeCaption = StyleSheet.flatten(text(large, item.title).parent!.props.style);
    expect(largeCaption.top).toBe(normalCaption.top);
    expect(largeCaption.height).toBeGreaterThan(normalCaption.height);
});

it('uses a fallback for the failing icon, but ignores a replaced URI and recovers for a new app', () => {
    const first = app();
    const second = app('second');
    const tree = mount(props(first));
    const oldError = iconImage(tree, first).props.onError;
    act(() => oldError());
    expect(tree.root.findAllByProps({ name: 'IconXAppCategoryFallback' })).toHaveLength(1);
    expect(iconImage(tree, first)).toBeUndefined();
    act(() => tree.update(React.createElement(AppItem, props(second))));
    act(() => oldError());
    expect(iconImage(tree, second)).toBeDefined();
    expect(tree.root.findAllByProps({ name: 'IconXAppCategoryFallback' })).toHaveLength(0);
});

it('stops the placeholder on arrival, restarts only when data disappears, and stops it on unmount', () => {
    const tree = mount(props());
    const instance = tree.getInstance() as AppItem;
    expect(loops).toHaveLength(1);
    expect(loops[0].start).toHaveBeenCalledTimes(1);
    act(() => tree.update(React.createElement(AppItem, props(app()))));
    expect(loops[0].stop).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByProps({ testID: 'xapp-tile-placeholder' })).toHaveLength(0);
    act(() => tree.update(React.createElement(AppItem, props())));
    expect(loops).toHaveLength(2);
    act(() => tree.unmount());
    expect(loops[1].stop).toHaveBeenCalledTimes(1);
    instance.startPlaceholderAnimation();
    expect(loops).toHaveLength(2);
});

it('stops native opacity work and ignores late image/layout callbacks after unmount', () => {
    const item = app();
    const tree = mount(props(item));
    const instance = tree.getInstance() as AppItem;
    const update = jest.spyOn(instance, 'setState');
    const imageError = iconImage(tree, item).props.onError;
    const layout = text(tree, item.title).props.onTextLayout;
    const { opacity } = StyleSheet.flatten(target(tree, `xapp-tile-${item.identifier}`).props.style);
    const stop = jest.spyOn(opacity, 'stopAnimation');
    act(() => tree.unmount());
    expect(stop).toHaveBeenCalled();
    act(() => { imageError(); layout(titleLayout(2)); });
    expect(update).not.toHaveBeenCalled();
});

it('renders a noninteractive placeholder and ignores a press queued before its item disappeared', () => {
    const item = app();
    const tree = mount(props(item));
    const press = target(tree, `xapp-open-${item.identifier}`).props.onPress;
    act(() => tree.update(React.createElement(AppItem, props())));
    expect(tree.root.findAllByType('TouchableDebounce' as any)).toHaveLength(0);
    expect(() => press()).not.toThrow();
    expect(Navigator.showModal).not.toHaveBeenCalled();
    expect(Navigator.showOverlay).not.toHaveBeenCalled();
});
