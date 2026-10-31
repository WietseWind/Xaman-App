import React from 'react';
import { InteractionManager, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import Preferences from '@common/libs/preferences';
import { XAppOrigin } from '@common/libs/payload';
import HeaderMessage, { MessageType } from '../HeaderMessage';

jest.mock('@common/libs/preferences', () => ({
    __esModule: true,
    default: {
        keys: { XAPP_STORE_IGNORE_MESSAGE_ID: 'XAPP_STORE_IGNORE_MESSAGE_ID' },
        get: jest.fn(), set: jest.fn(),
    },
}));
jest.mock('@common/libs/payload', () => jest.requireActual('@common/libs/payload/types'));
jest.mock('@components/General/TouchableDebounce', () => ({ TouchableDebounce: 'TouchableDebounce' }));
jest.mock('@components/General/Icon', () => ({ Icon: 'Icon' }));
jest.mock('@components/Modules/XAppStore/AppsList/AppItem', () => ({
    AppItem: 'FeaturedXApp', AppActions: { LUNCH_APP: 'LUNCH' },
}));

type HeaderProps = React.ComponentProps<typeof HeaderMessage>;
const message = (overrides: Partial<MessageType> = {}): MessageType => ({
    id: 42, title: 'Public announcement', content: 'Text fallback',
    app: {
        identifier: 'public.highlighted', title: 'Public xApp', description: 'Public description', icon: 'public.png',
    },
    ...overrides,
});
const deferred = () => {
    let resolve!: (value: string | null) => void;
    const promise = new Promise<string | null>(next => { resolve = next; });
    return { promise, resolve };
};
let tasks: Array<{ run: () => void; cancel: jest.Mock }>;
let trees: renderer.ReactTestRenderer[];
const mount = (extra: Partial<HeaderProps> = {}) => {
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(React.createElement(HeaderMessage, { visible: true, ...extra })); });
    trees.push(tree);
    return tree;
};
const run = async (index = tasks.length - 1) => {
    await act(async () => { tasks[index].run(); await Promise.resolve(); });
};
const text = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Text)
    .map(node => node.props.children).join(' ');
const close = (tree: renderer.ReactTestRenderer) => tree.root.findByProps({ testID: 'xapp-store-dismiss-highlight' });

beforeEach(() => {
    tasks = [];
    trees = [];
    jest.clearAllMocks();
    jest.mocked(Preferences.get).mockResolvedValue(null);
    jest.mocked(Preferences.set).mockResolvedValue(undefined);
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(callback => {
        const task = { run: callback as () => void, cancel: jest.fn() };
        tasks.push(task);
        return task as any;
    });
});
afterEach(() => {
    trees.forEach(tree => act(() => tree.unmount()));
    jest.restoreAllMocks();
});

it('uses the featured xApp and store-message origin instead of the text fallback', async () => {
    const value = message();
    const tree = mount({ message: value });
    expect(tree.toJSON()).toBeNull();
    await run();
    expect(Preferences.get).toHaveBeenCalledWith(Preferences.keys.XAPP_STORE_IGNORE_MESSAGE_ID);
    const featured = tree.root.findByType('FeaturedXApp' as any);
    expect(featured.props).toMatchObject({
        item: value.app, variant: 'featured', action: 'LUNCH', origin: XAppOrigin.XAPP_STORE_MESSAGE,
    });
    expect(text(tree)).toContain(value.title);
    expect(text(tree)).not.toContain(value.content);
});

it('retains a text-only announcement when no xApp was supplied', async () => {
    const tree = mount({ message: message({ app: undefined, content: 'Service announcement text' }) });
    await run();
    expect(text(tree)).toContain('Service announcement text');
    expect(tree.root.findAllByType('FeaturedXApp' as any)).toHaveLength(0);
});

it.each([
    { id: 41, ignored: '42', visible: false },
    { id: 42, ignored: '42', visible: false },
    { id: 43, ignored: '42', visible: true },
])('preserves numeric dismissal ordering for message $id and ignored ID $ignored', async (test) => {
    jest.mocked(Preferences.get).mockResolvedValue(test.ignored);
    const tree = mount({ message: message({ id: test.id }) });
    await run();
    expect(tree.toJSON() !== null).toBe(test.visible);
    expect(Preferences.set).not.toHaveBeenCalled();
});

it('hides immediately and persists exactly the ID of the dismissed message', async () => {
    const tree = mount({ message: message({ id: 314 }) });
    await run();
    act(() => close(tree).props.onPress());
    expect(tree.toJSON()).toBeNull();
    expect(Preferences.set).toHaveBeenCalledTimes(1);
    expect(Preferences.set).toHaveBeenCalledWith(Preferences.keys.XAPP_STORE_IGNORE_MESSAGE_ID, '314');
});

