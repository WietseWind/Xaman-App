const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyTangemSdk } = require('../check-tangem-sdk');

const source = path.resolve(__dirname, '../..');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xaman-tangem-recovery-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.cpSync(path.join(source, 'vendor/tangem'), path.join(root, 'vendor/tangem'), { recursive: true });
    for (const file of ['package.json', 'package-lock.json']) {
        fs.copyFileSync(path.join(source, file), path.join(root, file));
    }
    return root;
}

test('committed SDK is usable without node_modules or a downloaded SDK', (t) => {
    const root = fixture(t);
    assert.ok(verifyTangemSdk(root).files > 250);
    assert.equal(fs.existsSync(path.join(root, 'node_modules')), false);
});

test('missing Android artifact fails before a build can fall back to a CDN', (t) => {
    const root = fixture(t);
    const relative = 'vendor/tangem/android/maven/com/github/tangem/tangem-sdk-android/android/3.7.2/android-3.7.2.aar';
    fs.unlinkSync(path.join(root, relative));
    assert.throws(() => verifyTangemSdk(root), /android-3\.7\.2\.aar: missing/);
});

test('changed Android metadata is detected as well as binary changes', (t) => {
    const root = fixture(t);
    const relative = 'vendor/tangem/android/maven/com/github/tangem/tangem-sdk-android/core/3.7.2/core-3.7.2.module';
    fs.appendFileSync(path.join(root, relative), '\n');
    assert.throws(() => verifyTangemSdk(root), /core-3\.7\.2\.module: checksum differs/);
});

test('deleted iOS source is detected before CocoaPods runs', (t) => {
    const root = fixture(t);
    const relative = 'vendor/tangem/ios/TangemSdk/TangemSdk/TangemSdk/TangemSdk.swift';
    fs.unlinkSync(path.join(root, relative));
    assert.throws(() => verifyTangemSdk(root), /TangemSdk\.swift: missing/);
});

test('wrapper upgrade needs an explicit recovery snapshot review', (t) => {
    const root = fixture(t);
    const file = path.join(root, 'package.json');
    const json = JSON.parse(fs.readFileSync(file));
    json.dependencies['tangem-sdk-react-native'] = '2.3.2';
    fs.writeFileSync(file, JSON.stringify(json));
    assert.throws(() => verifyTangemSdk(root), /wrapper version changed/);
});

test('installed native version drift is rejected after npm ci', (t) => {
    const root = fixture(t);
    const wrapper = path.join(root, 'node_modules/tangem-sdk-react-native');
    fs.mkdirSync(path.join(wrapper, 'android'), { recursive: true });
    fs.writeFileSync(path.join(wrapper, 'package.json'), JSON.stringify({ version: '2.3.1' }));
    fs.writeFileSync(path.join(wrapper, 'android/gradle.properties'), 'RNTangemSdk_tangemSdkVersion=3.7.3\n');
    fs.writeFileSync(path.join(wrapper, 'RNTangemSdk.podspec'), 's.dependency \'TangemSdk\', "3.4.0"\n');
    assert.throws(() => verifyTangemSdk(root, { requireInstalled: true }), /native versions differ/);
});

test('native builds require the installed wrapper as well as the recovery snapshot', (t) => {
    const root = fixture(t);
    assert.throws(() => verifyTangemSdk(root, { requireInstalled: true }), /wrapper is missing/);
});

test('local Maven metadata retains cached API/runtime dependency visibility', () => {
    const read = (file) => JSON.parse(fs.readFileSync(path.join(source, file), 'utf8'));
    const original = read('vendor/tangem/provenance/android-cached-variants.json');
    for (const name of ['android', 'core']) {
        const module = read(`vendor/tangem/android/maven/com/github/tangem/tangem-sdk-android/${name}/3.7.2/${name}-3.7.2.module`);
        for (const config of ['debugCompileClasspath', 'debugRuntimeClasspath']) {
            const cached = original[config].find(entry => entry.module.split(':')[1] === name);
            const variant = module.variants.find(entry => entry.name === cached.variants[0].name);
            const dependencies = variant.dependencies.map(entry =>
                `${entry.group}:${entry.module}:${entry.version.requires}`);
            assert.deepEqual(dependencies, cached.dependencies.map(entry => entry.requested));
            const attributes = { ...variant.attributes };
            if (attributes['org.gradle.jvm.version']) {
                attributes['org.gradle.jvm.version'] = String(attributes['org.gradle.jvm.version']);
            }
            assert.deepEqual(attributes, cached.variants[0].attributes);
        }
    }
});

test('a future cleanup cannot replace native SDK files with symlinks', (t) => {
    const root = fixture(t);
    const file = path.join(root, 'vendor/tangem/ios/TangemSdk/LICENSE');
    const contents = fs.readFileSync(file);
    const target = path.join(root, 'license-copy');
    fs.writeFileSync(target, contents);
    fs.unlinkSync(file);
    fs.symlinkSync(target, file);
    assert.throws(() => verifyTangemSdk(root), /LICENSE: missing or unreadable/);
});

test('post-install and both native build paths enforce recovery integrity', () => {
    const text = (file) => fs.readFileSync(path.join(source, file), 'utf8');
    assert.match(text('scripts/post-install.sh'), /scripts\/check-native-deps\.sh --patches-only/);
    assert.match(text('scripts/check-native-deps.sh'), /node scripts\/check-tangem-sdk\.js --require-installed/);
    assert.match(text('android/build.gradle'), /apply from: "tangem-recovery\.gradle"/);
    assert.match(text('android/tangem-recovery.gradle'), /exclusiveContent/);
    assert.match(text('android/tangem-recovery.gradle'), /check-tangem-sdk\.js/);
    assert.match(text('ios/Podfile'), /check-tangem-sdk\.js/);
    assert.match(text('ios/Podfile'), /pod 'TangemSdk', :path => '\.\.\/vendor\/tangem\/ios\/TangemSdk'/);
    assert.match(text('.gitattributes'), /vendor\/tangem\/\*\* -text -filter/);
});
