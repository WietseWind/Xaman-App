/** A rejected ledger_entry must not escape the review screen. */
export const settleLedgerFetches = async <T>(
    requests: Promise<T>[],
): Promise<{ ok: true; values: T[] } | { ok: false }> => {
    try {
        return { ok: true, values: await Promise.all(requests) };
    } catch {
        return { ok: false };
    }
};

/** The account picker must not change the signing source while accept is in flight. */
export const shouldIgnoreSourceChange = (isLoading: boolean): boolean => isLoading;
