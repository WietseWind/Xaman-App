import { submittedBlobHash } from '../submittedBlobHash';

describe('submit blob verify hash', () => {
    it('uses the hash returned in tx_json when the caller omitted it', () => {
        const submitResponse = { tx_json: { hash: 'ABC'.repeat(21) + 'A' } };

        expect(submittedBlobHash(undefined, submitResponse.tx_json.hash)).toBe(submitResponse.tx_json.hash);
        expect(submittedBlobHash(undefined, submitResponse.tx_json.hash)).toHaveLength(64);
    });

    it('keeps the hash the caller already had', () => {
        const caller = 'D'.repeat(64);

        expect(submittedBlobHash(caller, 'E'.repeat(64))).toBe(caller);
    });
});
