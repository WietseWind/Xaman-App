import { Navigation } from 'react-native-navigation';
import { Platform } from 'react-native';
import NavigationService from '@services/NavigationService';
import { AppScreens } from '@common/constants';
import { ModalReservation, Navigator } from '../navigator';

const review = AppScreens.Modal.ReviewTransaction;
const alert = AppScreens.Overlay.Alert;
const deferred = () => {
    let resolve: (value: string) => void = () => undefined;
    let reject: (error: Error) => void = () => undefined;
    const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
};
let components: Map<string, Set<any>>;
let commands: Set<(name: string, params: any) => void>;
let completions: Set<(event: any) => void>;
let leases: ModalReservation[];
const reserve = () => {
    const lease = Navigator.reserveModal(review)!;
    expect(lease).toBeDefined();
    leases.push(lease);
    return lease;
};
const appear = (id = alert) => {
    components.forEach((listeners) => {
        listeners.forEach((listener) => listener.componentDidAppear({ componentId: id }));
    });
};
const command = (name: string, id: string, componentId = alert) => {
    commands.forEach((listener) => listener(name, { commandId: id, componentId }));
};
const completed = (id: string) => completions.forEach((listener) => listener({ commandId: id }));
const listenerCount = () => [...components.values()].reduce((count, set) => count + set.size, 0) +
    commands.size + completions.size;

beforeEach(() => {
    jest.clearAllMocks();
    components = new Map(); commands = new Set(); completions = new Set(); leases = [];
    jest.spyOn(NavigationService, 'getCurrentModal').mockReturnValue(undefined);
    jest.spyOn(NavigationService, 'getCurrentOverlay').mockReturnValue(undefined);
    jest.spyOn(Navigation, 'events').mockReturnValue({
        registerComponentDidAppearListener: (callback: any) => {
            if (!components.has('global')) components.set('global', new Set());
            const listener = { componentDidAppear: callback };
            components.get('global')!.add(listener);
            return { remove: () => components.get('global')!.delete(listener) };
        },
        registerCommandListener: (listener: any) => {
            commands.add(listener);
            return { remove: () => commands.delete(listener) };
        },
        registerCommandCompletedListener: (listener: any) => {
            completions.add(listener);
            return { remove: () => completions.delete(listener) };
        },
    } as any);
    jest.spyOn(Navigation, 'showModal').mockResolvedValue(review);
    jest.spyOn(Navigation, 'showOverlay').mockResolvedValue(alert);
});
afterEach(async () => {
    command('dismissAllOverlays', 'cleanup'); completed('cleanup');
    leases.forEach((lease) => lease.release());
    await flush();
    expect(Navigator.pendingOverlayShows()).toHaveLength(0);
    expect(listenerCount()).toBe(0);
    jest.restoreAllMocks();
});

it('waits for the exact reservation release without a navigation timer', async () => {
    const first = reserve();
    let settled = false;
    const waiting = Navigator.waitForModalReservation(review).then(() => { settled = true; });
    await flush();
    expect(settled).toBe(false);
    first.release();
    const next = reserve();
    await waiting;
    expect(settled).toBe(true);
    let nextSettled = false;
    const nextWaiting = Navigator.waitForModalReservation(review).then(() => { nextSettled = true; });
    first.release(); await flush();
    expect(nextSettled).toBe(false);
    next.release(); await nextWaiting;
});

it('does not wait when no modal reservation exists', async () => {
    await expect(Navigator.waitForModalReservation(review)).resolves.toBeUndefined();
});

it('blocks competing Review dispatch before appearance and through owner cleanup after native completion', async () => {
    const lease = reserve();
    expect(Navigator.reserveModal(review)).toBeUndefined();
    await expect(Navigator.showModal(review, {})).resolves.toBe(false);
    expect(Navigation.showModal).not.toHaveBeenCalled();
    await expect(Navigator.showModal(review, {}, {}, lease.token)).resolves.toBe(review);
    // Native completion can report canceled entry; the owner still has to clean it up.
    await expect(Navigator.showModal(review, {})).resolves.toBe(false);
    expect(Navigation.showModal).toHaveBeenCalledTimes(1);
    lease.release();
    await expect(Navigator.showModal(review, {})).resolves.toBe(review);
    expect(Navigation.showModal).toHaveBeenCalledTimes(2);
});

