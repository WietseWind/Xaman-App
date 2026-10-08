import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const source = join(__dirname, '../WindowBackground.java');
const launchActivity = join(__dirname, '../LaunchActivity.java');
const probe = join(__dirname, 'WindowBackgroundProbe.java');

describe('LaunchActivity window background on global layout', () => {
    it('replaces the drawable only when the color changes', () => {
        const dir = mkdtempSync(join(tmpdir(), 'window-background-'));
        execFileSync('javac', ['-d', dir, source, probe], { encoding: 'utf8' });
        const out = execFileSync('java', ['-cp', dir, 'WindowBackgroundProbe'], { encoding: 'utf8' });

        expect(out.trim().split('\n')).toEqual(['false', 'true']);
        expect(readFileSync(launchActivity, 'utf8')).toContain('WindowBackground.changed(background, lastWindowBackground)');
    });
});
