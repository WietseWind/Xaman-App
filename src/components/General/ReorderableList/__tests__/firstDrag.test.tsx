import { Animated, AppState, PanResponder } from 'react-native';
import ReorderableList from '../ReorderableList';
import ReorderableAccountList from '@screens/Account/List/ReorderableAccountList';

jest.mock('@common/helpers/interface', () => ({ VibrateHapticFeedback: jest.fn() }));
jest.mock('@store/repositories/core', () => ({ __esModule: true, default: {} }));
jest.mock('@common/helpers/device', () => ({ GetLayoutInsets: () => ({ top: 20, bottom: 34 }) }));

let frames: Map<number, (time: number) => void>;
let sequence: number;
let time: number;
let pan: any;
const touch = (pageY: number, identifier = 'primary') => ({
    nativeEvent: { pageY, identifier, touches: [{ pageY, identifier }] },
}) as any;
const hold = (milliseconds: number) => {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 16) {
        time += 16;
        const pending = [...frames.values()];
        frames.clear();
        const now = time;
        pending.forEach(callback => callback(now));
    }
};
const setup = (List: typeof ReorderableList | typeof ReorderableAccountList, count = 20) => {
    const props = {
        data: Array.from({ length: count }, (_, i) => String(i)),
        sortable: true,
        keyExtractor: (item: string) => item,
        renderItem: () => null,
        onPress: jest.fn(),
        onReorder: jest.fn(),
    };
    const list = new List(props);
    jest.spyOn(list, 'setState').mockImplementation(update => { Object.assign(list.state, update); });
    let measured: (x: number, y: number) => void = () => undefined;
    const scrollTo = jest.fn();
    Object.assign(list as any, {
        viewport: { current: { measureInWindow: (callback: any) => { measured = callback; } } },
        scroll: { current: { scrollTo } },
        viewportHeight: 300,
        contentHeight: count * 120,
        offset: count * 120 - 300,
        heights: new Map(props.data.map(key => [key, 120])),
    });
    list.componentDidMount();
    const root = list.render();
    root.props.onTouchStart(touch(340));
    return { list, props, root, measured: () => measured(0, 100), scrollTo };
};
beforeEach(() => {
    frames = new Map(); sequence = 0; time = 0;
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => {
        const id = ++sequence; frames.set(id, callback); return id;
    });
    jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
    jest.spyOn(PanResponder, 'create').mockImplementation(config => {
        pan = config; return { panHandlers: {} } as any;
    });
    jest.spyOn(Animated, 'timing').mockImplementation((value: any, config: any) => ({
        start: () => value.setValue(config.toValue), stop: jest.fn(), reset: jest.fn(),
    }));
});
afterEach(() => jest.restoreAllMocks());

describe.each([
    ['tokens', ReorderableList],
    ['accounts', ReorderableAccountList],
] as const)('%s: first drag from the bottom', (_, List) => {
    it('moves on the responder grant even if no later movement event arrives', () => {
        const { list, measured, props } = setup(List);
        list.begin('19', touch(340)); measured();
        // RN can consume this first move while transferring the responder from Pressable.
        // The finger then stays at the edge: there may be no subsequent onResponderMove.
        pan.onPanResponderGrant?.(touch(101), { moveY: 101 });
        hold(6000); list.finish(true);
        expect(props.onReorder).toHaveBeenCalledWith(['19', ...props.data.slice(0, 19)]);
        expect((list as any).offset).toBe(0);
        list.componentWillUnmount();
    });
    it('keeps the newest finger position when native measurement resolves after the move', () => {
        const { list, root, measured } = setup(List);
        list.begin('19', touch(340));
        root.props.onTouchMove?.(touch(101));
        measured();
        expect((list as any).drag.pageY).toBe(101);
        const translated = (list as any).translations.get('19').__getValue();
        expect(translated).toBeCloseTo(-239);
        hold(6000);
        expect((list as any).offset).toBe(0);
        list.componentWillUnmount();
    });
    it('keeps the grab point when native scrolling settles while measurement is pending', () => {
        const { list, root, measured } = setup(List);
        list.begin('19', touch(340));
        (list as any).onScroll({ nativeEvent: { contentOffset: { y: 1900 } } });
        root.props.onTouchMove?.(touch(101)); measured();
        const internal = list as any;
        expect(internal.drag.grabOffset).toBe(60);
        const visualTop = 2280 + internal.translations.get('19').__getValue() - internal.offset + 100;
        expect(visualTop + internal.drag.grabOffset).toBeCloseTo(101);
        list.componentWillUnmount();
    });
    it('follows touch movement while the parent responder has not been granted yet', () => {
        const { list, root, measured, props } = setup(List);
        list.begin('19', touch(340)); measured();
        root.props.onTouchMove?.(touch(101));
        hold(6000); root.props.onTouchEnd(); pan.onPanResponderRelease();
        expect(props.onReorder).toHaveBeenCalledTimes(1);
        expect(props.onReorder.mock.calls[0][0][0]).toBe('19');
        expect(frames.size).toBe(0);
        list.componentWillUnmount();
    });
    it('animates only crossed neighbours instead of initializing every row on the first move', () => {
        const { list, measured } = setup(List, 200);
        list.begin('199', touch(340)); measured();
        list.move(210);
        expect(Animated.timing).toHaveBeenCalledTimes(1);
        expect(Animated.timing).toHaveBeenLastCalledWith(
            (list as any).translations.get('198'), expect.objectContaining({ toValue: 120 }),
        );
        list.move(205);
        expect(Animated.timing).toHaveBeenCalledTimes(1);
        list.move(90);
        expect(Animated.timing).toHaveBeenCalledTimes(2);
        list.move(340);
        expect(Animated.timing).toHaveBeenCalledTimes(4);
        list.componentWillUnmount();
    });
    it('ignores a different finger and a late measurement after cancellation', () => {
        const { list, root, measured, props } = setup(List);
        list.begin('19', touch(340));
        root.props.onTouchMove?.(touch(101, 'other'));
        root.props.onTouchCancel(); measured(); hold(6000);
        expect((list as any).drag).toBeUndefined();
        expect(props.onReorder).not.toHaveBeenCalled();
        expect(frames.size).toBe(0);
        list.componentWillUnmount();
    });
    it('keeps ordinary scrolling available without lifting or saving', () => {
        const { list, root, props } = setup(List);
        root.props.onTouchMove?.(touch(150));
        (list as any).onScroll({ nativeEvent: { contentOffset: { y: 1900 } } });
        root.props.onTouchEnd();
        expect((list as any).drag).toBeUndefined();
        expect((list as any).offset).toBe(1900);
        expect(props.onReorder).not.toHaveBeenCalled();
        expect(frames.size).toBe(0);
        list.componentWillUnmount();
    });
});
