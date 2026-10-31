/** A failed ext-assets request must not reject the ledger balance refresh. */
export const extAssetsOrEmpty = async <T>(request: Promise<T[]>, onError?: (error: unknown) => void): Promise<T[]> => {
    try {
        return await request;
    } catch (error) {
        onError?.(error);
        return [];
    }
};
