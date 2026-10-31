import React from 'react';
import { Dimensions, PixelRatio, SectionList, StyleSheet, Text, View } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import CoreRepository from '@store/repositories/core';
import { VibrateHapticFeedback } from '@common/helpers/interface';
import { XAppOrigin } from '@common/libs/payload';
import AppsList from '../AppsList';

jest.mock('@components/Modules/XAppStore/AppsList/AppItem', () => ({
    AppItem: 'XAppTile', AppActions: { OPEN_ABOUT: 'ABOUT' },
}));
jest.mock('@components/General/Icon', () => ({ Icon: 'Icon' }));
jest.mock('@common/libs/payload', () => jest.requireActual('@common/libs/payload/types'));
jest.mock('@common/helpers/interface', () => ({ VibrateHapticFeedback: jest.fn() }));
jest.mock('@common/helpers/glassTabBar', () => ({ glassTabScrollPadding: 28 }));
jest.mock('@store/repositories/core', () => ({
    __esModule: true, default: { getSettings: jest.fn() },
}));

const app = (identifier: string) => ({
    identifier, title: identifier, description: 'Public description', icon: identifier,
});
const baseStyle = { flex: 1 };
const allTiles = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType('XAppTile' as any);
const list = (tree: renderer.ReactTestRenderer) => tree.root.findByType(SectionList);
let trees: renderer.ReactTestRenderer[];
let dimensionsChanged: (event: any) => void;
let removeDimensions: jest.Mock;
const mount = (extra: Partial<React.ComponentProps<typeof AppsList>> = {}) => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
        tree = renderer.create(React.createElement(AppsList, { visible: true, containerStyle: baseStyle, ...extra }));
    });
    trees.push(tree);
    return tree;
};
const text = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Text)
    .map(node => node.props.children).join(' ');

beforeEach(() => {
    trees = [];
    removeDimensions = jest.fn();
    jest.clearAllMocks();
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
    jest.spyOn(Dimensions, 'addEventListener').mockImplementation((_type, callback) => {
        dimensionsChanged = callback;
        return { remove: removeDimensions };
    });
    jest.mocked(CoreRepository.getSettings).mockReturnValue({ hapticFeedback: false } as any);
});
afterEach(() => {
    trees.forEach(tree => act(() => tree.unmount()));
    jest.restoreAllMocks();
});

it('pairs within each section while preserving order, duplicates and loading placeholders', () => {
    const a = app('a');
    const source = [
        { title: 'Featured', data: [a, undefined, app('c')] },
        { title: 'Popular', data: [a, app('d'), app('e'), app('f')] },
    ];
    const tree = mount({ dataSource: source });
    expect(list(tree).props.sections.map((section: any) => section.data.map((row: any[]) =>
        row.map(item => item?.identifier)))).toEqual([
        [['a', undefined], ['c']], [['a', 'd'], ['e', 'f']],
    ]);
    expect(allTiles(tree).map(node => node.props.item?.identifier)).toEqual(['a', undefined, 'c', 'a', 'd', 'e', 'f']);
    expect(allTiles(tree).every(node => node.props.origin === XAppOrigin.XAPP_STORE &&
        node.props.action === 'ABOUT' && node.props.variant === 'tile')).toBe(true);
    expect(tree.root.findAllByType(View).filter(node => node.props.testID === 'xapp-grid-empty-slot'))
        .toHaveLength(1);
    expect(source[0].data).toHaveLength(3);
});

it('keeps an odd trailing slot empty and noninteractive instead of adding a loading tile', () => {
    const tree = mount({ dataSource: [{ data: [app('only')] }] });
    const slot = tree.root.findAllByType(View).find(node => node.props.testID === 'xapp-grid-empty-slot')!;
    expect(slot.props.accessible).toBe(false);
    expect(slot.props.onPress).toBeUndefined();
    expect(slot.findAllByType('XAppTile' as any)).toHaveLength(0);
    expect(allTiles(tree)).toHaveLength(1);
    expect(StyleSheet.flatten(slot.props.style).flex).toBe(1);
});

it('replaces the cached paired data on refresh without keeping old apps or skeletons', () => {
    const tree = mount({ dataSource: [{ data: [undefined, undefined] }] });
    expect(allTiles(tree)).toHaveLength(2);
    act(() => tree.update(<AppsList visible containerStyle={baseStyle}
        dataSource={[{ data: [app('loaded'), app('second'), app('third')] }]} />));
    expect(allTiles(tree).map(node => node.props.item.identifier)).toEqual(['loaded', 'second', 'third']);
    expect(list(tree).props.sections[0].data).toHaveLength(2);
});

