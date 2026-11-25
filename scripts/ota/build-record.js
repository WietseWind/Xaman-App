/* eslint-disable no-console */

/*
   Over-the-air updates: the build record of a store build (one per platform). Run it on the build
   machine right after building the store artifact, in the same checkout:

     node scripts/ota/build-record.js --platform ios --artifact <.ipa | .xcarchive>
     node scripts/ota/build-record.js --platform android --artifact <.aab | .apk>

   It writes ~/xaman-ota/runtimes/<runtime>-<platform>.json (XAMAN_OTA_DIR overrides ~/xaman-ota) and
   never overwrites one. The OTA tooling registers the runtime from this record (ota runtime:add),
   and the signer refuses an update whose native fingerprint or tools differ from it.

   Refuses when tracked files are modified: the record must describe a commit.
*/

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const OTA_DIR = process.env.XAMAN_OTA_DIR || path.join(os.homedir(), 'xaman-ota');

const die = (message) => {
    console.error(`ERROR: ${message}`);
    process.exit(1);
};

const arg = (name) => {
    const index = process.argv.indexOf(`--${name}`);
    return index > -1 ? process.argv[index + 1] : undefined;
};

const run = (command, args, options = {}) =>
    execFileSync(command, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options }).trim();

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

const sha256File = (file) =>
    new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        fs.createReadStream(file)
            .on('data', (chunk) => hash.update(chunk))
            .on('end', () => resolve(hash.digest('hex')))
            .on('error', reject);
    });

const packageVersion = (name) => {
    try {
        return JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', name, 'package.json'), 'utf8')).version;
    } catch {
        return null;
    }
};

const optional = (fn) => {
    try {
        return fn();
    } catch {
        return null;
    }
};

// the embedded JS bundle inside the store artifact
const embeddedBundle = (platform, artifact) => {
    if (fs.statSync(artifact).isDirectory()) {
        // .xcarchive
        const apps = path.join(artifact, 'Products', 'Applications');
        const app = fs.readdirSync(apps).find((name) => name.endsWith('.app'));
        return app ? fs.readFileSync(path.join(apps, app, 'main.jsbundle')) : null;
    }
    const entries = run('unzip', ['-Z1', artifact]).split('\n');
    const wanted =
        platform === 'ios'
            ? entries.find((entry) => /^Payload\/[^/]+\.app\/main\.jsbundle$/.test(entry))
            : entries.find((entry) => /^(base\/)?assets\/index\.android\.bundle$/.test(entry));
    return wanted ? execFileSync('unzip', ['-p', artifact, wanted], { maxBuffer: 512 * 1024 * 1024 }) : null;
};

const runtimeOf = (platform) => {
    if (platform === 'ios') {
        const plist = fs.readFileSync(path.join(ROOT, 'ios/Xaman/Expo.plist'), 'utf8');
        return plist.match(/<key>EXUpdatesRuntimeVersion<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
    }
    const strings = fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/values/strings.xml'), 'utf8');
    return strings.match(/<string name="expo_runtime_version"[^>]*>([^<]+)<\/string>/)?.[1];
};

const main = async () => {
    const platform = arg('platform');
    const artifact = arg('artifact');
    if (!['ios', 'android'].includes(platform) || !artifact) {
        die('usage: node scripts/ota/build-record.js --platform <ios|android> --artifact <file>');
    }
    if (!fs.existsSync(artifact)) {
        die(`artifact not found: ${artifact}`);
    }

    // the production configuration (URL, runtime = version.build, certificate) or nothing
    execFileSync('node', [path.join(__dirname, 'check-config.js')], { cwd: ROOT, stdio: 'inherit' });

    if (run('git', ['status', '--porcelain', '--untracked-files=no'])) {
        die('tracked files are modified: build and record from a clean checkout of a commit');
    }

    const runtime = runtimeOf(platform);
    if (!runtime) {
        die(`no runtime version found for ${platform}`);
    }

    const outFile = path.join(OTA_DIR, 'runtimes', `${runtime}-${platform}.json`);
    if (fs.existsSync(outFile)) {
        die(`${outFile} exists: a runtime is recorded once (a new store build needs a new build number)`);
    }

    console.log('[ ] native fingerprint (takes a few seconds)');
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const fingerprint = await require(path.join(ROOT, 'node_modules', '@expo', 'fingerprint')).createFingerprintAsync(
        ROOT,
        {},
    );

    const bundle = embeddedBundle(platform, artifact);
    if (!bundle) {
        die(`no embedded JS bundle found in ${artifact}`);
    }

    const hermesc = path.join(ROOT, 'node_modules/react-native/sdks/hermesc/osx-bin/hermesc');
    const record = {
        version: 1,
        runtime,
        platform,
        gitCommit: run('git', ['rev-parse', 'HEAD']),
        fingerprint: { hash: fingerprint.hash, tool: `@expo/fingerprint@${packageVersion('@expo/fingerprint')}` },
        artifact: {
            file: path.basename(artifact),
            sha256: fs.statSync(artifact).isDirectory() ? null : await sha256File(artifact),
            bytes: fs.statSync(artifact).isDirectory() ? null : fs.statSync(artifact).size,
        },
        embeddedBundle: { sha256: sha256(bundle), bytes: bundle.length },
        certificateSha256: sha256(
            Buffer.from(
                fs
                    .readFileSync(path.join(ROOT, 'certs/ota-certificate.pem'), 'utf8')
                    .replace(/-----[^-]+-----/g, '')
                    .replace(/\s+/g, ''),
                'base64',
            ),
        ),
        tools: {
            node: process.version,
            npm: optional(() => run('npm', ['-v'])),
            hermescSha256: fs.existsSync(hermesc) ? await sha256File(hermesc) : null,
            reactNative: packageVersion('react-native'),
            expo: packageVersion('expo'),
            expoUpdates: packageVersion('expo-updates'),
            expoCli: packageVersion('@expo/cli'),
            metro: packageVersion('metro'),
            xcode: platform === 'ios' ? optional(() => run('xcodebuild', ['-version']).replace(/\n/g, ' ')) : null,
            ndk:
                platform === 'android'
                    ? optional(
                          () =>
                              fs
                                  .readFileSync(path.join(ROOT, 'android/build.gradle'), 'utf8')
                                  .match(/ndkVersion\s*=\s*"([^"]+)"/)?.[1] ?? null,
                      )
                    : null,
        },
        recordedAt: new Date().toISOString(),
    };

    fs.mkdirSync(path.dirname(outFile), { recursive: true, mode: 0o700 });
    fs.writeFileSync(outFile, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o444 });
    console.log(`[✓] ${outFile}`);
    console.log(`    runtime ${runtime} (${platform}), commit ${record.gitCommit.slice(0, 12)}, fingerprint ${record.fingerprint.hash}`);
    console.log(`    next, on the laptop: ota runtime:add ${runtime} ${platform}`);
};

main().catch((error) => die(error.message));
