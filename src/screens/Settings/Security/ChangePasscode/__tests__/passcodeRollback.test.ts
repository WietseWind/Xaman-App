import { readFileSync } from 'fs';
import { join } from 'path';

import { passcodeWrittenOnRollback } from '../passcodeRollback';

const changePasscodeView = readFileSync(join(__dirname, '../ChangePasscodeView.tsx'), 'utf8');

describe('passcode change rollback', () => {
    it('writes the stored hash unchanged instead of hashing it again', () => {
        const stored = 'already-hashed-pin';

        expect(passcodeWrittenOnRollback(stored)).toBe(stored);
        expect(changePasscodeView).toContain(
            'CoreRepository.saveSettings({ passcode: passcodeWrittenOnRollback(passcode) });',
        );
    });
});
