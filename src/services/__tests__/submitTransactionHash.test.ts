import { readFileSync } from 'fs';
import { join } from 'path';

import { submittedBlobHash } from '../submittedBlobHash';

const ledgerService = readFileSync(join(__dirname, '../LedgerService.ts'), 'utf8');

describe('submit blob verify hash', () => {
    it('uses the hash returned in tx_json when the caller omitted it', () => {
        const txJsonHash = 'ABC'.repeat(21) + 'A';

        expect(submittedBlobHash(undefined, txJsonHash)).toBe(txJsonHash);
        expect(submittedBlobHash(undefined, txJsonHash)).toHaveLength(64);
        expect(ledgerService).toContain('hash: submittedBlobHash(txHash, submitResponse.tx_json?.hash)');
    });

    it('keeps the hash the caller already had', () => {
        const caller = 'D'.repeat(64);

        expect(submittedBlobHash(caller, 'E'.repeat(64))).toBe(caller);
    });
});
