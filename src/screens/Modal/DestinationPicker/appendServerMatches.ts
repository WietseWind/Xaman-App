type LookupMatch = {
    source?: string;
    account: string;
    tag?: number;
    alias?: string;
    kycApproved?: boolean;
};

type ResolvedName = { name?: string; source?: string };

type SearchRow = {
    name?: string;
    address: string;
    tag?: number;
    source?: string;
    kycApproved?: boolean;
};

/**
 * PayID rows wait for the local name lookup before the list is published.
 * A cancelled search (sequence moved on) stops without publishing a partial row.
 */
export const appendServerMatches = async (
    searchResult: SearchRow[],
    matches: LookupMatch[],
    sequence: number,
    currentSequence: () => number,
    resolvePayId: (account: string, tag?: number) => Promise<ResolvedName>,
): Promise<void> => {
    for (const element of matches) {
        if (sequence !== currentSequence()) {
            return;
        }

        if (element.source === 'payid') {
            const internalResult = await resolvePayId(element.account, element.tag);

            if (sequence !== currentSequence()) {
                return;
            }

            if (internalResult.name) {
                searchResult.push({
                    name: internalResult.name || '',
                    address: element.account,
                    tag: element.tag,
                    source: internalResult.source,
                });
                continue;
            }
        }

        searchResult.push({
            name: element.alias === element.account ? '' : element.alias,
            address: element.account,
            source: element.source,
            tag: element.tag,
            kycApproved: element.kycApproved,
        });
    }
};
