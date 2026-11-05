#!/usr/bin/env node
/**
 * Symbolicate a JS stack from a Crashlytics report.
 *
 * Release builds run Hermes bytecode, so Crashlytics frames look like `main.jsbundle:1:123456`
 * (iOS) or `index.android.bundle:1:123456` (Android). Every release build archives its source map
 * outside the repo, in ~/xaman-sourcemaps or $XAMAN_SOURCEMAPS_DIR (scripts/archive-sourcemap.sh,
 * docs/crash-reporting.md); this maps those frames back to source files, lines and function names.
 *
 *   node scripts/symbolicate-crash.js ios 5.4.0-457 < stack.txt
 *   node scripts/symbolicate-crash.js android 5.4.0-457 stack.txt
 *   node scripts/symbolicate-crash.js --map path/to/main.jsbundle.map.gz stack.txt
 *
 * When one version and build was built more than once, the newest build is used and the others are
 * listed; pick one with --map. Paste the frames (or the whole event text) from the Crashlytics
 * console; anything that is not a bundle position is printed unchanged.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const metroSymbolicate = require.resolve('metro-symbolicate');
// eslint-disable-next-line import/no-dynamic-require
const { SourceMapConsumer } = require(require.resolve('source-map', { paths: [metroSymbolicate] }));
const Symbolication = require('metro-symbolicate/src/Symbolication');

const ARCHIVE = process.env.XAMAN_SOURCEMAPS_DIR || path.join(os.homedir(), 'xaman-sourcemaps');
const MAP_NAMES = { ios: 'main.jsbundle.map.gz', android: 'index.android.bundle.map.gz' };

const usage = () => {
    process.stderr.write(
        [
            'usage: node scripts/symbolicate-crash.js <ios|android> <version>-<build> [stack.txt]',
            '       node scripts/symbolicate-crash.js --map <file.map[.gz]> [stack.txt]',
            '',
        ].join('\n'),
    );
    process.exit(2);
};

const fail = (message) => {
    process.stderr.write(`${message}\n`);
    process.exit(1);
};

const describeBuild = (dir) => {
    let info = {};
    try {
        info = JSON.parse(fs.readFileSync(path.join(dir, 'build-info.json'), 'utf8'));
    } catch {
        // older or hand-copied folder
    }
    return `${path.basename(dir)} (commit ${info.commit || 'unknown'}${info.dirty ? ', uncommitted changes' : ''})`;
};

// newest archived map of a version and build; folder names start with the UTC build time
const findArchivedMap = (platform, build) => {
    const dir = path.join(ARCHIVE, platform, build);
    const builds = fs.existsSync(dir)
        ? fs
              .readdirSync(dir)
              .filter((name) => fs.existsSync(path.join(dir, name, MAP_NAMES[platform])))
              .sort()
        : [];
    if (!builds.length) {
        const platformDir = path.join(ARCHIVE, platform);
        const archived = fs.existsSync(platformDir) ? fs.readdirSync(platformDir).sort().join(', ') : 'none';
        fail(`no ${platform} source map for ${build} in ${ARCHIVE} (archived: ${archived})`);
    }
    const newest = path.join(dir, builds[builds.length - 1]);
    process.stderr.write(`source map: ${describeBuild(newest)}\n`);
    if (builds.length > 1) {
        process.stderr.write(`${platform} ${build} was built ${builds.length} times; the others (pick one with --map):\n`);
        builds.slice(0, -1).forEach((name) => {
            process.stderr.write(`  ${path.join(dir, name, MAP_NAMES[platform])} ${describeBuild(path.join(dir, name))}\n`);
        });
    }
    return path.join(newest, MAP_NAMES[platform]);
};

const args = process.argv.slice(2);
let mapFile;
let input;

if (args[0] === '--map') {
    [, mapFile, input] = args;
    if (!mapFile || !fs.existsSync(mapFile)) {
        fail(`source map not found: ${mapFile}`);
    }
} else if (MAP_NAMES[args[0]] && args[1]) {
    mapFile = findArchivedMap(args[0], args[1]);
    [, , input] = args;
} else {
    usage();
}

const rawMap = fs.readFileSync(mapFile);
const context = Symbolication.createContext(
    SourceMapConsumer,
    (mapFile.endsWith('.gz') ? zlib.gunzipSync(rawMap) : rawMap).toString('utf8'),
);
const unknownModule = Symbolication.parseFileName('');

const shortSource = (source) => {
    const marker = ['/node_modules/', '/src/'].find((m) => source.includes(m));
    return marker ? source.slice(source.lastIndexOf(marker) + 1) : source;
};

const BUNDLE_POSITION = /([\w.-]*(?:jsbundle|android\.bundle|index\.bundle)):(\d+):(\d+)/g;

const symbolicateLine = (line) =>
    line.replace(BUNDLE_POSITION, (match, file, lineNumber, column) => {
        const original = context.getOriginalPositionFor(Number(lineNumber), Number(column), unknownModule);
        if (!original || !original.source) {
            return match;
        }
        const name = original.name ? ` [${original.name}]` : '';
        return `${shortSource(original.source)}:${original.line}:${original.column}${name}`;
    });

const text = fs.readFileSync(input || 0, 'utf8');
process.stdout.write(text.split('\n').map(symbolicateLine).join('\n'));
