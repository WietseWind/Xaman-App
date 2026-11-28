import { execFileSync } from 'child_process';
import { join } from 'path';

describe('Activity configuration override', () => {
    it('keeps live display fields while preserving the explicit font and locale policy', () => {
        const script = join(__dirname, '../../../../../../../../../scripts/test-android-activity-configuration.py');
        const result = JSON.parse(execFileSync('python3', [script], { encoding: 'utf8' }));

        expect(result.actual_production_attach_base_context_compiled).toBe(true);
        expect(result.cases).toBe(44);
        expect(result.assertions).toEqual(expect.arrayContaining([
            'override-before-super-attach',
            'override-orientation-undefined',
            'override-sizes-undefined',
            'override-density-undefined',
            'override-window-bounds-undefined',
            'override-layout-geometry-undefined',
            'base-configuration-not-mutated',
            'cover-portrait-orientation-live',
            'cover-portrait-width-dp-live',
            'cover-portrait-height-dp-live',
            'cover-portrait-window-bounds-live',
            'unfolded-inner-width-dp-live',
            'unfolded-inner-smallest-width-live',
            'unfolded-inner-density-live',
            'unfolded-inner-window-bounds-live',
            'unfolded-inner-font-remains-one',
            'unfolded-inner-locale-remains-english',
            'unfolded-inner-direction-remains-ltr',
        ]));
        expect(result.passed).toBe(result.cases);
        expect(result.failures).toEqual([]);
    });
});
