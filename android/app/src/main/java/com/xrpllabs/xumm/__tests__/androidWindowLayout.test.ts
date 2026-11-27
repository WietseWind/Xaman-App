import { execFileSync } from 'child_process';
import { join } from 'path';

describe('Android fold model and native tab column', () => {
    it('preserves precise hardware-gated models, native placement, restoration and queued UI updates', () => {
        const script = join(__dirname, '../../../../../../../../../scripts/test-android-window-layout.py');
        const result = JSON.parse(execFileSync('python3', [script], { encoding: 'utf8' }));

        expect(result.actual_production_methods_compiled).toBe(true);
        expect(result.actual_production_state_compiled).toBe(true);
        expect(result.actual_production_blur_class_and_setter_compiled).toBe(true);
        expect(result.cases).toBe(107);
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
                'ordinary-full-model-never-halves',
                'ordinary-multiwindow-full-model',
                'ordinary-multiwindow-keeps-nonfold-identity',
                'ordinary-fullscreen-has-no-window-hint',
                'ordinary-recreated-activity-refreshes-before-cache-guard',
                'ordinary-return-fullscreen-omits-hint',
                'fold-never-exports-ordinary-model',
                'blur-default-delegates-existing-framelayout',
                'blur-adaptive-preserves-yoga-child-frame',
                'blur-adaptive-does-not-relayout-children',
                'blur-size-notification-remains-inherited',
                'blur-false-restores-native-child-layout',
                'tab-row-normal-phone-is-noop',
                'tab-row-all-five-use-ah-minimum-width',
                'tab-row-five-transformed-targets-inside',
                'tab-row-native-height-unchanged',
                'tab-row-no-layout-loop',
                'tab-row-restores-original-params-scales',
                'tab-row-new-root-keeps-own-layout',
            ]),
        );
        expect(result.passed).toBe(result.cases);
        expect(result.failures).toEqual([]);
    });
});
