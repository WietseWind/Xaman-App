import React from 'react';
import renderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { InteractionManager, ScrollView, StyleSheet, Text } from 'react-native';
import { Navigation } from 'react-native-navigation';
import BackendService from '@services/BackendService';
import NetworkService from '@services/NetworkService';
import StyleService from '@services/StyleService';
import Localize from '@locale';
import { getXAppCategoryIcon } from '@common/helpers/xappCategoryIcon';
import XAppsView, { Sections } from '../XAppsView';

jest.mock('@services/BackendService', () => ({ __esModule: true, default: { getXAppStoreListings: jest.fn() } }));
jest.mock('@services/NetworkService', () => {
    const EventEmitter = require('events');
    const service = new EventEmitter();
    service.getNetwork = jest.fn();
    return { __esModule: true, default: service };
});
jest.mock('@store/repositories/core', () => ({ __esModule: true, default: { saveSettings: jest.fn() } }));
jest.mock('@common/helpers/device', () => ({ GetLayoutInsets: () => ({ top: 20, bottom: 34 }) }));
jest.mock('@common/helpers/glassTabBar', () => ({ glassTabScrollPadding: 28 }));
jest.mock('react-native-navigation', () => ({ Navigation: { events: jest.fn() } }));
jest.mock('@components/General', () => {
    const ReactModule = require('react');
    class SearchBar extends ReactModule.Component {
        focus = jest.fn();
        render() { return ReactModule.createElement('SearchBar', this.props); }
    }
    return { Header: 'Header', TouchableDebounce: 'TouchableDebounce', Icon: 'Icon', SearchBar };
});
jest.mock('@components/Modules/XAppStore', () => ({
    AppsList: 'AppsList', HeaderMessage: 'HeaderMessage',
    CategoryChips: jest.requireActual('@components/Modules/XAppStore/CategoryChips').CategoryChips,
}));

