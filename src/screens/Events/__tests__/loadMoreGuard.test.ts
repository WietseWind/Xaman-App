import { readFileSync } from 'fs';
import { join } from 'path';

import { shouldFetchNextEventPage } from '../loadMoreGuard';

const eventsView = readFileSync(join(__dirname, '../EventsView.tsx'), 'utf8');

const idle = {
    isLoading: false,
    isLoadingMore: false,
    canLoadMore: true,
    isAllSection: true,
};

describe('Events loadMore initial race', () => {
    it('ignores empty-list onEndReached until a marker exists', () => {
        expect(
            shouldFetchNextEventPage({
                ...idle,
                forced: 0.1,
                hasMarker: false,
            }),
        ).toBe(false);

        expect(
            shouldFetchNextEventPage({
                ...idle,
                forced: 0.1,
                hasMarker: true,
            }),
        ).toBe(true);
        expect(eventsView).toContain('shouldFetchNextEventPage({');
    });

    it('still loads when the caller forces a boolean, even without a marker', () => {
        expect(
            shouldFetchNextEventPage({
                ...idle,
                forced: true,
                hasMarker: false,
            }),
        ).toBe(true);
    });
});
