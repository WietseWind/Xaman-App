import { Animated } from 'react-native';
import ListItem from '../ListItem';

jest.mock('@components/General', () => ({ Avatar: () => null, TouchableDebounce: () => null }));

const makeAnimation = () => {
    let callback: ((result: { finished: boolean }) => void) | undefined;
    return {
        start: jest.fn((next?: typeof callback) => { callback = next; }),
        stop: jest.fn(() => callback?.({ finished: false })),
        reset: jest.fn(),
        finish: () => callback?.({ finished: true }),
    };
};
type TestAnimation = ReturnType<typeof makeAnimation>;
let animations: TestAnimation[];
let pulses: TestAnimation[];
const props = (extra = {}) => ({
    token: 'token-id', index: 2, totalTokens: 10, discreetMode: false, onPress: jest.fn(), ...extra,
});
const setProps = (item: ListItem, next: any) => {
    const previous = item.props;
    (item as any).props = next;
    item.componentDidUpdate(previous);
};
const active = () => animations.filter((animation) => animation.start.mock.calls.length > 0);

beforeEach(() => {
    jest.useFakeTimers();
    animations = [];
    pulses = [];
    jest.spyOn(Animated, 'timing').mockImplementation(() => {
        const animation = makeAnimation();
        animations.push(animation);
        return animation;
    });
    jest.spyOn(Animated, 'sequence').mockImplementation(() => {
        const animation = makeAnimation();
        animations.push(animation);
        pulses.push(animation);
        return animation;
    });
});
afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
});

it('keeps the initial index delay, native pulse settings and mounted repeat delay', () => {
    const item = new ListItem(props());
    item.componentDidMount();
    jest.advanceTimersByTime(799);
    expect(pulses).toHaveLength(0);
    jest.advanceTimersByTime(1);
    expect(pulses).toHaveLength(1);
    expect(pulses[0].start).toHaveBeenCalledTimes(1);
    expect(Animated.timing).toHaveBeenNthCalledWith(1, expect.anything(), {
        toValue: 0.3, duration: 1000, useNativeDriver: true,
    });
    expect(Animated.timing).toHaveBeenNthCalledWith(2, expect.anything(), {
        toValue: 0.8, duration: 1000, useNativeDriver: true,
    });
    pulses[0].finish();
    jest.advanceTimersByTime(1999);
    expect(pulses).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(pulses).toHaveLength(2);
    item.componentWillUnmount();
});

it('clears every pending placeholder and fade timer when unmounted', () => {
    const item = new ListItem(props());
    item.componentDidMount();
    setProps(item, props({ name: 'Loaded metadata' }));
    setProps(item, props());
    expect(jest.getTimerCount()).toBe(3);
    item.componentWillUnmount();
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(60_000);
    expect(active()).toHaveLength(0);
});

it('stops an active pulse on unmount without restarting from its finished=false callback', () => {
    const item = new ListItem(props({ index: 0 }));
    item.componentDidMount();
    jest.advanceTimersByTime(0);
    expect(pulses).toHaveLength(1);
    item.componentWillUnmount();
    expect(pulses[0].stop).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(60_000);
    expect(pulses).toHaveLength(1);
});

it('keeps the existing retry delay after an interrupted animation while mounted', () => {
    const item = new ListItem(props({ index: 0 }));
    item.componentDidMount();
    jest.advanceTimersByTime(0);
    pulses[0].stop();
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(1999);
    expect(pulses).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(pulses).toHaveLength(2);
    item.componentWillUnmount();
});

it('keeps the loaded fade delay and stops both active animations when the list closes', () => {
    const item = new ListItem(props());
    item.componentDidMount();
    jest.advanceTimersByTime(800);
    setProps(item, props({ name: 'Loaded metadata' }));
    jest.advanceTimersByTime(19);
    expect(active()).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(active()).toHaveLength(2);
    expect(Animated.timing).toHaveBeenLastCalledWith(expect.anything(), {
        toValue: 1, duration: 600, useNativeDriver: true,
    });
    const running = [...active()];
    item.componentWillUnmount();
    running.forEach((animation) => expect(animation.stop).toHaveBeenCalledTimes(1));
    expect(jest.getTimerCount()).toBe(0);
});

it('does not create delayed work or start animations after unmount', () => {
    const item = new ListItem(props());
    item.componentDidMount();
    item.componentWillUnmount();
    item.startPlaceholderAnimation();
    item.startFadeInAnimation();
    setProps(item, props({ name: 'Late metadata' }));
    expect(jest.getTimerCount()).toBe(0);
    expect(active()).toHaveLength(0);
});

it('does not animate a row whose metadata was already loaded', () => {
    const item = new ListItem(props({ name: 'Loaded metadata' }));
    item.componentDidMount();
    expect(jest.getTimerCount()).toBe(0);
    expect(active()).toHaveLength(0);
    item.componentWillUnmount();
});
