export const setRootLatch = { current: false };

/**
 * One startDefault setRoot at a time. A rejection clears the latch so a later
 * call can try again.
 */
export const runSetRootOnce = async (
    setRootFn: () => Promise<void>,
    latch: { current: boolean } = setRootLatch,
): Promise<void> => {
    if (latch.current) {
        return;
    }

    latch.current = true;

    try {
        await setRootFn();
    } catch (error) {
        latch.current = false;
        throw error;
    }
};
