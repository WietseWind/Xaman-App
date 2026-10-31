import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Animated, AppState, PanResponder, Text } from 'react-native';
import ReorderableAccountList from '../ReorderableAccountList';

jest.mock('@common/helpers/interface', () => ({ VibrateHapticFeedback: jest.fn() }));
jest.mock('@store/repositories/core', () => ({ __esModule: true, default: {} }));
jest.mock('@common/helpers/device', () => ({ GetLayoutInsets: () => ({ top: 20, bottom: 34 }) }));

let frames: Map<number, (time: number) => void>;
let sequence: number;
let time: number;
let appState: (state: string) => void;
let responder: any;

function setup(count = 20) {
    const onReorder = jest.fn();
    const props = {
        data: Array.from({ length: count }, (_, i) => String(i)),
        sortable: true,
        keyExtractor: (item: string) => item,
        renderItem: () => null,
        onPress: jest.fn(),
        onReorder,
    };
    const list = new ReorderableAccountList(props);
    jest.spyOn(list, 'setState').mockImplementation((update) => {
        Object.assign(list.state, update);
    });
    const scrollTo = jest.fn();
    Object.assign(list as any, {
        viewport: { current: { measureInWindow: (callback: any) => callback(0, 100, 350, 300) } },
        scroll: { current: { scrollTo } },
        viewportHeight: 300,
        heights: new Map(props.data.map((key) => [key, 120])),
        touchActive: true,
    });
    list.componentDidMount();
    return { list, props, onReorder, scrollTo };
}

function hold(milliseconds: number) {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 16) {
        time += 16;
        const pending = [...frames.values()];
        frames.clear();
        const now = time;
        pending.forEach((callback) => callback(now));
    }
}

beforeEach(() => {
    frames = new Map();
    sequence = 0;
    time = 0;
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
        const id = ++sequence;
        frames.set(id, callback);
        return id;
    });
    jest.spyOn(global, 'cancelAnimationFrame').mockImplementation((id) => {
        frames.delete(id);
    });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback: any) => {
        appState = callback;
        return { remove: jest.fn() };
    });
    jest.spyOn(PanResponder, 'create').mockImplementation((config) => {
        responder = config;
        return { panHandlers: {} } as any;
    });
    jest.spyOn(Animated, 'timing').mockImplementation((value: any, config: any) => ({
        start: () => value.setValue(config.toValue),
        stop: jest.fn(),
        reset: jest.fn(),
    }));
});
afterEach(() => jest.restoreAllMocks());

it('lets ordinary scrolling pass through, then captures upward and downward moves after a hold', () => {
    const { list } = setup();
    expect(responder.onStartShouldSetPanResponder()).toBe(false);
    expect(responder.onMoveShouldSetPanResponderCapture({}, { dx: 0, dy: -30 })).toBe(false);
    list.begin('0', { nativeEvent: { pageY: 160 } } as any);
    expect(responder.onMoveShouldSetPanResponderCapture({}, { dx: 0, dy: -30 })).toBe(true);
    expect(responder.onMoveShouldSetPanResponderCapture({}, { dx: 0, dy: 30 })).toBe(true);
    list.componentWillUnmount();
});

it('scrolls downward on a stationary edge hold and keeps the account under the finger', () => {
    const { list, onReorder, scrollTo } = setup();
    list.begin('0', { nativeEvent: { pageY: 160 } } as any);
    list.move(395);
    hold(1500);
    const internal = list as any;
    expect(internal.offset).toBeGreaterThan(500);
    const contentTop = internal.translations.get('0').__getValue();
    expect(contentTop - internal.offset + 100 + 60).toBeCloseTo(395);
    expect(scrollTo).toHaveBeenCalledWith({ y: internal.offset, animated: false });
    list.finish(true);
    expect(onReorder).toHaveBeenCalledTimes(1);
    const result = onReorder.mock.calls[0][0];
    expect(result.indexOf('0')).toBeGreaterThan(5);
    expect(result.filter((key: string) => key !== '0')).toEqual(list.props.data.slice(1));
    expect(new Set(result).size).toBe(20);
    expect(frames.size).toBe(0);
    list.finish(true);
    expect(onReorder).toHaveBeenCalledTimes(1);
    list.componentWillUnmount();
});

it('holds upward all the way to the first position and stops at offset zero', () => {
    const { list, onReorder } = setup();
    Object.assign(list as any, { offset: 1200 });
    list.begin('12', { nativeEvent: { pageY: 350 } } as any);
    list.move(101);
    hold(8000);
    expect((list as any).offset).toBe(0);
    expect(frames.size).toBe(0);
    list.finish(true);
    expect(onReorder.mock.calls[0][0][0]).toBe('12');
    list.componentWillUnmount();
});

