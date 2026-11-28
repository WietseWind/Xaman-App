import { NativeModules, Platform } from 'react-native';
import { AdaptiveOverlayKeyboard } from '../adaptiveOverlayKeyboard';

let mockQuery: jest.Mock;
const mockHandlers: Record<string, () => void> = {};
const mockRemove = jest.fn();
const mockGeometryRelease = jest.fn();
const mockGeometrySignals: (() => void)[] = [];
const mockWatchGeometry = jest.fn((listener: () => void) => {
    mockGeometrySignals.push(listener);
    return mockGeometryRelease;
});
jest.mock('../androidKeyboardGeometry', () => ({
    watchAndroidKeyboardGeometry: (listener: () => void) => mockWatchGeometry(listener),
}));
jest.mock('react-native', () => ({
    Platform: { OS: 'android' },
    NativeModules: { KeyboardModule: { getWindowGeometry: () => mockQuery() } },
    Keyboard: {
        addListener: (name: string, callback: () => void) => {
            mockHandlers[name] = callback;
            return { remove: () => { mockRemove(name); delete mockHandlers[name]; } };
        },
    },
}));

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const fixture = ({ scale = 0.5, baseBottom = 320, offset = 0, context = true,
    deferMeasure = false, deferMovement = false,
    getRestingBottom = undefined as undefined | ((height: number, scale: number) => Promise<number | undefined>),
    onHide = undefined as undefined | (() => void),
} = {}) => {
    let currentContext: any = context ? { left: 200, width: 200, height: 400, columnWidth: 400, scale } : undefined;
    let currentOffset = offset;
    let appliedOffset = offset;
    let pendingMeasure: any;
    let currentBase = baseBottom;
    const input: any = {
        measureInWindow: jest.fn((callback) => {
            const measure = () => callback(0, currentBase - 40 * currentContext.scale -
                appliedOffset * currentContext.scale, 100, 40);
            if (deferMeasure) pendingMeasure = measure; else measure();
        }),
    };
    let currentInput = input;
    const guards: (() => boolean)[] = [];
    const setOffset = jest.fn((value, guard) => {
        currentOffset = value;
        if (!deferMovement) appliedOffset = value;
        guards.push(guard);
    });
    const controller = new AdaptiveOverlayKeyboard({
        getContext: () => currentContext, getInput: () => currentInput,
        getOffset: () => currentOffset, getAppliedOffset: () => appliedOffset, getRestingBottom, setOffset, onHide,
    });
    controller.mount();
    return { controller, input, setOffset, guards, offset: () => currentOffset,
        setInput: (value: any) => { currentInput = value; },
        context: (value: any) => { currentContext = value; },
        base: (value: number) => { currentBase = value; },
        finishMeasure: () => pendingMeasure(),
    };
};

beforeEach(() => {
    jest.clearAllMocks();
    mockGeometrySignals.length = 0;
    Object.keys(mockHandlers).forEach((key) => delete mockHandlers[key]);
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    mockQuery = jest.fn().mockResolvedValue({ keyboardTop: 250, visible: true });
    NativeModules.KeyboardModule.getWindowGeometry = () => mockQuery();
});