it('uses the real virtualized SectionList, caller header/style and iOS glass end clearance', () => {
    const header = <Text>Highlighted xApp</Text>;
    const containerStyle = { flex: 1, marginTop: 3 };
    const tree = mount({ containerStyle, ListHeaderComponent: header, dataSource: [{ data: [app('a')] }] });
    expect(list(tree).props.style).toBe(containerStyle);
    expect(list(tree).props.ListHeaderComponent).toBe(header);
    expect(list(tree).props.stickySectionHeadersEnabled).toBe(true);
    expect(list(tree).props.keyboardShouldPersistTaps).toBe('handled');
    expect(StyleSheet.flatten(list(tree).props.contentContainerStyle).paddingBottom).toBeGreaterThanOrEqual(28);
    expect(text(tree)).toContain('Highlighted xApp');
});

it('shows the requested recent-empty message when the only section is empty', () => {
    const tree = mount({ dataSource: [{ title: 'Recent', data: [] }], emptyTitle: 'Your recent xApps',
        emptyBody: 'Apps you open appear here', emptyIcon: 'IconSearch' });
    expect(list(tree).props.sections).toEqual([]);
    expect(text(tree)).toContain('Your recent xApps');
    expect(text(tree)).toContain('Apps you open appear here');
    expect(tree.root.findAllByProps({ name: 'IconSearch' })).toHaveLength(1);
});

it('keeps the legacy silent search-empty state, while allowing a supplied search prompt', () => {
    const tree = mount({ searching: true, dataSource: [] });
    expect(list(tree).props.ListEmptyComponent()).toBeNull();
    expect(list(tree).props.refreshControl).toBeUndefined();
    act(() => tree.update(<AppsList visible searching containerStyle={baseStyle} dataSource={[]}
        emptyTitle="Find an xApp" emptyBody="Search by name or identifier" />));
    expect(text(tree)).toContain('Find an xApp');
    expect(text(tree)).toContain('Search by name or identifier');
});

it('invokes pull-to-refresh once and preserves the refreshing state', async () => {
    let finish!: () => void;
    const onRefresh = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    jest.mocked(CoreRepository.getSettings).mockReturnValue({ hapticFeedback: true } as any);
    const tree = mount({ onRefresh, refreshing: true });
    const refresh = list(tree).props.refreshControl;
    expect(refresh.props.refreshing).toBe(true);
    let pending!: Promise<void>;
    act(() => { pending = refresh.props.onRefresh(); });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(VibrateHapticFeedback).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); await pending; });
    expect(VibrateHapticFeedback).toHaveBeenCalledTimes(2);
});

it('does not emit completion haptics after its refresh finishes on an unmounted list', async () => {
    let finish!: () => void;
    const onRefresh = () => new Promise<void>(resolve => { finish = resolve; });
    jest.mocked(CoreRepository.getSettings).mockReturnValue({ hapticFeedback: true } as any);
    const tree = mount({ onRefresh });
    let pending!: Promise<void>;
    act(() => { pending = list(tree).props.refreshControl.props.onRefresh(); });
    act(() => tree.unmount());
    await act(async () => { finish(); await pending; });
    expect(VibrateHapticFeedback).toHaveBeenCalledTimes(1);
});

it('updates current tiles for a system font change using one owned subscription and removes it', () => {
    const source = [{ data: [app('a'), app('b')] }];
    const tree = mount({ dataSource: source });
    const instance = tree.getInstance() as AppsList;
    expect(allTiles(tree).map(node => node.props.fontScale)).toEqual([1, 1]);
    act(() => dimensionsChanged({ window: { width: 390, height: 844, scale: 3, fontScale: 1.5 } }));
    expect(list(tree).props.extraData).toBe(1.5);
    expect(allTiles(tree).map(node => node.props.fontScale)).toEqual([1.5, 1.5]);
    expect(Dimensions.addEventListener).toHaveBeenCalledTimes(1);
    const update = jest.spyOn(instance, 'setState');
    act(() => tree.unmount());
    expect(removeDimensions).toHaveBeenCalledTimes(1);
    act(() => dimensionsChanged({ window: { fontScale: 2 } }));
    expect(update).not.toHaveBeenCalled();
});

it('renders no list or interactive tiles when hidden', () => {
    const tree = mount({ visible: false, dataSource: [{ data: [app('a')] }] });
    expect(tree.toJSON()).toBeNull();
    expect(allTiles(tree)).toHaveLength(0);
});
