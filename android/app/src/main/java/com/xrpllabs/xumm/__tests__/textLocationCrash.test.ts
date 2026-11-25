import { execFileSync } from 'child_process';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const source = join(__dirname, '../TextLocationCrash.java');
const probe = join(__dirname, 'TextLocationCrashProbe.java');

describe('Android 8.0–12L accessibility crash guard', () => {
    it('ignores only the framework text-location crash and rethrows the rest with their own stack traces', () => {
        const dir = mkdtempSync(join(tmpdir(), 'text-location-crash-'));
        execFileSync('javac', ['-d', dir, source, probe], { encoding: 'utf8' });
        const out = execFileSync('java', ['-cp', dir, 'com.xrpllabs.xumm.TextLocationCrashProbe'], {
            encoding: 'utf8',
        });

        expect(out.trim().split('\n')).toEqual([
            'framework bug, Android 12 as logged: ignored',
            'framework bug, Android 8-11: ignored',
            'other message: rethrown',
            'no message: rethrown',
            'not a NullPointerException: rethrown',
            'thrown elsewhere: rethrown',
            'app code on the way to the loop: rethrown',
            'library code on the way to the loop: rethrown',
            'no message loop: rethrown',
            'rethrown, Android 12: as without the guard',
            'rethrown, Android 8-11: as without the guard',
            'no guard on the stack: unchanged',
            'guard not running the loop: unchanged',
            'no outer loop: unchanged',
            'cause and suppressed: as without the guard',
            'causes in a loop: as without the guard',
        ]);
    });
});
