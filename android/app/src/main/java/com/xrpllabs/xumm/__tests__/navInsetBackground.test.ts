import { execFileSync } from 'child_process';
import { join } from 'path';

describe('Android navigation inset follows the current tab container', () => {
    it('uses the actual native resolver without changing onboarding or transparent-view fallbacks', () => {
        const script = join(__dirname, '../../../../../../../../../scripts/test-android-nav-inset-background.py');
        const result = JSON.parse(execFileSync('python3', [script], { encoding: 'utf8' }));

        expect(result).toMatchObject({ cases: 10, passed: 10, failures: [], actual_production_methods_compiled: true });
    });
});
