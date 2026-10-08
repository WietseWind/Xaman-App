import { readFileSync } from 'fs';
import { join } from 'path';

import { appendServerMatches } from '../appendServerMatches';

const destinationPicker = readFileSync(join(__dirname, '../DestinationPickerModal.tsx'), 'utf8');

describe('PayID lookup result timing', () => {
    it('publishes the PayID name only after enrichment resolves', async () => {
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const searchResult: { name?: string; address: string }[] = [];

        const pending = appendServerMatches(
            searchResult,
            [{ source: 'payid', account: 'r1', tag: 1, alias: 'r1' }],
            1,
            () => 1,
            async () => {
                await gate;
                return { name: 'alice', source: 'internal' };
            },
        );

        expect(searchResult).toEqual([]);
        release();
        await pending;
        expect(searchResult).toEqual([{ name: 'alice', address: 'r1', tag: 1, source: 'internal' }]);
        expect(destinationPicker).toContain('await appendServerMatches(');
    });

    it('stops when the search sequence has moved on', async () => {
        const searchResult: { name?: string; address: string }[] = [];

        await appendServerMatches(
            searchResult,
            [{ source: 'payid', account: 'r1', alias: 'alice' }],
            1,
            () => 2,
            async () => ({ name: 'alice' }),
        );

        expect(searchResult).toEqual([]);
    });
});
