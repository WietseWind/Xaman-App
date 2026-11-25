type Coordinator = typeof import('../tangemIdentifyNavigation');

const deferred = () => {
    let resolve: () => void = () => undefined;
    let reject: (error: Error) => void = () => undefined;
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

let coordinator: Coordinator;
beforeEach(() => {
    jest.resetModules();
    coordinator = require('../tangemIdentifyNavigation');
});

it('does not hold unrelated navigation when no Identify owner exists', async () => {
    expect(coordinator.hasTangemIdentifyExit()).toBe(false);
    await coordinator.prepareForTangemIdentifyNavigation();
    await coordinator.waitForTangemIdentifyCleanup();
});

it('registers without closing, then coalesces simultaneous route and unmount requests', async () => {
    const cleanup = deferred();
    const request = jest.fn(() => cleanup.promise);
    const unregister = coordinator.registerTangemIdentifyExit(request);
    expect(request).not.toHaveBeenCalled();
    const first = coordinator.prepareForTangemIdentifyNavigation();
    const second = coordinator.prepareForTangemIdentifyNavigation();
    unregister();
    unregister();
    expect(request).toHaveBeenCalledTimes(1);
    expect(coordinator.hasTangemIdentifyExit()).toBe(true);
    let finished = false;
    first.then(() => { finished = true; });
    await flush();
    expect(finished).toBe(false);
    cleanup.resolve();
    await Promise.all([first, second]);
    expect(coordinator.hasTangemIdentifyExit()).toBe(false);
});

it('retains native cleanup after a forced unmount that had no prior route request', async () => {
    const cleanup = deferred();
    const request = jest.fn(() => cleanup.promise);
    coordinator.registerTangemIdentifyExit(request)();
    expect(request).toHaveBeenCalledTimes(1);
    let finished = false;
    const route = coordinator.prepareForTangemIdentifyNavigation().then(() => { finished = true; });
    await flush();
    expect(finished).toBe(false);
    cleanup.resolve();
    await route;
    expect(coordinator.hasTangemIdentifyExit()).toBe(false);
});

it('does not let an old unregister close or remove the new owner', async () => {
    const oldCleanup = deferred();
    const oldExit = jest.fn(() => oldCleanup.promise);
    const oldUnregister = coordinator.registerTangemIdentifyExit(oldExit);
    const nextExit = jest.fn(async () => undefined);
    coordinator.registerTangemIdentifyExit(nextExit);
    oldUnregister();
    expect(oldExit).toHaveBeenCalledTimes(1);
    expect(nextExit).not.toHaveBeenCalled();
    const route = coordinator.prepareForTangemIdentifyNavigation();
    expect(nextExit).toHaveBeenCalledTimes(1);
    oldCleanup.resolve();
    await route;
    oldUnregister();
    expect(nextExit).toHaveBeenCalledTimes(1);
});

it('lets a new scan await old cleanup without closing its active owner', async () => {
    const oldCleanup = deferred();
    coordinator.registerTangemIdentifyExit(() => oldCleanup.promise)();
    const currentExit = jest.fn(async () => undefined);
    const unregister = coordinator.registerTangemIdentifyExit(currentExit);
    let ready = false;
    const waiting = coordinator.waitForTangemIdentifyCleanup().then(() => { ready = true; });
    await flush();
    expect(ready).toBe(false);
    expect(currentExit).not.toHaveBeenCalled();
    oldCleanup.resolve();
    await waiting;
    expect(currentExit).not.toHaveBeenCalled();
    unregister();
    await flush();
});

it('does not wait on the active owner itself while its exit is already pending', async () => {
    const cleanup = deferred();
    coordinator.registerTangemIdentifyExit(() => cleanup.promise);
    const routing = coordinator.prepareForTangemIdentifyNavigation();
    await coordinator.waitForTangemIdentifyCleanup();
    expect(coordinator.hasTangemIdentifyExit()).toBe(true);
    cleanup.resolve();
    await routing;
});

it('also closes an owner mounted while an older navigation request was waiting', async () => {
    const firstCleanup = deferred();
    coordinator.registerTangemIdentifyExit(() => firstCleanup.promise);
    const routing = coordinator.prepareForTangemIdentifyNavigation();
    const nextCleanup = deferred();
    const nextExit = jest.fn(() => nextCleanup.promise);
    coordinator.registerTangemIdentifyExit(nextExit);
    firstCleanup.resolve();
    await flush();
    expect(nextExit).toHaveBeenCalledTimes(1);
    expect(coordinator.hasTangemIdentifyExit()).toBe(true);
    nextCleanup.resolve();
    await routing;
});

it('does not close a new owner after the waiting route loses its context', async () => {
    const cleanup = deferred();
    coordinator.registerTangemIdentifyExit(() => cleanup.promise);
    let allowed = true;
    const routing = coordinator.prepareForTangemIdentifyNavigation(() => allowed);
    allowed = false;
    const newExit = jest.fn(async () => undefined);
    const unregister = coordinator.registerTangemIdentifyExit(newExit);
    cleanup.resolve();
    await routing;
    expect(newExit).not.toHaveBeenCalled();
    expect(coordinator.hasTangemIdentifyExit()).toBe(true);
    unregister();
    await flush();
});

it.each(['sync', 'async'])('permits retry after a %s exit failure leaves the owner visible', async (kind) => {
    const error = new Error('Own screen could not pop');
    const request = jest.fn(() => {
        if (kind === 'sync') throw error;
        return Promise.reject(error);
    });
    coordinator.registerTangemIdentifyExit(request);
    await expect(coordinator.prepareForTangemIdentifyNavigation()).rejects.toBe(error);
    expect(coordinator.hasTangemIdentifyExit()).toBe(true);
    request.mockImplementation(async () => undefined);
    await coordinator.prepareForTangemIdentifyNavigation();
    expect(request).toHaveBeenCalledTimes(2);
    expect(coordinator.hasTangemIdentifyExit()).toBe(false);
});

it('handles an unregister called synchronously from the exit callback', async () => {
    let unregister = () => undefined;
    const request = jest.fn(async () => { unregister(); });
    unregister = coordinator.registerTangemIdentifyExit(request);
    await coordinator.prepareForTangemIdentifyNavigation();
    expect(request).toHaveBeenCalledTimes(1);
    expect(coordinator.hasTangemIdentifyExit()).toBe(false);
});

it('releases a failed detached cleanup without an unhandled rejection or stale owner', async () => {
    const cleanup = deferred();
    coordinator.registerTangemIdentifyExit(() => cleanup.promise)();
    const waiting = coordinator.waitForTangemIdentifyCleanup();
    const error = new Error('Native cleanup failed');
    cleanup.reject(error);
    await expect(waiting).rejects.toBe(error);
    expect(coordinator.hasTangemIdentifyExit()).toBe(false);
    await coordinator.prepareForTangemIdentifyNavigation();
});
