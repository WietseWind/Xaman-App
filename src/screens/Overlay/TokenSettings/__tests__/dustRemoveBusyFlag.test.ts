import { removingFlagAfterDustFailure } from '../dustRemoveBusyFlag';

describe('dust remove busy flag', () => {
    it('clears the busy flag when dust removal throws', () => {
        expect(removingFlagAfterDustFailure()).toEqual({ isRemoving: false });
    });
});
