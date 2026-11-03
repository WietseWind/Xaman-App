/** Ignore a native onEndReached until the first page has a marker, unless the caller forced a boolean. */
export const shouldFetchNextEventPage = ({
    forced,
    isLoading,
    isLoadingMore,
    canLoadMore,
    hasMarker,
    isAllSection,
}: {
    forced: unknown;
    isLoading: boolean;
    isLoadingMore: boolean;
    canLoadMore: boolean;
    hasMarker: boolean;
    isAllSection: boolean;
}): boolean => {
    if (!forced || typeof forced !== 'boolean') {
        if (isLoading || isLoadingMore || !canLoadMore || !hasMarker || !isAllSection) {
            return false;
        }
    }

    return true;
};
