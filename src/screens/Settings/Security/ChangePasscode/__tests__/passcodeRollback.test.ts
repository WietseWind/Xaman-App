import { passcodeWrittenOnRollback } from '../passcodeRollback';

describe('passcode change rollback', () => {
    it('writes the stored hash unchanged instead of hashing it again', async () => {
        const hashPasscode = async (value: string) => `hashed(${value})`;
        const stored = await hashPasscode('111111');

        expect(passcodeWrittenOnRollback(stored)).toBe(stored);
        expect(passcodeWrittenOnRollback(stored)).not.toBe(await hashPasscode(stored));
    });
});