it('cannot release a newer reservation with an older handle or dispatch using an expired token', async () => {
    const old = reserve(); old.release();
    const next = reserve(); old.release();
    await expect(Navigator.showModal(review, {}, {}, old.token)).resolves.toBe(false);
    await expect(Navigator.showModal(review, {})).resolves.toBe(false);
    await expect(Navigator.showModal(review, {}, {}, next.token)).resolves.toBe(review);
    expect(Navigation.showModal).toHaveBeenCalledTimes(1);
});

it('also guards simultaneous Review callers that do not reserve a handoff', async () => {
    const native = deferred();
    jest.mocked(Navigation.showModal).mockReturnValueOnce(native.promise);
    const first = Navigator.showModal(review, {});
    await expect(Navigator.showModal(review, {})).resolves.toBe(false);
    expect(Navigation.showModal).toHaveBeenCalledTimes(1);
    native.resolve(review); await first;
    await expect(Navigator.showModal(review, {})).resolves.toBe(review);
});

it('clears only the destroyed Android pending show after its observed root completes', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const old = deferred(); const next = deferred();
    jest.mocked(Navigation.showModal).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const first = Navigator.showModal(review, {});
    completed('earlier-root');
    await expect(Navigator.showModal(review, {})).resolves.toBe(false);
    command('setRoot', 'owned-root'); completed('owned-root');
    const second = Navigator.showModal(review, {});
    old.resolve(review); await first;
    await expect(Navigator.showModal(review, {})).resolves.toBe(false);
    next.resolve(review); await second;
    await expect(Navigator.showModal(review, {})).resolves.toBe(review);
});

it('does not treat iOS root completion as proof that a pending render cannot present later', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const native = deferred(); jest.mocked(Navigation.showModal).mockReturnValueOnce(native.promise);
    const show = Navigator.showModal(review, {});
    command('setRoot', 'root'); completed('root');
    await expect(Navigator.showModal(review, {})).resolves.toBe(false);
    native.resolve(review); await show;
});

it.each(['reject', 'throw'])('releases the pending Review guard after native failure (%s)', async (mode) => {
    const error = new Error('Native show failed');
    if (mode === 'reject') {
        jest.mocked(Navigation.showModal).mockRejectedValueOnce(error);
        await expect(Navigator.showModal(review, {})).rejects.toBe(error);
    } else {
        jest.mocked(Navigation.showModal).mockImplementationOnce(() => { throw error; });
        expect(() => Navigator.showModal(review, {})).toThrow(error);
    }
    await expect(Navigator.showModal(review, {})).resolves.toBe(review);
});

it('keeps the existing visible-Review guard and other modal behavior', async () => {
    jest.mocked(NavigationService.getCurrentModal).mockReturnValue(review);
    expect(Navigator.reserveModal(review)).toBeUndefined();
    await expect(Navigator.showModal(review, {})).resolves.toBe(false);
    jest.mocked(NavigationService.getCurrentModal).mockReturnValue(undefined);
    await Promise.all([Navigator.showModal(AppScreens.Modal.XAppBrowser, {}),
        Navigator.showModal(AppScreens.Modal.XAppBrowser, {})]);
    expect(Navigation.showModal).toHaveBeenCalledTimes(2);
});

it('tracks an overlay before native dispatch and waits for appearance after early native success', async () => {
    jest.mocked(Navigation.showOverlay).mockImplementationOnce(() => {
        expect(Navigator.pendingOverlayShows()).toHaveLength(1);
        return Promise.resolve(alert);
    });
    await expect(Navigator.showOverlay(alert, {})).resolves.toBe(alert);
    expect(Navigator.pendingOverlayShows()).toHaveLength(1);
    const pending = Navigator.pendingOverlayShows()[0];
    appear();
    // The global NavigationService listener still has this event to process.
    expect(Navigator.pendingOverlayShows()).toHaveLength(1);
    await pending;
    expect(Navigator.pendingOverlayShows()).toHaveLength(0);
});

