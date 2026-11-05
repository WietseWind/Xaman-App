/* eslint-disable no-console */

/*
   Over-the-air updates (expo-updates): both platforms must carry the production configuration.
   Run by scripts/check-endpoints.sh (pre-commit hook and the endpoints-guard workflow).

   - updates on, from the production endpoint
   - runtime version = {version}.{build} of this native build (scripts/bump-build-number.sh)
   - the native side never checks by itself: the app checks from JS (CHECK_ON_LAUNCH NEVER, LAUNCH_WAIT_MS 0)
   - the store build always carries its own bundle (an update is never needed to start)
   - only updates signed with the OTA signing key run: certs/ota-certificate.pem on both platforms,
     keyid "main", alg "rsa-v1_5-sha256", no unsigned manifests, no certificate chain from the server
*/

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const UPDATE_URL = 'https://xaman.app/api/v1/app/ota/manifest';
const CERTIFICATE_FILE = 'certs/ota-certificate.pem';
const SIGNING_METADATA = { keyid: 'main', alg: 'rsa-v1_5-sha256' };

const errors = [];
const fail = (message) => errors.push(message);

const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const certificate = read(CERTIFICATE_FILE).trim();
const withoutComments = (xml) => xml.replace(/<!--[\s\S]*?-->/g, '');
const decodeXml = (value) =>
    value
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, '\'')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const expectEqual = (label, actual, expected) => {
    if (actual !== expected) {
        fail(`${label} is ${JSON.stringify(actual)}, must be ${JSON.stringify(expected)}`);
    }
};

const expectNotTrue = (label, value) => {
    if (value === true || value === 'true') {
        fail(`${label} must not be enabled`);
    }
};

const sameCertificate = (value) => typeof value === 'string' && value.trim() === certificate;

const sameMetadata = (value) =>
    !!value &&
    Object.keys(value).length === Object.keys(SIGNING_METADATA).length &&
    Object.entries(SIGNING_METADATA).every(([key, expected]) => value[key] === expected);

const singleValue = (values, label) => {
    const unique = [...new Set(values)];
    if (unique.length !== 1) {
        fail(`${label}: expected one value, found ${JSON.stringify(unique)}`);
    }
    return unique[0];
};

/* Certificate ==================================================================== */
let certificateInfo = '';

if (/PRIVATE KEY/.test(certificate)) {
    fail(`${CERTIFICATE_FILE} contains a private key: only the public certificate belongs in the repo`);
} else {
    try {
        const x509 = new crypto.X509Certificate(certificate);
        const daysLeft = Math.floor((new Date(x509.validTo).getTime() - Date.now()) / 86400000);
        certificateInfo = `certificate ${x509.fingerprint256.slice(0, 11)}…, ${daysLeft} days left`;
        if (daysLeft < 365) {
            console.warn(`[!] ${CERTIFICATE_FILE} expires in ${daysLeft} days: plan a new key (docs/ota-updates.md)`);
        }
    } catch (error) {
        fail(`${CERTIFICATE_FILE} is not a valid certificate (${error.message})`);
    }
}

/* iOS ==================================================================== */
const plist = withoutComments(read('ios/Xaman/Expo.plist'));

const plistValue = (key) => {
    const pattern = `<key>${escapeRegex(key)}</key>`;
    const count = plist.split(pattern).length - 1;
    if (count > 1) {
        fail(`Expo.plist: ${key} appears ${count} times`);
    }
    const match = plist.match(
        new RegExp(`${pattern}\\s*(?:(<true/>)|(<false/>)|<string>([^<]*)</string>|<integer>([^<]*)</integer>)`),
    );
    if (!match) {
        return undefined;
    }
    if (match[1]) {
        return true;
    }
    if (match[2]) {
        return false;
    }
    return decodeXml(match[3] !== undefined ? match[3] : match[4]);
};

const plistDict = (key) => {
    const match = plist.match(new RegExp(`<key>${escapeRegex(key)}</key>\\s*<dict>([\\s\\S]*?)</dict>`));
    if (!match) {
        return undefined;
    }
    const dict = {};
    for (const [, name, value] of match[1].matchAll(/<key>([^<]*)<\/key>\s*<string>([^<]*)<\/string>/g)) {
        dict[decodeXml(name)] = decodeXml(value);
    }
    return dict;
};

const pbxproj = read('ios/Xaman.xcodeproj/project.pbxproj');
const buildSetting = (name) =>
    singleValue(
        [...pbxproj.matchAll(new RegExp(`\\b${name} = "?([^";]+)"?;`, 'g'))].map(([, value]) => value),
        `iOS ${name}`,
    );
const iosRuntime = `${buildSetting('MARKETING_VERSION')}.${buildSetting('CURRENT_PROJECT_VERSION')}`;