it('never scrolls to a negative offset when all rows fit on the screen', () => {
    const { list, scrollTo } = setup(2);
    list.begin('0', { nativeEvent: { pageY: 160 } } as any);
    list.move(395);
    hold(1000);
    expect((list as any).offset).toBe(0);
    expect(scrollTo.mock.calls.every(([request]) => request.y >= 0)).toBe(true);
    expect(frames.size).toBe(0);
    list.componentWillUnmount();
});

it.each(['cancel', 'background', 'data change', 'disable', 'unmount'])(
    'cleans up %s without saving a partial order',
    (reason) => {
        const { list, props, onReorder, scrollTo } = setup();
        list.begin('0', { nativeEvent: { pageY: 160 } } as any);
        list.move(395);
        hold(100);
        const queued = [...frames.values()];
        if (reason === 'cancel') responder.onPanResponderTerminate();
        if (reason === 'background') appState('background');
        if (reason === 'data change') {
            Object.assign(list, { props: { ...props, data: [...props.data].reverse() } });
            list.componentDidUpdate(props);
        }
        if (reason === 'disable') {
            Object.assign(list, { props: { ...props, sortable: false } });
            list.componentDidUpdate(props);
        }
        if (reason === 'unmount') list.componentWillUnmount();
        const calls = scrollTo.mock.calls.length;
        queued.forEach((callback) => callback(time + 16));
        hold(1000);
        expect(scrollTo).toHaveBeenCalledTimes(calls);
        expect(onReorder).not.toHaveBeenCalled();
        expect((list as any).drag).toBeUndefined();
        expect(frames.size).toBe(0);
        if (reason !== 'unmount') list.componentWillUnmount();
    },
);

it('does not lift a row if the finger is released while native measurement is pending', () => {
    const { list } = setup();
    let measured: any;
    (list as any).viewport.current.measureInWindow = (callback: any) => {
        measured = callback;
    };
    list.begin('0', { nativeEvent: { pageY: 160 } } as any);
    list.finish(true);
    measured(0, 100, 350, 300);
    expect((list as any).drag).toBeUndefined();
    expect(frames.size).toBe(0);
    list.componentWillUnmount();
});

it('ignores an old gesture’s delivered frame after a new gesture has begun', () => {
    const { list, scrollTo } = setup();
    list.begin('0', { nativeEvent: { pageY: 160 } } as any);
    list.move(395);
    const oldFrame = [...frames.values()][0];
    list.finish(false);
    (list as any).touchActive = true;
    list.begin('1', { nativeEvent: { pageY: 280 } } as any);
    const count = scrollTo.mock.calls.length;
    oldFrame(100);
    expect(scrollTo).toHaveBeenCalledTimes(count);
    expect((list as any).offset).toBe(0);
    list.componentWillUnmount();
});

it('defers an arriving account status until release so it cannot resize the held row', () => {
    const props = {
        data: ['A', 'B'],
        sortable: true,
        keyExtractor: (item: string) => item,
        onPress: jest.fn(),
        onReorder: jest.fn(),
    };
    let tree: renderer.ReactTestRenderer;
    act(() => {
        tree = renderer.create(
            <ReorderableAccountList
                data={props.data}
                sortable={props.sortable}
                keyExtractor={props.keyExtractor}
                onPress={props.onPress}
                onReorder={props.onReorder}
                renderItem={() => <Text>Loading status</Text>}
            />,
        );
    });
    const list = tree!.getInstance() as unknown as ReorderableAccountList<string>;
    Object.assign(list as any, {
        viewport: { current: { measureInWindow: (callback: any) => callback(0, 100) } },
        scroll: { current: { scrollTo: jest.fn() } },
        heights: new Map([
            ['A', 120],
            ['B', 120],
        ]),
        viewportHeight: 300,
        touchActive: true,
    });
    act(() => list.begin('A', { nativeEvent: { pageY: 160 } } as any));
    act(() => {
        tree!.update(
            <ReorderableAccountList
                data={props.data}
                sortable={props.sortable}
                keyExtractor={props.keyExtractor}
                onPress={props.onPress}
                onReorder={props.onReorder}
                renderItem={() => <Text>Pro status</Text>}
            />,
        );
    });
    expect(tree!.root.findAllByType(Text).map((node) => node.props.children)).toEqual([
        'Loading status',
        'Loading status',
    ]);
    act(() => list.finish(false));
    expect(tree!.root.findAllByType(Text).map((node) => node.props.children)).toEqual([
        'Pro status',
        'Pro status',
    ]);
    act(() => tree!.unmount());
});
