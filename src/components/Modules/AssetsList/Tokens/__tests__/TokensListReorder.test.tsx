import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { InteractionManager } from 'react-native';
import { CoreRepository, TrustLineRepository } from '@store/repositories';
import { ReorderableList } from '@components/General/ReorderableList';
import { SortableFlatList } from '@components/General';
import { NativeItem } from '../NativeItem';
import { TokenItem } from '../TokenItem';
import { ListHeader } from '../ListHeader';
import TokensList from '../TokensList';

jest.mock('@store/repositories', () => ({
    CoreRepository: {
        getSettings: jest.fn(() => ({ network: { key: 'MAINNET' }, accountWorthActive: true })),
        on: jest.fn(), off: jest.fn(),
    },
    TrustLineRepository: { on: jest.fn(), off: jest.fn(), update: jest.fn() },
    CurrencyRepository: { on: jest.fn(), off: jest.fn() },
}));
jest.mock('@store/repositories/core', () => ({ __esModule: true, default: {} }));
jest.mock('@components/General/SortableFlatList', () => {
    const { Component } = jest.requireActual('react');
    class MockSortableFlatList extends Component { render() { return null; } }
    return { SortableFlatList: MockSortableFlatList };
});
jest.mock('@components/Modules/AssetsList/Tokens/TokenItem', () => ({
    TokenItem: Object.assign(() => null, { Height: 60 }),
}));
jest.mock('@components/Modules/AssetsList/Tokens/NativeItem', () => ({ NativeItem: () => null }));
jest.mock('@components/Modules/AssetsList/Tokens/ListHeader', () => ({ ListHeader: () => null }));
jest.mock('@common/helpers/device', () => ({
    GetLayoutInsets: () => ({ top: 20, bottom: 34 }), HasBottomNotch: () => true,
}));
jest.mock('@common/helpers/navigator', () => ({ Navigator: {} }));

let tree: renderer.ReactTestRenderer;
const tokens = () => ['A', 'B', 'C'].map(id => ({ id, currency: { issuer: 'rDemo' }, isValid: () => true }));
const account = (address = 'rDemo', version = 1, lines = tokens()) => ({
    address, balance: 100, ownerCount: 3, isValid: () => true, getStateVersion: () => version,
    lines: { sorted: () => lines },
}) as any;
const props = (owner = account(), network = { key: 'MAINNET' } as any) => ({
    account: owner, discreetMode: false, spendable: true, network,
    onChangeCategoryPress: jest.fn(), hideTopElements: jest.fn(),
});
const mount = () => {
    act(() => { tree = renderer.create(React.createElement(TokensList, props())); });
    return tree.getInstance() as TokensList;
};
const start = (list: TokensList) => act(() => list.toggleReordering());

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockReturnValue({ cancel: jest.fn() } as any);
});
afterEach(() => {
    act(() => tree?.unmount());
    jest.restoreAllMocks();
});

it('keeps the normal native asset, account-worth and token-price list outside reorder mode', () => {
    mount();
    expect(tree.root.findAllByType(ReorderableList)).toHaveLength(0);
    const normal = tree.root.findByType(SortableFlatList);
    expect(normal.props.sortable).toBe(false);
    expect(normal.props.accWorthEnabled).toBe(true);
    expect(normal.props.dataSource.map((item: any) => item.id)).toEqual(['native', 'A', 'B', 'C']);
    expect(normal.props.updateTokenPrices).toEqual(expect.any(Function));
});

it('keeps native XRP fixed, stages a drag locally and saves only the token order on Save', () => {
    const list = mount(); start(list);
    expect(tree.root.findAllByType(SortableFlatList)).toHaveLength(0);
    const editor = tree.root.findByType(ReorderableList);
    expect(editor.props.data.map((item: any) => item.id)).toEqual(['A', 'B', 'C']);
    expect(tree.root.findByType(NativeItem).props.reorderEnabled).toBe(true);
    const reordered = [editor.props.data[1], editor.props.data[2], editor.props.data[0]];
    act(() => editor.props.onReorder(reordered));
    expect(TrustLineRepository.update).not.toHaveBeenCalled();
    act(() => tree.root.findByType(ListHeader).props.onReorderSavePress());
    expect(jest.mocked(TrustLineRepository.update).mock.calls.map(([item]) => item)).toEqual([
        { id: 'B', order: 0 }, { id: 'C', order: 1 }, { id: 'A', order: 2 },
    ]);
    expect(tree.root.findAllByType(ReorderableList)).toHaveLength(0);
});

it('keeps Move to top available and clears active filters when entering reorder mode', () => {
    const list = mount();
    act(() => list.setState({ filters: { text: 'A', favorite: true, hideZero: true } }));
    start(list);
    expect(list.state.filters).toBeUndefined();
    const third = tree.root.findAllByType(TokenItem)[2];
    act(() => third.props.onMoveTopPress(third.props.token));
    expect(list.state.dataSource.map(item => item.id)).toEqual(['C', 'A', 'B']);
    expect(TrustLineRepository.update).not.toHaveBeenCalled();
});

it.each(['account', 'network'])('cancels the old editor when the %s context changes', (context) => {
    const owner = account();
    const initial = props(owner);
    act(() => { tree = renderer.create(React.createElement(TokensList, initial)); });
    const list = tree.getInstance() as TokensList; start(list);
    const oldEditor = tree.root.findByType(ReorderableList).instance as ReorderableList<any>;
    const finish = jest.spyOn(oldEditor, 'finish');
    const next = props(context === 'account' ? account('rOther', 2) : owner,
        { key: context === 'network' ? 'XAHAU' : 'MAINNET' } as any);
    act(() => tree.update(React.createElement(TokensList, next)));
    expect(finish).toHaveBeenCalledWith(false);
    expect(TrustLineRepository.update).not.toHaveBeenCalled();
});

it('skips invalidated Realm tokens before extracting their keys', () => {
    const list = mount(); start(list);
    const removed = { isValid: () => false, get id() { throw new Error('Invalid Realm object'); } };
    expect(() => {
        act(() => list.setState({ dataSource: [...list.state.dataSource, removed as any] }));
    }).not.toThrow();
    expect(tree.root.findByType(ReorderableList).props.data).toHaveLength(3);
    expect(CoreRepository.getSettings).toHaveBeenCalled();
});

it('uses the parent header state so both layouts change in one native animation commit', () => {
    const original = props();
    act(() => { tree = renderer.create(React.createElement(TokensList, original)); });
    const list = tree.getInstance() as TokensList; const complete = jest.fn();
    expect(tree.root.findAllByType(ListHeader)).toHaveLength(1);
    act(() => list.hideTopElements(true, complete));
    expect(original.hideTopElements).toHaveBeenCalledWith(true, complete);
    expect(tree.root.findAllByType(ListHeader)).toHaveLength(1);
    act(() => tree.update(React.createElement(TokensList, { ...original, headerHidden: true })));
    expect(tree.root.findAllByType(ListHeader)).toHaveLength(0);
    act(() => tree.update(React.createElement(TokensList, { ...original, headerHidden: false })));
    expect(tree.root.findAllByType(ListHeader)).toHaveLength(1);
});
