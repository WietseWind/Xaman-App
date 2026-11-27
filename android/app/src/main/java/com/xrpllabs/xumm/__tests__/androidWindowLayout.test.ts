import { execFileSync } from 'child_process';
import { join } from 'path';

describe('Android fold model and native tab column', () => {
    it('preserves precise hardware-gated models, native placement, restoration and queued UI updates', () => {
        const script = join(__dirname, '../../../../../../../../../scripts/test-android-window-layout.py');
        const result = JSON.parse(execFileSync('python3', [script], { encoding: 'utf8' }));

        expect(result.actual_production_methods_compiled).toBe(true);
        expect(result.actual_production_state_compiled).toBe(true);
        expect(result.cases).toBe(60);
        expect(result.assertions).toEqual(
            expect.arrayContaining([
                'cover-cold-inner-same-model',
                'physical-double-precision',
                'ordinary-device-no-fold-model',
                'pre30-no-hinge-api',
                'unfold-rotation-jsreload-keep-model',
                'right-aligned-native-container',
                'height-and-other-margins-preserved',
                'normal-full-width-is-noop',
                'restore-native-layout',
                'new-root-restores-own-gravity-margin',
                'bridge-queues-on-ui-thread',
            ]),
        );
        expect(result.passed).toBe(result.cases);
        expect(result.failures).toEqual([]);
    });
});