it('waits for native success when appearance was delivered first', async () => {
    const native = deferred(); jest.mocked(Navigation.showOverlay).mockReturnValueOnce(native.promise);
    const show = Navigator.showOverlay(alert, {}); appear(); await flush();
    expect(Navigator.pendingOverlayShows()).toHaveLength(1);
    native.resolve(alert); await show;
    expect(Navigator.pendingOverlayShows()).toHaveLength(0);
});

it.each(['reject', 'throw', 'false'])('cleans failed overlay entries and all listeners (%s)', async (mode) => {
    const error = new Error('Overlay failed');
    if (mode === 'throw') {
        jest.mocked(Navigation.showOverlay).mockImplementationOnce(() => { throw error; });
        expect(() => Navigator.showOverlay(alert, {})).toThrow(error);
    } else if (mode === 'reject') {
        jest.mocked(Navigation.showOverlay).mockRejectedValueOnce(error);
        await expect(Navigator.showOverlay(alert, {})).rejects.toBe(error);
    } else {
        jest.mocked(Navigation.showOverlay).mockResolvedValueOnce(false as any);
        await expect(Navigator.showOverlay(alert, {})).resolves.toBe(false);
    }
    expect(Navigator.pendingOverlayShows()).toHaveLength(0);
    expect(listenerCount()).toBe(0);
});

it('keeps each newer overlay pending independently and returns a stable snapshot', async () => {
    const second = AppScreens.Overlay.SwitchNetwork;
    await Navigator.showOverlay(alert, {});
    const snapshot = Navigator.pendingOverlayShows();
    await Navigator.showOverlay(second, {});
    expect(snapshot).toHaveLength(1);
    expect(Navigator.pendingOverlayShows()).toHaveLength(2);
    appear(alert); await flush();
    expect(Navigator.pendingOverlayShows()).toHaveLength(1);
    appear(second); await flush();
    expect(Navigator.pendingOverlayShows()).toHaveLength(0);
});

it('settles an entry dismissed before appearance only after its matching native command completes', async () => {
    await Navigator.showOverlay(alert, {});
    command('dismissOverlay', 'other', AppScreens.Overlay.SwitchNetwork); completed('other');
    expect(Navigator.pendingOverlayShows()).toHaveLength(1);
    command('dismissOverlay', 'own');
    expect(Navigator.pendingOverlayShows()).toHaveLength(1);
    completed('own');
    expect(Navigator.pendingOverlayShows()).toHaveLength(0);
});

it('cleans pending appearance entries after dismissAllOverlays completes', async () => {
    await Navigator.showOverlay(alert, {});
    command('dismissAllOverlays', 'reset'); completed('unrelated');
    expect(Navigator.pendingOverlayShows()).toHaveLength(1);
    completed('reset');
    expect(Navigator.pendingOverlayShows()).toHaveLength(0);
});

it('keeps overlays pending across setRoot because native root replacement retains overlay windows', async () => {
    await Navigator.showOverlay(alert, {});
    command('setRoot', 'root'); completed('root');
    expect(Navigator.pendingOverlayShows()).toHaveLength(1);
    appear(); await flush();
    expect(Navigator.pendingOverlayShows()).toHaveLength(0);
});

it.each(['registerComponentDidAppearListener', 'registerCommandListener', 'registerCommandCompletedListener'])(
    'cleans partial registration if %s throws', (method) => {
        const events = Navigation.events();
        const error = new Error('Listener registration failed');
        (events as any)[method] = () => { throw error; };
        expect(() => Navigator.showOverlay(alert, {})).toThrow(error);
        expect(Navigator.pendingOverlayShows()).toHaveLength(0);
        expect(listenerCount()).toBe(0);
    },
);
