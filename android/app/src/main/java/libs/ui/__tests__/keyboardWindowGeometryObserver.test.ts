import { execFileSync } from 'child_process';
import { join } from 'path';

describe('Native Android IME geometry observation', () => {
    it('corrects an early inset snapshot and owns only its live-window listeners', () => {
        const script = join(__dirname, '../../../../../../../../scripts/test-android-keyboard-geometry-observer.py');
        const result = JSON.parse(execFileSync('python3', [script], { encoding: 'utf8' }));

        expect(result.actual_production_observer_class_compiled).toBe(true);
        expect(result.actual_production_geometry_class_compiled).toBe(true);
        expect(result.actual_production_module_class_compiled).toBe(true);
        expect(result.cases).toBeGreaterThanOrEqual(40);
        expect(result.assertions).toEqual(expect.arrayContaining([
            'next-frame-corrects-383-to-121-without-visibility-toggle',
            'pre-draw-never-blocks-rendering',
            'same-geometry-layout-and-draw-deduplicate',
            'existing-layout-and-draw-listeners-retained',
            'detach-removes-tree-listeners',
            'reattach-binds-new-tree-and-emits-current',
            'no-late-event-after-stop',
            'later-traversal-recovers-from-read-error',
            'plain-query-does-not-create-observation-lease',
            'actual-module-forwards-settled-frame-correction',
            'geometry-observation-does-not-create-or-restart-legacy-popup',
            'host-pause-clears-decor-observer-not-lease',
            'paused-state-blocks-frame-before-queued-clear',
            'paused-query-cannot-reattach-nonnull-current-activity',
            'paused-start-cannot-reattach-nonnull-current-activity',
            'host-resume-rebinds-and-publishes-current-geometry',
            'old-activity-source-is-guarded-before-rebind',
            'query-rebinds-when-current-activity-changes',
            'same-activity-new-decor-removes-old-observer',
            'plain-query-after-stop-does-not-resurrect-lease',
            'queued-lifecycle-cannot-revive-invalidated-observation',
            'pending-lease-binds-on-first-host-resume',
            'late-activity-query-binds-only-while-resumed',
            'late-new-activity-query-while-paused-remains-unbound',
            'late-new-activity-resume-binds-current-decor',
        ]));
        expect(result.passed).toBe(result.cases);
        expect(result.failures).toEqual([]);
    });
});
