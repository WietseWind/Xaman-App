type IdentifyExit = {
    requestExit: () => Promise<void>;
    exiting?: Promise<void>;
};

let current: IdentifyExit | undefined;
const pending = new Set<Promise<void>>();

const exit = (owner: IdentifyExit): Promise<void> => {
    if (owner.exiting) return owner.exiting;

    let resolve: () => void = () => undefined;
    let reject: (error: unknown) => void = () => undefined;
    const completion = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    owner.exiting = completion;
    pending.add(completion);
    // Install cleanup before invoking the callback: it can synchronously unmount.
    completion.then(() => {
        pending.delete(completion);
        if (current === owner) current = undefined;
    }, () => {
        pending.delete(completion);
        // A failed pop can leave the screen visible. Permit its next exit attempt.
        if (owner.exiting === completion) owner.exiting = undefined;
    });
    try {
        // Mark the screen as closing now, before another route or scan can start.
        Promise.resolve(owner.requestExit()).then(resolve, reject);
    } catch (error) {
        reject(error);
    }
    return completion;
};

/** The callback waits for owned SDK work and cleanup, then pops only its own screen. */
export const registerTangemIdentifyExit = (requestExit: () => Promise<void>): (() => void) => {
    const owner = { requestExit };
    current = owner;
    let removed = false;
    return () => {
        if (removed) return;
        removed = true;
        if (current === owner) current = undefined;
        // Forced unmount cannot await cleanup. Retain its barrier for later routes.
        // exit() handles rejection even when there is no navigation caller waiting.
        exit(owner);
    };
};

export const hasTangemIdentifyExit = (): boolean => current !== undefined || pending.size > 0;

/** Finish Identify before another non-security route presents UI. */
export const prepareForTangemIdentifyNavigation = async (
    canContinue: () => boolean = () => true,
): Promise<void> => {
    do {
        if (!canContinue()) return;
        const completions = new Set(pending);
        if (current) completions.add(exit(current));
        await Promise.all(completions);
        // Another owner may have mounted while an older native scan was finishing.
    } while (current || pending.size > 0);
};

/** A new Identify scan waits for old unmounted owners, never for its own exit. */
export const waitForTangemIdentifyCleanup = async (): Promise<void> => {
    const ownExit = current?.exiting;
    await Promise.all(Array.from(pending).filter((completion) => completion !== ownExit));
};
