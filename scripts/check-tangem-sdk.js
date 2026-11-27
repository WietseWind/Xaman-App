#!/usr/bin/env node

// This check deliberately uses only Node built-ins: it also runs before npm ci.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_ROOT = path.resolve(__dirname, '..');
const MANIFEST = 'vendor/tangem/manifest.json';
const ANDROID_REPO = 'vendor/tangem/android/maven/com/github/tangem/tangem-sdk-android';
const REQUIRED_FILES = [
    `${ANDROID_REPO}/android/3.7.2/android-3.7.2.aar`,
    `${ANDROID_REPO}/core/3.7.2/core-3.7.2.jar`,
    'vendor/tangem/ios/TangemSdk/TangemSdk.podspec.json',
];

function verifyTangemSdk(root = DEFAULT_ROOT, { requireInstalled = false } = {}) {
    const problems = [];
    const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
    const manifest = JSON.parse(read(MANIFEST));
    if (manifest.schema !== 1 || !Array.isArray(manifest.files) || manifest.files.length < 2) {
        throw new Error('Invalid Tangem recovery manifest');
    }

    // The archives and the pod spec have to be in the list: a shortened manifest must not pass.
    const listed = new Set(manifest.files.map((entry) => entry && entry.path));
    for (const required of REQUIRED_FILES) {
        if (!listed.has(required)) {
            throw new Error(`Invalid Tangem recovery manifest: ${required} is not listed`);
        }
    }

    // Everything under vendor/tangem has to be a listed regular file. An extra Swift file would be compiled into
    // the app (the pod takes every .swift file of its tree), and a symlinked folder would read files from elsewhere.
    for (const component of ['vendor', 'vendor/tangem']) {
        if (!fs.lstatSync(path.join(root, component)).isDirectory()) {
            throw new Error(`Tangem SDK recovery check failed: ${component} is not a real directory`);
        }
    }
    const walk = (relative) => {
        for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
            const child = `${relative}/${entry.name}`;
            if (entry.isDirectory()) {
                walk(child);
            } else if (!entry.isFile()) {
                problems.push(`${child}: not a regular file or directory`);
            } else if (child !== MANIFEST && !listed.has(child)) {
                problems.push(`${child}: not in the manifest`);
            }
        }
    };
    walk('vendor/tangem');

    const seen = new Set();
    for (const entry of manifest.files) {
        const relative = entry.path;
        if (typeof relative !== 'string' || !relative.startsWith('vendor/tangem/') ||
            relative.split('/').includes('..') || path.isAbsolute(relative) || seen.has(relative)) {
            throw new Error(`Invalid Tangem recovery path: ${relative}`);
        }
        seen.add(relative);
        try {
            const file = path.join(root, relative);
            if (!fs.lstatSync(file).isFile()) throw new Error('not a regular file');
            const contents = fs.readFileSync(file);
            const sha256 = crypto.createHash('sha256').update(contents).digest('hex');
            if (contents.length !== entry.bytes || sha256 !== entry.sha256) {
                problems.push(`${relative}: checksum differs`);
            }
        } catch (error) {
            problems.push(`${relative}: missing or unreadable`);
        }
    }

    const packageJson = JSON.parse(read('package.json'));
    const lock = JSON.parse(read('package-lock.json'));
    const wrapperVersion = manifest.wrapper.version;
    if (packageJson.dependencies['tangem-sdk-react-native'] !== wrapperVersion ||
        lock.packages['node_modules/tangem-sdk-react-native'].version !== wrapperVersion) {
        problems.push('Tangem React Native wrapper version changed; review the recovery snapshot');
    }

    const installed = path.join(root, 'node_modules/tangem-sdk-react-native');
    if (requireInstalled || fs.existsSync(installed)) {
        try {
            const wrapper = JSON.parse(read('node_modules/tangem-sdk-react-native/package.json'));
            const properties = read('node_modules/tangem-sdk-react-native/android/gradle.properties');
            const podspec = read('node_modules/tangem-sdk-react-native/RNTangemSdk.podspec');
            const androidVersion = properties.match(/^RNTangemSdk_tangemSdkVersion=(.+)$/m)?.[1].trim();
            const iosVersion = podspec.match(/dependency\s+['"]TangemSdk['"]\s*,\s*['"]([^'"]+)['"]/)?.[1];
            if (wrapper.version !== wrapperVersion || androidVersion !== manifest.android.version ||
                iosVersion !== manifest.ios.version) {
                problems.push('Installed Tangem native versions differ from the recovery snapshot');
            }
        } catch (error) {
            problems.push('Installed Tangem wrapper is missing or unreadable; run npm ci');
        }
    }

    if (problems.length) {
        throw new Error(`Tangem SDK recovery check failed:\n${problems.map((problem) => `  - ${problem}`).join('\n')}\nRestore vendor/tangem from Git. Do not replace it with a newer SDK or delete it during cleanup.`);
    }
    return { files: manifest.files.length, android: manifest.android.version, ios: manifest.ios.version };
}

if (require.main === module) {
    try {
        const result = verifyTangemSdk(DEFAULT_ROOT, {
            requireInstalled: process.argv.includes('--require-installed'),
        });
        process.stdout.write(`Tangem recovery verified: ${result.files} files; Android ${result.android}; iOS ${result.ios}\n`);
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = { verifyTangemSdk };
