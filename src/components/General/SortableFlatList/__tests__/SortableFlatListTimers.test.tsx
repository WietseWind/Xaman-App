import { InteractionManager } from 'react-native';
import { AccountRepository, CoreRepository } from '@store/repositories';
import AppService from '@services/AppService';
import SortableFlatList from '../SortableFlatList';

jest.mock('@store/repositories', () => ({
    CoreRepository: { getSettings: jest.fn(() => ({ accountWorthInfo: 'id|title', currency: 'USD' })),
        on: jest.fn(), off: jest.fn() },
    AccountRepository: { on: jest.fn(), off: jest.fn() },
}));
jest.mock('@services/BackendService', () => ({ __esModule: true, default: {} }));
jest.mock('@services/AppService', () => ({ __esModule: true,
    default: { addListener: jest.fn(), removeListener: jest.fn() },
    AppStateStatus: { Active: 'Active', Inactive: 'Inactive' },
}));
jest.mock('@common/helpers/navigator', () => ({ Navigator: { showModal: jest.fn() } }));
jest.mock('@components/General/SortableFlatList/CellComponent', () => ({ __esModule: true, default: () => null }));

let frames: Map<number, (time: number) => void>;
let frameSequence: number;
let mountTasks: Array<{ callback: () => void; cancel: jest.Mock }>;
const setup = (runMount = true) => {
    const list = new SortableFlatList({ ...SortableFlatList.defaultProps,
        topFade: false, accWorthEnabled: false, itemHeight: 50, separatorHeight: 0,
        dataSource: Array.from({ length: 20 }, (_, index) => index), renderItem: () => null,
    });
    jest.spyOn(list, 'setState').mockImplementation((update: any, callback?: () => void) => {
        Object.assign(list.state, typeof update === 'function' ? update(list.state, list.props) : update);
        callback?.();
    });
    list.componentDidMount();
    if (runMount) mountTasks[mountTasks.length - 1].callback();
    return list;
};
const startScroll = (list: SortableFlatList) => {
    const scroll = jest.fn();
    Object.assign(list as any, {
        currentAutoScrollState: 'MOVING_DOWN', currentScrollOffset: 0, scrollWindowHeight: 100,
        activeItem: {}, listRef: { current: { scrollToOffset: scroll } },
    });
    const move = jest.spyOn(list, 'onItemMove').mockImplementation(() => undefined);
    list.startAutoScroll();
    return { scroll, move };
};
const runFrames = () => {
    for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback(0);
    }
};

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    frames = new Map();
    frameSequence = 0;
    mountTasks = [];
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
        const id = ++frameSequence;
        frames.set(id, callback);
        return id;
    });
    jest.spyOn(global, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id); });
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback: any) => {
        const task = { callback, cancel: jest.fn() };
        mountTasks.push(task);
        return task as any;
    });
});
afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
});

it('keeps the mounted 10 ms scroll cadence and frame updates', () => {
    const list = setup();
    const { scroll, move } = startScroll(list);
    jest.advanceTimersByTime(9);
    expect(scroll).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith({ offset: 1, animated: false });
    runFrames();
    expect(move).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(10);
    expect(scroll).toHaveBeenCalledTimes(2);
    list.componentWillUnmount();
});

it('clears the auto-scroll interval and every pending scale timer on unmount', () => {
    const list = setup();
    const { scroll } = startScroll(list);
    Object.assign(list as any, { isMovePanResponder: true, isActiveItemMoved: false });
    const release = jest.spyOn(list, 'onItemRelease').mockImplementation(() => undefined);
    list.onItemPressOut();
    list.onItemPressOut();
    expect(jest.getTimerCount()).toBe(3);
    list.componentWillUnmount();
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(10_000);
    expect(scroll).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
});

it('cancels all queued frames and ignores a frame already delivered after unmount', () => {
    const list = setup();
    const { scroll, move } = startScroll(list);
    jest.advanceTimersByTime(20);
    expect(frames.size).toBe(2);
    const lateCallbacks = [...frames.values()];
    const scrollCount = scroll.mock.calls.length;
    list.componentWillUnmount();
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(2);
    expect(frames.size).toBe(0);
    lateCallbacks.forEach((callback) => callback(0));
    expect(move).not.toHaveBeenCalled();
    expect(scroll).toHaveBeenCalledTimes(scrollCount);
});

it('keeps the mounted 220 ms scale recovery delay', () => {
    const list = setup();
    Object.assign(list as any, { isMovePanResponder: true, isActiveItemMoved: false });
    const release = jest.spyOn(list, 'onItemRelease').mockImplementation(() => undefined);
    list.onItemPressOut();
    jest.advanceTimersByTime(219);
    expect(release).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(release).toHaveBeenCalledTimes(1);
    list.componentWillUnmount();
});

it('cancels deferred mount work so it cannot subscribe or restart polling after unmount', () => {
    const list = setup(false);
    const fetch = jest.spyOn(list, 'fetchAccountWorth');
    list.componentWillUnmount();
    expect(mountTasks[0].cancel).toHaveBeenCalledTimes(1);
    mountTasks[0].callback();
    expect(CoreRepository.getSettings).not.toHaveBeenCalled();
    expect(CoreRepository.on).not.toHaveBeenCalled();
    expect(AccountRepository.on).not.toHaveBeenCalled();
    expect(AppService.addListener).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
});

it('initializes and removes the normal mounted subscriptions', () => {
    const list = setup(false);
    const fetch = jest.spyOn(list, 'fetchAccountWorth');
    mountTasks[0].callback();
    expect(fetch).toHaveBeenCalledWith(undefined, 'COMPONENT_MOUNT');
    expect(CoreRepository.on).toHaveBeenCalledTimes(1);
    expect(AccountRepository.on).toHaveBeenCalledTimes(1);
    expect(AppService.addListener).toHaveBeenCalledTimes(1);
    expect(list.state.accWorthIdentifier).toBe('id');
    expect(list.state.accWorthTitle).toBe('title');
    list.componentWillUnmount();
    expect(CoreRepository.off).toHaveBeenCalledTimes(1);
    expect(AccountRepository.off).toHaveBeenCalledTimes(1);
    expect(AppService.removeListener).toHaveBeenCalledTimes(1);
});

it('does not schedule a late scroll or scale timer after unmount', () => {
    const list = setup();
    list.componentWillUnmount();
    list.startAutoScroll();
    list.onItemPressOut();
    expect(jest.getTimerCount()).toBe(0);
    expect(frames.size).toBe(0);
});