it('keeps a dismissed message hidden when an already-running preference read replies late', async () => {
    const tree = mount({ message: message() });
    await run();
    const pending = deferred();
    jest.mocked(Preferences.get).mockReturnValueOnce(pending.promise);
    const instance = tree.getInstance() as HeaderMessage;
    act(() => { instance.checkShouldShowMessage(); });
    act(() => close(tree).props.onPress());
    await act(async () => { pending.resolve(null); await pending.promise; });
    expect(tree.toJSON()).toBeNull();
    expect(Preferences.set).toHaveBeenCalledWith(Preferences.keys.XAPP_STORE_IGNORE_MESSAGE_ID, '42');
});

it.each([
    { newIgnored: null, oldIgnored: '999', visible: true },
    { newIgnored: '52', oldIgnored: null, visible: false },
])('does not let the old message reply change the replacement visibility $visible', async (test) => {
    const first = deferred();
    const second = deferred();
    jest.mocked(Preferences.get).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const tree = mount({ message: message() });
    await run();
    const next = message({ id: 52, title: 'Replacement announcement' });
    act(() => tree.update(<HeaderMessage visible message={next} />));
    expect(tasks[0].cancel).toHaveBeenCalled();
    await run();
    await act(async () => { second.resolve(test.newIgnored); await second.promise; });
    expect(tree.toJSON() !== null).toBe(test.visible);
    await act(async () => { first.resolve(test.oldIgnored); await first.promise; });
    expect(tree.toJSON() !== null).toBe(test.visible);
    if (test.visible) expect(text(tree)).toContain('Replacement announcement');
});

it('cancels a queued old-message check and ignores it even if its callback was already queued', async () => {
    const tree = mount({ message: message() });
    act(() => tree.update(<HeaderMessage visible message={message({ id: 52 })} />));
    expect(tasks[0].cancel).toHaveBeenCalledTimes(1);
    await run(0);
    expect(Preferences.get).not.toHaveBeenCalled();
    await run(1);
    expect(Preferences.get).toHaveBeenCalledTimes(1);
    expect(tree.toJSON()).not.toBeNull();
});

it('cancels queued work and performs no preference read or state write after unmount', async () => {
    const tree = mount({ message: message() });
    const instance = tree.getInstance() as HeaderMessage;
    const update = jest.spyOn(instance, 'setState');
    act(() => tree.unmount());
    expect(tasks[0].cancel).toHaveBeenCalledTimes(1);
    await run(0);
    expect(Preferences.get).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
});

it('does not write state when an in-flight preference reply arrives after unmount', async () => {
    const pending = deferred();
    jest.mocked(Preferences.get).mockReturnValue(pending.promise);
    const tree = mount({ message: message() });
    const instance = tree.getInstance() as HeaderMessage;
    const update = jest.spyOn(instance, 'setState');
    await run();
    act(() => tree.unmount());
    await act(async () => { pending.resolve(null); await pending.promise; });
    expect(update).not.toHaveBeenCalled();
});

it('retains visible=false and can show the checked message when the caller makes it visible', async () => {
    const value = message();
    const tree = mount({ message: value, visible: false });
    await run();
    expect(tree.toJSON()).toBeNull();
    act(() => tree.update(<HeaderMessage visible message={value} />));
    expect(tree.toJSON()).not.toBeNull();
    expect(Preferences.get).toHaveBeenCalledTimes(1);
});

it('keeps the prior hidden behavior if preferences cannot be read', async () => {
    jest.mocked(Preferences.get).mockRejectedValue(new Error('Fixture read failure'));
    const tree = mount({ message: message() });
    await run();
    expect(tree.toJSON()).toBeNull();
});

it('handles a failed dismissal write without reopening the message or rejecting the press', async () => {
    const tree = mount({ message: message() });
    await run();
    jest.mocked(Preferences.set).mockRejectedValueOnce(new Error('Fixture write failure'));
    await act(async () => { close(tree).props.onPress(); await Promise.resolve(); });
    expect(tree.toJSON()).toBeNull();
});

it('does not read or write preferences for an absent message', async () => {
    const tree = mount();
    await run();
    act(() => (tree.getInstance() as HeaderMessage).onClosePress());
    expect(tree.toJSON()).toBeNull();
    expect(Preferences.get).not.toHaveBeenCalled();
    expect(Preferences.set).not.toHaveBeenCalled();
});
