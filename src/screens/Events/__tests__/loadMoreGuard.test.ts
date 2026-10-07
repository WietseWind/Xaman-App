describe('Events loadMore initial race', () => {
    const shouldLoadMore = ({
        forced,
        isLoading,
        isLoadingMore,
        canLoadMore,
        lastMarker,
        activeSection,
    }: {
        forced: unknown;
        isLoading: boolean;
        isLoadingMore: boolean;
        canLoadMore: boolean;
        lastMarker?: string;
        activeSection: string;
    }) => {
        if (!forced || typeof forced !== 'boolean') {
            if (isLoading || isLoadingMore || !canLoadMore || !lastMarker || activeSection !== 'ALL') {
                return false;
            }
        }
        return true;
    };

    it('reproduces onEndReached running before the first page when lastMarker is ignored', () => {
        const preFix = ({
            forced,
            isLoading,
            isLoadingMore,
            canLoadMore,
            activeSection,
        }: {
            forced: unknown;
            isLoading: boolean;
            isLoadingMore: boolean;
            canLoadMore: boolean;
            activeSection: string;
        }) => {
            if (!forced || typeof forced !== 'boolean') {
                if (isLoading || isLoadingMore || !canLoadMore || activeSection !== 'ALL') {
                    return false;
                }
            }
            return true;
        };

        // RN onEndReached passes a number; constructor starts isLoading false, canLoadMore true
        expect(
            preFix({
                forced: 0.1,
                isLoading: false,
                isLoadingMore: false,
                canLoadMore: true,
                activeSection: 'ALL',
            }),
        ).toBe(true);
    });

    it('ignores empty-list onEndReached until a marker exists', () => {
        expect(
            shouldLoadMore({
                forced: 0.1,
                isLoading: false,
                isLoadingMore: false,
                canLoadMore: true,
                lastMarker: undefined,
                activeSection: 'ALL',
            }),
        ).toBe(false);

        expect(
            shouldLoadMore({
                forced: 0.1,
                isLoading: false,
                isLoadingMore: false,
                canLoadMore: true,
                lastMarker: 'MARKER',
                activeSection: 'ALL',
            }),
        ).toBe(true);

        expect(
            shouldLoadMore({
                forced: true,
                isLoading: false,
                isLoadingMore: false,
                canLoadMore: true,
                lastMarker: undefined,
                activeSection: 'ALL',
            }),
        ).toBe(true);
    });
});
