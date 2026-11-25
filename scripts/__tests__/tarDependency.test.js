/**
 * The `tar` package of the Expo tools (issue 546).
 *
 * `expo` 51 brings `@expo/cli`, which asks for tar 6. Every tar below 7.5.19 has a known fault (a crafted archive
 * can use up memory and time: GHSA-23hp-3jrh-7fpw), and there is no fixed tar 6. So package.json overrides tar to a
 * fixed 7.x. tar 7 has no default export, and @expo/cli reads `tar.default.extract` in two places:
 * patches/@expo+cli+*.patch makes those two places take the module itself.
 *
 * tar is a tool of the build machine (templates, packages from npm). It is not in the app bundle.
 * This test fails when a later change of expo brings an old tar back, or when the patch no longer fits.
 */
const path = require('path');

// the unit test environment gives an empty `fs` (the rewrite-require alias of babel.config.js): the real modules
const fs = jest.requireActual('fs');
const { execFileSync } = jest.requireActual('child_process');

const root = path.join(__dirname, '..', '..');
const FIXED = [7, 5, 19];

const isFixed = (version) => {
    const parts = String(version).split('.').map((n) => parseInt(n, 10));
    for (let i = 0; i < 3; i++) {
        if (parts[i] !== FIXED[i]) return parts[i] > FIXED[i];
    }
    return true;
};

describe('tar of the Expo tools', () => {
    it('knows a fixed version from an old one', () => {
        expect(['7.5.19', '7.5.23', '7.6.0', '8.0.0'].map(isFixed)).toEqual([true, true, true, true]);
        expect(['6.2.1', '7.5.18', '7.4.99', '3.0.0'].map(isFixed)).toEqual([false, false, false, false]);
    });

    it('the lock file has only a fixed tar, and package.json pins it', () => {
        const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
        const copies = Object.keys(lock.packages)
            .filter((name) => /(^|\/)node_modules\/tar$/.test(name))
            .map((name) => [name, lock.packages[name].version]);
        expect(copies.length).toBeGreaterThan(0);
        for (const [name, version] of copies) {
            expect([name, version, isFixed(version)]).toEqual([name, version, true]);
        }
        const pinned = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).overrides?.tar;
        expect(isFixed(pinned)).toBe(true);
    });

    it('the installed tar is the fixed one', () => {
        // eslint-disable-next-line global-require, import/no-extraneous-dependencies
        expect(isFixed(require('tar/package.json').version)).toBe(true);
    });

    it('the two places of @expo/cli that unpack an archive work with it (scripts/check-tar-dependency.js)', () => {
        const out = execFileSync(process.execPath, [path.join(root, 'scripts', 'check-tar-dependency.js')], {
            cwd: root,
            encoding: 'utf8',
        });
        expect(out.trim()).toMatch(/^tar \d+\.\d+\.\d+: ok$/);
    });
});
