import { execFileSync } from 'child_process';
import { join } from 'path';

describe('Native Android keyboard observer touch policy', () => {
    it('leaves app input untouched while retaining its window and geometry behavior', () => {
        const script = join(__dirname, '../../../../../../../../scripts/test-android-keyboard-observer-touch.py');
        const result = JSON.parse(execFileSync('python3', [script], { encoding: 'utf8' }));

        expect(result.actual_full_keyboard_provider_compiled).toBe(true);
        expect(result.cases).toBe(25);
        expect(result.assertions).toEqual(expect.arrayContaining([
            'platform-default-control-is-touchable',
            'invisible-keyboard-observer-never-owns-touch',
            'first-show-is-non-touchable',
            'legacy-adjust-resize-retained',
            'legacy-input-method-needed-retained',
            'default-focusable-policy-unchanged',
            'default-modal-policy-unchanged',
            'default-outside-touch-policy-unchanged',
            'repeated-init-does-not-reshow',
            'attached-observer-geometry-still-readable',
            'detached-observer-frame-remains-unavailable',
            'destroy-still-dismisses-observer',
        ]));
        expect(result.passed).toBe(result.cases);
        expect(result.failures).toEqual([]);
    });
});
