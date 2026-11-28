import { execFileSync } from 'child_process';
import { join } from 'path';

describe('Android native multi-window state', () => {
    it('publishes real atomic window state and rejects stale Activity and React callbacks', () => {
        const script = join(__dirname, '../../../../../../../../../scripts/test-android-multi-window-state.py');
        const result = JSON.parse(execFileSync('python3', [script], { encoding: 'utf8' }));

        expect(result.actual_window_state_class_and_deviceutils_module_compiled_whole).toBe(true);
        expect(result.actual_activity_create_destroy_resume_config_multiwindow_callbacks_compiled).toBe(true);
        expect(result.passed).toBeGreaterThanOrEqual(35);
        expect(result.failures).toEqual([]);
        expect(result.assertions).toEqual(
            expect.arrayContaining([
                'cold-state-before-react-super',
                'cold-real-split-atomic-dimensions',
                'wide-fold-is-not-multiwindow-guess',
                'revision-monotonic',
                'old-activity-callback-rejected',
                'invalidate-blocks-before-ui-unregister',
                'final-layout-publishes-current-bounds',
                'getter-reads-after-ui-queue',
                'fold-portrait-request-retained',
            ]),
        );
    });
});