const app = (identifier: string, title: string, category: string, description = ''): XamanBackend.AppCategory => ({
    identifier, title, category, description, icon: `https://example.com/${identifier}.png`,
    listed: true, personal_flag_based: false, development: false, suppress: false,
});
const alpha = app('app.alpha', 'Alpha', 'Tools', 'Swap description only');
const beta = app('app.beta', 'Beta', 'Trading');
const swap = app('app.swapper', 'Swap', 'Trading');
const future = app('app.future', 'Future app', 'Future category');
const catalog = (all = [swap, alpha, beta, future], recent: XamanBackend.AppCategory[] = []) => ({
    all, featured: [beta, alpha], popular: all, recent,
});
const response = (categories = catalog(), title = 'Announcement') => ({
    categories, message: { id: 7, title, content: 'Message', app: categories.featured[0] },
});
const deferred = () => {
    let resolve: (value: any) => void = () => undefined;
    let reject: (error: Error) => void = () => undefined;
    const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const flush = async () => { for (let index = 0; index < 10; index++) await Promise.resolve(); };
let requests: ReturnType<typeof deferred>[];
let mountTasks: Array<() => unknown>;
let cancelMount: jest.Mock;
let removeNavigation: jest.Mock;
let tree: ReactTestRenderer | undefined;
let network: { id: string; key: string; networkId: number };
const networkA = { id: 'network-a', key: 'MAINNET', networkId: 0 };
const networkB = { id: 'network-b', key: 'XAHAU', networkId: 21337 };

const mount = (start = true) => {
    act(() => { tree = renderer.create(<XAppsView />); });
    if (start) act(() => { mountTasks.shift()?.(); });
    return tree!.getInstance() as XAppsView;
};
const reply = async (index = 0, value = response()) => {
    await act(async () => { requests[index].resolve(value); await flush(); });
};
const list = () => tree!.root.findByType('AppsList').props;
const ids = (view: XAppsView) => view.state.dataSource.flatMap(({ data }) => data.map(({ identifier }) => identifier));
const select = (view: XAppsView, value: Sections) => act(() => view.onSectionItemPress({ label: value, value }));
const switchNetwork = async (next: typeof networkA) => {
    await act(async () => { network = next; NetworkService.emit('networkChange', next as any); await flush(); });
};

beforeEach(() => {
    jest.useFakeTimers(); jest.clearAllMocks();
    requests = []; mountTasks = []; cancelMount = jest.fn(); removeNavigation = jest.fn(); network = networkA;
    jest.mocked(BackendService.getXAppStoreListings).mockImplementation(() => {
        const request = deferred(); requests.push(request); return request.promise;
    });
    jest.mocked(NetworkService.getNetwork).mockImplementation(() => network as any);
    jest.mocked(Navigation.events).mockReturnValue({ bindComponent: () => ({ remove: removeNavigation }) } as any);
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((work: any) => {
        mountTasks.push(work); return { cancel: cancelMount } as any;
    });
    StyleService.setTheme('light');
});
afterEach(async () => {
    act(() => { tree?.unmount(); }); tree = undefined;
    requests.forEach((request) => request.resolve(response()));
    await flush(); jest.runOnlyPendingTimers(); await flush();
    expect(NetworkService.listenerCount('networkChange')).toBe(0);
    jest.restoreAllMocks(); jest.useRealTimers();
});

it('keeps the server order and puts the optional Home message inside the scrolling list', async () => {
    const view = mount(); await reply();
    expect(view.state.dataSource.map(({ data }) => data)).toEqual([catalog().featured, catalog().popular]);
    expect(list().ListHeaderComponent.type).toBe('HeaderMessage');
    expect(list().ListHeaderComponent.props.message.title).toBe('Announcement');
    select(view, Sections.Alphabet);
    expect(list().ListHeaderComponent).toBeUndefined();
    expect(view.state.dataSource.map(({ title }) => title)).toEqual(['A', 'B', 'F', 'S']);
    expect(ids(view)).toEqual(['app.alpha', 'app.beta', 'app.future', 'app.swapper']);
});

it('passes the approved friendly empty state to Recent and keeps real recent order', async () => {
    const view = mount(); await reply(); select(view, Sections.Recent);
    expect(list()).toMatchObject({
        emptyTitle: 'Your recent xApps', emptyBody: 'xApps you open will appear here.', emptyIcon: 'IconXAppRecent',
    });
    expect(list().ListHeaderComponent).toBeUndefined();
    act(() => { view.fetchStoreListings(); }); await reply(1, response(catalog(undefined, [beta, alpha])));
    expect(ids(view)).toEqual(['app.beta', 'app.alpha']);
});

it('shows dynamic category counts with an unknown-icon fallback and scroll clearance', async () => {
    const view = mount(); await reply(); select(view, Sections.Categories);
    expect(view.getCategoryChips()).toEqual([
        { value: 'Trading', count: 2, active: false }, { value: 'Tools', count: 1, active: false },
        { value: 'Future category', count: 1, active: false },
    ]);
    expect(list().visible).toBe(false);
    const scroll = tree!.root.findByType(ScrollView);
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBe(48);
    expect(tree!.root.findAllByType(Text).some((node) => node.props.children === 'Explore by category')).toBe(true);
    const button = tree!.root.findByProps({ testID: 'xapp-category-Future category' });
    expect(button.findByType('Icon').props.name).toBe(getXAppCategoryIcon('not a known category'));
    act(() => button.props.onPress());
    expect(view.state.categoryFilter).toBe('Future category');
    expect(ids(view)).toEqual(['app.future']);
    act(() => tree!.root.findByProps({ testID: 'xapp-category-clear' }).props.onPress());
    expect(view.state.categoryFilter).toBeUndefined();
    expect(tree!.root.findByProps({ testID: 'xapp-categories-scroll' })).toBeDefined();
});

it('searches all titles and identifiers, then Cancel restores the selected category', async () => {
    const view = mount(); await reply(); select(view, Sections.Categories);
    act(() => view.onCategoryChipPress({ value: 'Tools' }));
    act(() => { view.toggleSearchBar(); view.onSearchChange('app.swapper'); });
    expect(ids(view)).toEqual(['app.swapper']);
    expect(list().searching).toBe(true);
    expect(list().ListHeaderComponent).toBeUndefined();
    act(() => view.onSearchChange('swap'));
    expect(ids(view)).toEqual(['app.swapper']);
    act(() => view.toggleSearchBar());
    expect(view.state.activeSection).toBe(Sections.Categories);
    expect(view.state.categoryFilter).toBe('Tools');
    expect(ids(view)).toEqual(['app.alpha']);
});

it.each(['', 'a', 'no match at all'])('keeps the existing empty search result for %p', async (query) => {
    const view = mount(); await reply();
    act(() => { view.toggleSearchBar(); view.onSearchChange(query); });
    expect(ids(view)).toEqual([]);
});

it('reapplies the current query to new data when a refresh finishes', async () => {
    const view = mount(); await reply();
    act(() => { view.fetchStoreListings(); view.toggleSearchBar(); view.onSearchChange('swap'); });
    const extra = app('app.new-swap', 'New Swap', 'Tools');
    await reply(1, response(catalog([extra, alpha, swap])));
    expect(view.state.searchQuery).toBe('swap');
    expect(ids(view)).toEqual(['app.new-swap', 'app.swapper']);
    expect(tree!.root.findByType('SearchBar').props.defaultValue).toBe('swap');
});

it('keeps the current category selection when an in-flight refresh completes', async () => {
    const view = mount(); await reply();
    act(() => { view.fetchStoreListings(); }); select(view, Sections.Categories);
    act(() => view.onCategoryChipPress({ value: 'Trading' })); await reply(1);
    expect(ids(view)).toEqual(['app.swapper', 'app.beta']);
    expect(view.state.categoryFilter).toBe('Trading');
});

it('ends the initial placeholders when the first request fails', async () => {
    const view = mount();
    expect(view.state.dataSource.flatMap(({ data }) => data)).toHaveLength(8);
    await act(async () => { requests[0].reject(new Error('Offline')); await flush(); });
    expect(view.state.isLoading).toBe(false);
    expect(view.state.dataSource).toEqual([]);
});

it('retains the last usable list and query when a refresh fails', async () => {
    const view = mount(); await reply();
    act(() => { view.toggleSearchBar(); view.onSearchChange('swap'); view.fetchStoreListings(); });
    await act(async () => { requests[1].reject(new Error('Offline')); await flush(); });
    expect(view.state.isLoading).toBe(false);
    expect(ids(view)).toEqual(['app.swapper']);
    expect(view.state.searchQuery).toBe('swap');
});

it('rejects late network A data after switching to B, including an A-B-A return', async () => {
    const view = mount();
    await switchNetwork(networkB);
    await switchNetwork(networkA);
    await reply(2, response(catalog([alpha]), 'New A'));
    await reply(1, response(catalog([beta]), 'Old B'));
    await reply(0, response(catalog([swap]), 'Old A'));
    expect(ids(view)).toEqual(['app.beta', 'app.alpha', 'app.alpha']);
    expect(view.state.categories?.all).toEqual([alpha]);
    expect(view.state.message?.title).toBe('New A');
    expect(view.state.isLoading).toBe(false);
});

it('clears old-network content at the switch and ignores its failure', async () => {
    const view = mount(); await reply(); act(() => { view.fetchStoreListings(); });
    await switchNetwork(networkB);
    expect(view.state.categories).toBeUndefined();
    expect(view.state.message).toBeUndefined();
    expect(ids(view)).toEqual([]);
    await act(async () => { requests[1].reject(new Error('Old peer failed')); await flush(); });
    expect(view.state.isLoading).toBe(true);
    await reply(2, response(catalog([beta])));
    expect(view.state.categories?.all).toEqual([beta]);
});

it('does not refetch the catalog for a same-network peer change', async () => {
    mount(); await reply();
    await switchNetwork({ ...networkA });
    expect(requests).toHaveLength(1);
});

it('allows only the newest same-network refresh to update the list', async () => {
    const view = mount(); act(() => { view.fetchStoreListings(); });
    await reply(1, response(catalog([alpha]), 'New'));
    await reply(0, response(catalog([beta]), 'Old'));
    expect(view.state.categories?.all).toEqual([alpha]);
    expect(view.state.message?.title).toBe('New');
});

it.each(['success', 'failure'])('ignores late %s and removes listeners after unmount', async (outcome) => {
    const view = mount(); const setState = jest.spyOn(view, 'setState');
    act(() => tree!.unmount()); tree = undefined; setState.mockClear();
    await act(async () => {
        if (outcome === 'success') requests[0].resolve(response());
        else requests[0].reject(new Error('Offline'));
        await flush();
    });
    expect(setState).not.toHaveBeenCalled();
    expect(removeNavigation).toHaveBeenCalledTimes(1);
    expect(cancelMount).toHaveBeenCalledTimes(1);
});

it('cancels deferred initial work and search focus on unmount', () => {
    const cancelFrame = jest.spyOn(global, 'cancelAnimationFrame');
    const view = mount(false); act(() => view.toggleSearchBar());
    act(() => tree!.unmount()); tree = undefined;
    act(() => { mountTasks[0](); });
    expect(requests).toHaveLength(0);
    expect(cancelMount).toHaveBeenCalledTimes(1);
    expect(cancelFrame).toHaveBeenCalledTimes(1);
});

it('uses local theme colors and accessible local tabs', async () => {
    mount(); await reply();
    const tab = tree!.root.findByProps({ testID: 'xapps-section-Categories' });
    expect(tab.props.accessibilityRole).toBe('tab');
    expect(tab.props.accessibilityState).toEqual({ selected: false });
    expect(StyleSheet.flatten(tree!.root.findByProps({ testID: 'xapp-store-tab-view' }).props.style)
        .backgroundColor).toBe('#ffffff');
    act(() => { StyleService.setTheme('dark'); tree!.getInstance()!.forceUpdate(); });
    expect(StyleSheet.flatten(tree!.root.findByProps({ testID: 'xapp-store-tab-view' }).props.style)
        .backgroundColor).toBe('#11121a');
    expect(Localize.t('xapp.yourRecentXApps')).toBe('Your recent xApps');
});

it('remounts themed content on the existing timestamp update without losing the query', async () => {
    const view = mount(); await reply();
    act(() => { view.toggleSearchBar(); view.onSearchChange('swap'); });
    const previousInput = tree!.root.findByType('SearchBar').parent!.instance;
    act(() => { StyleService.setTheme('dark'); tree!.update(<XAppsView timestamp={1} />); });
    const nextInput = tree!.root.findByType('SearchBar');
    expect(nextInput.parent!.instance).not.toBe(previousInput);
    expect(nextInput.props.defaultValue).toBe('swap');
    expect(ids(view)).toEqual(['app.swapper']);
    expect(StyleSheet.flatten(tree!.root.findByProps({ testID: 'xapp-store-tab-view' }).props.style)
        .backgroundColor).toBe('#11121a');
    expect(requests).toHaveLength(1);
});
