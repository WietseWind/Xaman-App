import { readFileSync } from 'fs';
import { join } from 'path';

import { removingFlagAfterDustFailure } from '../dustRemoveBusyFlag';

const tokenSettings = readFileSync(join(__dirname, '../TokenSettingsOverlay.tsx'), 'utf8');

describe('dust remove busy flag', () => {
    it('clears the busy flag when dust removal throws', () => {
        expect(removingFlagAfterDustFailure()).toEqual({ isRemoving: false });
        expect(tokenSettings).toContain('this.setState(removingFlagAfterDustFailure());');
    });
});
