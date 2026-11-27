import { NativeModules, Platform } from 'react-native';
import { watchAndroidKeyboardGeometry } from '../androidKeyboardGeometry';

const mockStart = jest.fn();
const mockStop = jest.fn();
const mockRemove = jest.fn();
let mockHandler: (event: any) => void;
const mockSubscribe = jest.fn((event: string, handler: (value: any) => void) => {
    mockHandler = handler;
    return { remove: mockRemove };
});
jest.mock('react-native', () => ({
    Platform: { OS: 'android' },
    NativeModules: { KeyboardModule: {} },
    DeviceEventEmitter: {
        addListener: (event: string, handler: (value: any) => void) => mockSubscribe(event, handler),
    },
}));
const releases: (() => void)[] = [];
const watch = (listener = jest.fn()) => {
    const release = watchAndroidKeyboardGeometry(listener);
    releases.push(release);
    return { listener, release };
};
beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'android';
    NativeModules.KeyboardModule = {
        startWindowGeometryObservation: mockStart, stopWindowGeometryObservation: mockStop,
    };
});
afterEach(() => { releases.splice(0).forEach((release) => release()); });

it('does nothing before a lease is acquired', () => {
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockSubscribe).not.toHaveBeenCalled();
});

it('shares one native observer between multiple active owners', () => {
    const first = watch();
    const second = watch();
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(mockSubscribe).toHaveBeenCalledWith('KeyboardWindowGeometryChanged', expect.any(Function));
    const geometry = { keyboardTop: 121, visible: true };
    mockHandler(geometry);
    expect(first.listener).toHaveBeenCalledWith(geometry);
    expect(second.listener).toHaveBeenCalledWith(geometry);
    first.release();
    first.release();
    expect(mockStop).not.toHaveBeenCalled();
    second.release();
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockStop).toHaveBeenCalledTimes(1);
});

it('treats duplicate listener functions as independent leases', () => {
    const listener = jest.fn();
    const first = watch(listener);
    const second = watch(listener);
    first.release();
    mockHandler({ keyboardTop: 121, visible: true });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(mockStop).not.toHaveBeenCalled();
    second.release();
    expect(mockStop).toHaveBeenCalledTimes(1);
});

it('does not deliver an old subscription callback to a new lease', () => {
    const old = watch();
    const oldHandler = mockHandler;
    old.release();
    const current = watch();
    oldHandler({ keyboardTop: 400, visible: false });
    expect(current.listener).not.toHaveBeenCalled();
    mockHandler({ keyboardTop: 121, visible: true });
    expect(current.listener).toHaveBeenCalledTimes(1);
});

it('does not notify a listener released during the same event', () => {
    let second: ReturnType<typeof watch>;
    watch(jest.fn(() => second.release()));
    second = watch();
    mockHandler({ keyboardTop: 121, visible: true });
    expect(second.listener).not.toHaveBeenCalled();
});

it.each(['ios', 'missing start', 'missing stop'])('is a no-op for %s', (mode) => {
    if (mode === 'ios') (Platform as any).OS = 'ios';
    if (mode === 'missing start') delete NativeModules.KeyboardModule.startWindowGeometryObservation;
    if (mode === 'missing stop') delete NativeModules.KeyboardModule.stopWindowGeometryObservation;
    const lease = watch();
    lease.release();
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockStop).not.toHaveBeenCalled();
    expect(mockSubscribe).not.toHaveBeenCalled();
});
