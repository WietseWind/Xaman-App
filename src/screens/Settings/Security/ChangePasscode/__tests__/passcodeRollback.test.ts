import { passcodeWrittenOnRollback } from '../passcodeRollback';

describe('passcode change rollback', () => {
    it('writes the stored hash unchanged instead of hashing it again', () => {
        const stored = 'already-hashed-pin';

        expect(passcodeWrittenOnRollback(stored)).toBe(stored);
    });
});
