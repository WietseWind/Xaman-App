import { execFileSync } from 'child_process';
import { join } from 'path';

describe('Current native Android keyboard geometry', () => {
    it('uses current window coordinates and a guarded popup fallback through the UI queue', () => {
        const script = join(__dirname, '../../../../../../../../scripts/test-android-keyboard-geometry.py');
        const result = JSON.parse(execFileSync('python3', [script], { encoding: 'utf8' }));

        expect(result.actual_production_geometry_class_compiled).toBe(true);
        expect(result.actual_production_provider_method_compiled).toBe(true);
        expect(result.actual_production_bridge_method_compiled).toBe(true);
        expect(result.cases).toBe(42);
        expect(result.assertions).toEqual(expect.arrayContaining([
            'api30-current-ime-top',
            'split-status-offset-same-rn-origin',
            'current-density-not-stale-display-cache',
            'current-decor-height-after-resize',
            'current-ime-ignores-cached-heightmax',
            'api30-visible-true-explicit',
            'api30-hidden-keeps-explicit-false',
            'missing-activity-is-null',
            'missing-window-is-null',
            'detached-decor-is-null',
            'disappearing-window-is-null',
            'api29-attached-showing-popup-fallback',
            'fallback-visibility-is-unknown',
            'hidden-popup-is-null',
            'detached-popup-is-null',
            'unavailable-insets-without-popup-is-null',
            'bridge-promise-waits-for-ui-queue',
            'bridge-does-not-read-views-before-ui',
            'bridge-map-includes-visible-false',
            'bridge-fallback-omits-visibility',
            'bridge-null-snapshot-resolves-null',
            'bridge-uses-current-activity-on-ui-flush',
        ]));
        expect(result.passed).toBe(result.cases);
        expect(result.failures).toEqual([]);
    });
});