describe('adaptive overlay keyboard', () => {
    it('hands the active IME lease to a pane and resumes translation after leaving', async () => {
        const onHide = jest.fn();
        const f = fixture({ onHide });
        f.controller.show();
        await flush();
        expect(f.offset()).toBe(140);
        f.context({ left: 0, width: 600, height: 411, columnWidth: 600, scale: 1, fullPane: true });
        f.controller.contextChanged();
        expect(mockGeometryRelease).toHaveBeenCalledTimes(1);
        expect(onHide).toHaveBeenCalledTimes(1);
        expect(f.offset()).toBe(0);
        f.controller.show();
        await flush();
        expect(mockQuery).toHaveBeenCalledTimes(1);
        f.context({ left: 200, width: 200, height: 400, columnWidth: 400, scale: 0.5 });
        f.controller.contextChanged();
        await flush();
        expect(mockQuery).toHaveBeenCalledTimes(2);
        expect(f.offset()).toBe(140);
        f.controller.unmount();
        expect(mockGeometryRelease).toHaveBeenCalledTimes(2);
    });
    it('hands full-pane placement to the bounded card and drops any old whole-card offset', async () => {
        const f = fixture({ offset: 230 });
        f.context({ left: 0, width: 600, height: 411, columnWidth: 600, scale: 1, fullPane: true });
        const fallback = jest.fn();
        expect(f.controller.show(fallback)).toBe(true);
        await flush();
        expect(f.offset()).toBe(0);
        expect(mockQuery).not.toHaveBeenCalled();
        expect(mockWatchGeometry).not.toHaveBeenCalled();
        expect(fallback).not.toHaveBeenCalled();
        expect(f.controller.hide()).toBe(true);
        f.controller.unmount();
    });
    it('converts physical overlap to logical offset using the untransformed native height', async () => {
        const f = fixture();
        f.controller.show();
        await flush();
        expect(f.offset()).toBe(140);
        expect(f.guards[0]()).toBe(true);
    });

    it('adds an existing logical offset to the measured overlap', async () => {
        const f = fixture({ offset: 60 });
        f.controller.show();
        await flush();
        expect(f.offset()).toBe(140);
    });

    it('does not add the overlap twice while the sheet spring has not moved yet', async () => {
        const f = fixture();
        f.input.measureInWindow.mockImplementation((callback: any) => callback(0, 300, 100, 40));
        f.controller.show();
        await flush();
        f.controller.show();
        await flush();
        expect(f.setOffset).toHaveBeenCalledTimes(1);
        expect(f.offset()).toBe(140);
    });

    it('keeps a settled input stable on focus while the keyboard stays open', async () => {
        const f = fixture();
        f.controller.show();
        await flush();
        f.controller.focus();
        await flush();
        expect(f.setOffset).toHaveBeenCalledTimes(1);
        expect(f.offset()).toBe(140);
    });

    it('updates total offset when the current native keyboard top changes', async () => {
        const f = fixture();
        f.controller.show();
        await flush();
        mockQuery.mockResolvedValue({ keyboardTop: 270, visible: true });
        f.controller.show();
        await flush();
        expect(f.offset()).toBe(100);
    });

    it('remeasures the same logical offset after a window and scale change', async () => {
        const f = fixture();
        f.controller.show();
        await flush();
        f.context({ left: 0, width: 300, height: 500, columnWidth: 400, scale: 0.75 });
        f.base(400);
        f.controller.contextChanged();
        await flush();
        expect(f.offset()).toBe(200);
        expect(f.guards[0]()).toBe(false);
    });

    it('uses actual displacement when a context change interrupts a pending snap target', async () => {
        const f = fixture({ baseBottom: 500, deferMovement: true });
        mockQuery.mockResolvedValue({ keyboardTop: 400, visible: true });
        f.controller.show();
        await flush();
        expect(f.offset()).toBe(200);
        // The old 200dp target is still queued; the native panel has not moved.
        f.context({ left: 0, width: 160, height: 400, columnWidth: 400, scale: 0.4 });
        f.base(400);
        mockQuery.mockResolvedValue({ keyboardTop: 300, visible: true });
        f.controller.contextChanged();
        await flush();
        expect(f.offset()).toBe(250);
        expect(f.guards[0]()).toBe(false);
    });

    it('uses an independently measured resting bottom for a centered layout animation', async () => {
        const getRestingBottom = jest.fn().mockResolvedValue(320);
        const f = fixture({ baseBottom: 5000, getRestingBottom });
        f.controller.show();
        await flush();
        expect(getRestingBottom).toHaveBeenCalledWith(40, 0.5);
        expect(f.offset()).toBe(140);
    });

    it.each([undefined, 0, -1, Number.NaN])('skips an unavailable centered resting bottom: %s', async (value) => {
        const f = fixture({ getRestingBottom: jest.fn().mockResolvedValue(value) });
        f.controller.show();
        await flush();
        expect(f.setOffset).not.toHaveBeenCalled();
    });

    it('guards a pending centered resting-bottom measurement after cancellation', async () => {
        let resolve: (value: number) => void = () => undefined;
        const f = fixture({ getRestingBottom: () => new Promise((done) => { resolve = done; }) });
        f.controller.show();
        await flush();
        f.controller.cancel();
        resolve(320);
        await flush();
        expect(f.setOffset).not.toHaveBeenCalled();
    });

    it('requeries a resized window before the first Show query finishes and ignores the old reply', async () => {
        let resolve: (value: any) => void = () => undefined;
        mockQuery.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
        const f = fixture();
        f.controller.show();
        await flush();
        f.context({ left: 0, width: 160, height: 400, columnWidth: 400, scale: 0.4 });
        f.controller.contextChanged();
        await flush();
        expect(mockQuery).toHaveBeenCalledTimes(2);
        expect(f.offset()).toBe(175);
        resolve({ keyboardTop: 50, visible: true });
        await flush();
        expect(f.offset()).toBe(175);
        expect(f.setOffset).toHaveBeenCalledTimes(1);
    });

    it('preserves pending Show intent through context loss until the adaptive window returns', async () => {
        mockQuery.mockReturnValueOnce(new Promise(() => { /* Native reply remains pending. */ }));
        const f = fixture();
        f.controller.show();
        await flush();
        f.context(undefined);
        f.controller.contextChanged();
        f.context({ left: 0, width: 200, height: 400, columnWidth: 400, scale: 0.5 });
        f.controller.contextChanged();
        await flush();
        expect(f.offset()).toBe(140);
        expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('clears pending Show intent when Hide arrives during context loss', async () => {
        mockQuery.mockReturnValue(new Promise(() => { /* Native reply remains pending. */ }));
        const f = fixture();
        f.controller.show();
        await flush();
        f.context(undefined);
        f.controller.contextChanged();
        f.controller.hide();
        f.context({ left: 0, width: 200, height: 400, columnWidth: 400, scale: 0.5 });
        f.controller.contextChanged();
        await flush();
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(f.setOffset).not.toHaveBeenCalled();
    });

    it('recovers a missed custom Show and deduplicates the standard/custom pair', async () => {
        const f = fixture();
        mockHandlers.keyboardDidShow();
        f.controller.show();
        await flush();
        expect(f.setOffset).toHaveBeenCalledTimes(1);
        expect(f.offset()).toBe(140);
        mockHandlers.keyboardDidHide();
        f.controller.hide();
        expect(f.setOffset).toHaveBeenCalledTimes(2);
        expect(f.offset()).toBe(0);
    });

    it('rechecks the settled IME geometry after RN Show exposed the initial zero inset', async () => {
        mockQuery.mockResolvedValue({ keyboardTop: 383, visible: true });
        const f = fixture({ baseBottom: 200 });
        mockHandlers.keyboardDidShow();
        await flush();
        expect(f.offset()).toBe(0);
        expect(mockWatchGeometry).toHaveBeenCalledTimes(1);
        mockQuery.mockResolvedValue({ keyboardTop: 121, visible: true });
        mockGeometrySignals[0]();
        await flush();
        expect(f.offset()).toBe(158);
        expect(mockWatchGeometry).toHaveBeenCalledTimes(1);
    });

    it('observes focus intent lazily without acquiring an observer for an idle overlay', async () => {
        const f = fixture();
        expect(mockWatchGeometry).not.toHaveBeenCalled();
        f.controller.focus();
        f.controller.show();
        await flush();
        expect(mockWatchGeometry).toHaveBeenCalledTimes(1);
    });

    it('does not acquire twice if registration supplies an immediate initial change signal', async () => {
        mockWatchGeometry.mockImplementationOnce((listener) => {
            listener();
            return mockGeometryRelease;
        });
        const f = fixture();
        f.controller.show();
        await flush();
        expect(mockWatchGeometry).toHaveBeenCalledTimes(1);
        expect(f.offset()).toBe(140);
        f.controller.hide();
        expect(mockGeometryRelease).toHaveBeenCalledTimes(1);
    });

    it.each(['hide', 'cancel', 'unmount', 'context'])(
        'releases geometry observation on %s and ignores a detached late signal', async (action) => {
            const f = fixture();
            f.controller.show();
            await flush();
            const lateSignal = mockGeometrySignals[0];
            if (action === 'hide') f.controller.hide();
            if (action === 'cancel') f.controller.cancel();
            if (action === 'unmount') f.controller.unmount();
            if (action === 'context') { f.context(undefined); f.controller.contextChanged(); }
            const count = mockQuery.mock.calls.length;
            lateSignal();
            await flush();
            expect(mockQuery).toHaveBeenCalledTimes(count);
            expect(mockGeometryRelease).toHaveBeenCalledTimes(1);
        },
    );

    it('reacquires observation after adaptive context returns with live Show intent', async () => {
        const f = fixture();
        f.controller.show();
        await flush();
        f.context(undefined);
        f.controller.contextChanged();
        f.context({ left: 0, width: 200, height: 400, columnWidth: 400, scale: 0.5 });
        f.controller.contextChanged();
        await flush();
        expect(mockGeometryRelease).toHaveBeenCalledTimes(1);
        expect(mockWatchGeometry).toHaveBeenCalledTimes(2);
        const count = mockQuery.mock.calls.length;
        mockGeometrySignals[0]();
        await flush();
        expect(mockQuery).toHaveBeenCalledTimes(count);
    });

    it('uses a native hidden geometry signal as the existing owned Hide', async () => {
        const f = fixture();
        f.controller.show();
        await flush();
        mockQuery.mockResolvedValue({ keyboardTop: 383, visible: false });
        mockGeometrySignals[0]();
        await flush();
        expect(f.offset()).toBe(0);
        expect(mockGeometryRelease).toHaveBeenCalledTimes(1);
        expect(f.controller.hide()).toBe(true);
        expect(f.setOffset).toHaveBeenCalledTimes(2);
    });

    it('keeps a duplicate Hide reset valid but invalidates it as soon as a new Show starts', async () => {
        const f = fixture();
        f.controller.show();
        await flush();
        f.controller.hide();
        const hideGuard = f.guards[f.guards.length - 1];
        expect(hideGuard()).toBe(true);
        f.controller.hide();
        expect(hideGuard()).toBe(true);
        f.controller.show();
        expect(hideGuard()).toBe(false);
        await flush();
        expect(f.offset()).toBe(140);
    });

    it.each(['cancel', 'unmount', 'hide', 'context', 'input'])(
        'discards a pending native query after %s', async (action) => {
            let resolve: (value: any) => void = () => undefined;
            mockQuery.mockReturnValue(new Promise((done) => { resolve = done; }));
            const f = fixture();
            const fallback = jest.fn();
            f.controller.show(fallback);
            await flush();
            if (action === 'cancel') f.controller.cancel();
            if (action === 'unmount') f.controller.unmount();
            if (action === 'hide') f.controller.hide();
            if (action === 'context') f.context(undefined);
            if (action === 'input') f.setInput(null);
            resolve({ keyboardTop: 250, visible: true });
            await flush();
            expect(f.setOffset).not.toHaveBeenCalled();
            expect(fallback).not.toHaveBeenCalled();
        },
    );

    it('discards an already queued native measurement after Hide', async () => {
        const f = fixture({ deferMeasure: true });
        f.controller.show();
        await flush();
        f.controller.hide();
        f.finishMeasure();
        expect(f.setOffset).not.toHaveBeenCalled();
    });

    it('invalidates deferred UI work when the overlay closes', async () => {
        const f = fixture();
        f.controller.show();
        await flush();
        f.controller.cancel();
        expect(f.guards[0]()).toBe(false);
        f.controller.show();
        await flush();
        expect(f.setOffset).toHaveBeenCalledTimes(1);
    });

    it('clears the adaptive offset and invalidates work when the context is removed', async () => {
        const f = fixture();
        f.controller.show();
        await flush();
        f.context(undefined);
        f.controller.contextChanged();
        expect(f.offset()).toBe(0);
        expect(f.guards[0]()).toBe(false);
    });

    it.each(['missing', 'null', 'reject'])('uses custom-only legacy fallback for %s geometry', async (mode) => {
        if (mode === 'missing') delete NativeModules.KeyboardModule.getWindowGeometry;
        if (mode === 'null') mockQuery.mockResolvedValue(null);
        if (mode === 'reject') mockQuery.mockRejectedValue(new Error('no window'));
        const f = fixture();
        const fallback = jest.fn();
        f.controller.show(fallback);
        await flush();
        expect(fallback).toHaveBeenCalledTimes(1);
        expect(f.controller.hide()).toBe(true);
        mockHandlers.keyboardDidShow();
        await flush();
        expect(fallback).toHaveBeenCalledTimes(1);
        expect(f.setOffset).not.toHaveBeenCalled();
    });

    it('preserves a custom fallback measurement across duplicate RN Show and resets on RN-only Hide', async () => {
        mockQuery.mockResolvedValue(null);
        const f = fixture();
        let finish: () => void = () => undefined;
        f.controller.show((isCurrent) => {
            finish = () => { if (isCurrent()) f.setOffset(100, isCurrent); };
        });
        await flush();
        mockHandlers.keyboardDidShow();
        await flush();
        finish();
        expect(f.offset()).toBe(100);
        mockHandlers.keyboardDidHide();
        expect(f.offset()).toBe(0);
        expect(f.controller.hide()).toBe(true);
        expect(f.setOffset).toHaveBeenCalledTimes(2);
    });

    it('releases sticky adaptive Hide ownership for a new ordinary custom Show', async () => {
        const f = fixture();
        f.controller.show();
        await flush();
        f.context(undefined);
        f.controller.contextChanged();
        expect(f.offset()).toBe(0);
        expect(f.controller.show(() => undefined)).toBe(false);
        expect(f.controller.hide()).toBe(false);
        expect(f.setOffset).toHaveBeenCalledTimes(2);
    });

    it('trusts an API29 custom Show without a visibility flag, but requires it for RN-only Show', async () => {
        mockQuery.mockResolvedValue({ keyboardTop: 250 });
        const f = fixture();
        mockHandlers.keyboardDidShow();
        await flush();
        expect(f.setOffset).not.toHaveBeenCalled();
        f.controller.show();
        await flush();
        expect(f.offset()).toBe(140);
    });

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid keyboard top %s', async (keyboardTop) => {
        mockQuery.mockResolvedValue({ keyboardTop, visible: true });
        const f = fixture();
        const fallback = jest.fn();
        f.controller.show(fallback);
        await flush();
        expect(fallback).toHaveBeenCalledTimes(1);
        expect(f.setOffset).not.toHaveBeenCalled();
    });

    it('does not move for a native hidden keyboard or an input above the keyboard', async () => {
        const f = fixture({ baseBottom: 200 });
        f.controller.show();
        await flush();
        expect(f.setOffset).not.toHaveBeenCalled();
        mockQuery.mockResolvedValue({ keyboardTop: 0, visible: false });
        f.controller.focus();
        await flush();
        expect(f.offset()).toBe(0);
    });

    it.each(['android', 'ios'])('leaves the ordinary %s handler in control', async (os) => {
        Object.defineProperty(Platform, 'OS', { value: os });
        const f = fixture({ context: os === 'ios' });
        expect(f.controller.show()).toBe(false);
        expect(f.controller.hide()).toBe(false);
        await flush();
        expect(mockQuery).not.toHaveBeenCalled();
        expect(mockWatchGeometry).not.toHaveBeenCalled();
        expect(f.setOffset).not.toHaveBeenCalled();
    });

    it('removes its standard listeners on unmount', () => {
        const f = fixture();
        f.controller.unmount();
        expect(mockRemove).toHaveBeenCalledTimes(2);
    });
});