expectEqual('iOS EXUpdatesEnabled', plistValue('EXUpdatesEnabled'), true);
expectEqual('iOS EXUpdatesURL', plistValue('EXUpdatesURL'), UPDATE_URL);
expectEqual('iOS EXUpdatesRuntimeVersion', plistValue('EXUpdatesRuntimeVersion'), iosRuntime);
expectEqual('iOS EXUpdatesCheckOnLaunch', plistValue('EXUpdatesCheckOnLaunch'), 'NEVER');
expectEqual('iOS EXUpdatesLaunchWaitMs', plistValue('EXUpdatesLaunchWaitMs'), '0');
if (plistValue('EXUpdatesHasEmbeddedUpdate') === false) {
    fail('iOS EXUpdatesHasEmbeddedUpdate must not be false');
}
if (!sameCertificate(plistValue('EXUpdatesCodeSigningCertificate'))) {
    fail(`iOS EXUpdatesCodeSigningCertificate differs from ${CERTIFICATE_FILE}`);
}
if (!sameMetadata(plistDict('EXUpdatesCodeSigningMetadata'))) {
    fail(`iOS EXUpdatesCodeSigningMetadata must be ${JSON.stringify(SIGNING_METADATA)}`);
}
// expo-updates reads this one with "Config" in the key; check both spellings
['EXUpdatesConfigCodeSigningAllowUnsignedManifests', 'EXUpdatesCodeSigningAllowUnsignedManifests'].forEach((key) =>
    expectNotTrue(`iOS ${key}`, plistValue(key)),
);
expectNotTrue(
    'iOS EXUpdatesCodeSigningIncludeManifestResponseCertificateChain',
    plistValue('EXUpdatesCodeSigningIncludeManifestResponseCertificateChain'),
);

/* Android ==================================================================== */
const manifest = withoutComments(read('android/app/src/main/AndroidManifest.xml'));
const strings = withoutComments(read('android/app/src/main/res/values/strings.xml'));
const gradle = read('android/app/build.gradle');

const androidString = (name) => {
    const match = strings.match(new RegExp(`<string name="${escapeRegex(name)}"[^>]*>([^<]*)</string>`));
    // string resource escapes: \n is a line break, \x is x
    return match ? decodeXml(match[1]).replace(/\\(.)/g, (_, char) => (char === 'n' ? '\n' : char)) : undefined;
};

const metaData = (name) => {
    const elements = [...manifest.matchAll(/<meta-data\b[^>]*>/g)]
        .map(([element]) => element)
        .filter((element) => element.includes(`android:name="${name}"`));
    if (elements.length > 1) {
        fail(`AndroidManifest.xml: ${name} appears ${elements.length} times`);
    }
    const value = elements[0]?.match(/android:value="([^"]*)"/);
    if (!value) {
        return undefined;
    }
    const decoded = decodeXml(value[1]);
    const reference = decoded.match(/^@string\/(\w+)$/);
    return reference ? androidString(reference[1]) : decoded;
};

const gradleValue = (name) => {
    const match = gradle.match(new RegExp(`def ${name} = "?([^"\\s]+)"?`));
    return match ? match[1] : undefined;
};
const androidRuntime = `${gradleValue('canonicalVersionName')}.${gradleValue('canonicalVersionCode')}`;

const parseJson = (value) => {
    try {
        return JSON.parse(value);
    } catch {
        return undefined;
    }
};

const UPDATES = 'expo.modules.updates';
expectEqual('Android ENABLED', metaData(`${UPDATES}.ENABLED`), 'true');
expectEqual('Android EXPO_UPDATE_URL', metaData(`${UPDATES}.EXPO_UPDATE_URL`), UPDATE_URL);
expectEqual('Android EXPO_RUNTIME_VERSION', metaData(`${UPDATES}.EXPO_RUNTIME_VERSION`), androidRuntime);
expectEqual('Android EXPO_UPDATES_CHECK_ON_LAUNCH', metaData(`${UPDATES}.EXPO_UPDATES_CHECK_ON_LAUNCH`), 'NEVER');
expectEqual('Android EXPO_UPDATES_LAUNCH_WAIT_MS', metaData(`${UPDATES}.EXPO_UPDATES_LAUNCH_WAIT_MS`), '0');
if (metaData(`${UPDATES}.HAS_EMBEDDED_UPDATE`) === 'false') {
    fail('Android HAS_EMBEDDED_UPDATE must not be false');
}
if (!sameCertificate(metaData(`${UPDATES}.CODE_SIGNING_CERTIFICATE`))) {
    fail(`Android CODE_SIGNING_CERTIFICATE differs from ${CERTIFICATE_FILE}`);
}
if (!sameMetadata(parseJson(metaData(`${UPDATES}.CODE_SIGNING_METADATA`)))) {
    fail(`Android CODE_SIGNING_METADATA must be ${JSON.stringify(SIGNING_METADATA)}`);
}
expectNotTrue('Android CODE_SIGNING_ALLOW_UNSIGNED_MANIFESTS', metaData(`${UPDATES}.CODE_SIGNING_ALLOW_UNSIGNED_MANIFESTS`));
expectNotTrue(
    'Android CODE_SIGNING_INCLUDE_MANIFEST_RESPONSE_CERTIFICATE_CHAIN',
    metaData(`${UPDATES}.CODE_SIGNING_INCLUDE_MANIFEST_RESPONSE_CERTIFICATE_CHAIN`),
);

/* Result ==================================================================== */
if (errors.length) {
    console.log('ERROR: over-the-air update configuration (expo-updates):');
    errors.forEach((error) => console.log(`  - ${error}`));
    process.exit(1);
}

console.log(`[✓] over-the-air updates: runtime ${iosRuntime} (iOS) / ${androidRuntime} (Android), ${certificateInfo}`);
