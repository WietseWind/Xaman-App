import crypto from 'crypto';

import { generate } from 'xrpl-accountlib';
import { classicAddressToXAddress, encodeAccountPublic, encodeNodePublic } from 'ripple-address-codec';

import {
    scrubText,
    scrubStack,
    scrubParams,
    sha256,
    xrplBase58Kind,
    looksRandom,
    groupingName,
    describeThrown,
    REDACTED,
} from '../scrub';
import { parseFrames } from '../stack';

// Fresh key material on every run, so nothing passes because of a lucky fixture.
const secp = generate.familySeed({ algorithm: 'secp256k1' });
const ed = generate.familySeed({ algorithm: 'ed25519' });
const numbers = generate.secretNumbers();
const mnemonic = generate.mnemonic();
const rows: string[] = numbers.secret.secretNumbers!;
const mnemonicWords = mnemonic.secret.mnemonic!.split(' ');
const randomHex = (bytes: number) => crypto.randomBytes(bytes).toString('hex');
// A fixed address: a random one can contain six digits in a row, which the digit rule redacts.
const ADDRESS = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

const SECRETS: Record<string, string> = {
    secpSeed: secp.secret.familySeed!,
    edSeed: ed.secret.familySeed!,
    secpPrivateKey: secp.keypair.privateKey!,
    secpPublicKey: secp.keypair.publicKey!,
    edPrivateKey: ed.keypair.privateKey!,
    edPublicKey: ed.keypair.publicKey!,
    privateKey64: randomHex(32),
    privateKey64Lower: randomHex(32).toLowerCase(),
    encryptionKey128: randomHex(64),
    secretNumbersSpaced: rows.join(' '),
    secretNumbersDotted: rows.join('.'),
    secretNumbersJson: JSON.stringify(rows),
    secretNumbersLines: rows.join('\n'),
    secretNumbersConcatenated: rows.join(''),
    mnemonic24: mnemonic.secret.mnemonic!,
    mnemonic12: mnemonicWords.slice(0, 12).join(' '),
    mnemonicJson: JSON.stringify(mnemonicWords.slice(0, 12)),
    accountPublicBase58: encodeAccountPublic(Buffer.from(secp.keypair.publicKey!, 'hex') as any),
    nodePublicBase58: encodeNodePublic(Buffer.from(secp.keypair.publicKey!, 'hex') as any),
    base64Key: crypto.randomBytes(32).toString('base64'),
};

const CONTEXTS: Array<(secret: string) => string> = [
    (s) => s,
    (s) => `Invalid secret ${s}`,
    (s) => `Error: unable to import "${s}" into vault`,
    (s) => JSON.stringify({ value: s, other: 1 }),
    (s) => `prefix${s}suffix`,
    (s) => `xumm://xaman.app/detect/${encodeURIComponent(s)}`,
    (s) => `line one\nline two: ${s}\nline three`,
    (s) => `[${s}]`,
    (s) => `(${s}),`,
];

// Every 10-character piece of the secret (ignoring separators) must be gone.
const leaks = (output: string, secret: string): string[] => {
    const compact = secret.replace(/[\s.,"[\]\n]/g, '');
    const haystack = output.replace(/[\s.,"[\]\n]/g, '');
    const found: string[] = [];
    for (let i = 0; i + 10 <= compact.length; i++) {
        const piece = compact.slice(i, i + 10);
        if (haystack.includes(piece)) {
            found.push(piece);
        }
    }
    return found;
};

describe('scrubText: secrets never survive', () => {
    Object.keys(SECRETS).forEach((name) => {
        CONTEXTS.forEach((context, index) => {
            // a mnemonic glued to other words loses its first and last word to them: accepted
            if (name.startsWith('mnemonic') && index === 4) {
                return;
            }
            it(`${name} in context ${index}`, () => {
                const secret = SECRETS[name];
                const output = scrubText(context(secret), 10000);
                expect(leaks(output, secret)).toEqual([]);
                expect(output).toContain(REDACTED);
            });
        });
    });

    it('removes every secret number row, also a single row on its own', () => {
        rows.forEach((row) => {
            expect(scrubText(`row ${row}`)).not.toContain(row);
            expect(scrubText(rows.join(' '))).not.toContain(row);
        });
    });

    it('removes a whole account object', () => {
        const output = scrubText(JSON.stringify(secp), 10000);
        [secp.secret.familySeed!, secp.keypair.privateKey!, secp.keypair.publicKey!].forEach((secret) => {
            expect(leaks(output, secret)).toEqual([]);
        });
    });

    it('removes the passcode-sized number', () => {
        expect(scrubText('passcode 123456 rejected')).toBe(`passcode ${REDACTED} rejected`);
    });

    it('keeps addresses, also X-addresses', () => {
        const xAddress = classicAddressToXAddress(ADDRESS, false, false);
        const xTest = classicAddressToXAddress(ADDRESS, 99, true);
        expect(xrplBase58Kind(ADDRESS)).toBe('address');
        expect(scrubText(`destination ${ADDRESS} not found`)).toBe(`destination ${ADDRESS} not found`);
        expect(scrubText(`to ${xAddress}`)).toBe(`to ${xAddress}`);
        expect(scrubText(`to ${xTest}`)).toBe(`to ${xTest}`);
        expect(scrubText(`{"Account":"${ADDRESS}","Destination":"${xAddress}"}`)).toBe(
            `{"Account":"${ADDRESS}","Destination":"${xAddress}"}`,
        );
    });

    it('redacts a corrupted seed (bad checksum) too', () => {
        const seed = SECRETS.secpSeed;
        const corrupted = `${seed.slice(0, 10)}${seed[10] === 'a' ? 'b' : 'a'}${seed.slice(11)}`;
        expect(xrplBase58Kind(corrupted)).toBeUndefined();
        expect(leaks(scrubText(`seed ${corrupted}`), corrupted)).toEqual([]);
    });

    it('redacts sensitive key values', () => {
        expect(scrubText('{"accessToken":"0b2d6f3e-1c2a-4b5d-8e9f-0a1b2c3d4e5f","x":1}')).toBe(
            `{"accessToken":"${REDACTED}","x":1}`,
        );
        expect(scrubText('password=hunter2&next=1')).toBe(`password=${REDACTED}&next=1`);
        expect(scrubText('passphrase: \'correct horse\'')).toBe(`passphrase: '${REDACTED}'`);
        expect(scrubText('{"oldKey":"x","seedPhrase":"abc def"}')).toContain(`"seedPhrase":"${REDACTED}"`);
    });

    it('redacts credentials, JWTs and URL queries', () => {
        expect(scrubText('Authorization: Bearer abc.def.ghi-12345678')).not.toContain('ghi-12345678');
        const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N';
        expect(scrubText(`token ${jwt}`)).not.toContain(
            'eyJhbGci',
        );
        expect(scrubText('GET https://xaman.app/api/v1/app/ping?ott=abcdef&x=1 failed')).toBe(
            `GET https://xaman.app/api/v1/app/ping?${REDACTED} failed`,
        );
        expect(scrubText('open xumm://xapp/sandbox?xAppToken=123#frag')).toBe(`open xumm://xapp/sandbox?${REDACTED}`);
    });
});

describe('scrubText: useful details survive', () => {
    const KEEP = [
        'TypeError: Cannot read property \'amount\' of undefined',
        'undefined is not a function',
        'storageEncryptionKeyExist is not a function',
        'setServiceFeeSubmitCondition failed',
        'Request failed with status 502',
        'payload 0b2d6f3e-1c2a-4b5d-8e9f-0a1b2c3d4e5f expired',
        'ledger 93123456 not validated',
        'at 1793809423811',
        'amount 1.123456 XRP',
        'card CB79000000018201 not supported',
        'network MAINNET (id 0)',
        'tecPATH_DRY: Path could not send partial amount',
        'Realm file decryption failed',
        'https://xaman.app/api/v1/app/ping',
        'The user cancelled the operation',
    ];

    KEEP.forEach((text) => {
        it(`keeps "${text}"`, () => {
            expect(scrubText(text)).toBe(text);
        });
    });

    it('is idempotent', () => {
        Object.values(SECRETS).forEach((secret) => {
            const once = scrubText(`x ${secret} y`);
            expect(scrubText(once)).toBe(once);
        });
    });

    it('truncates after scrubbing', () => {
        const output = scrubText(`${'Error: '.repeat(10)} ${SECRETS.privateKey64}`, 40);
        expect(output.length).toBeLessThanOrEqual(40);
        expect(output.endsWith('…')).toBe(true);
    });

    it('handles non-string input', () => {
        expect(scrubText(undefined)).toBe('undefined');
        expect(scrubText(123456)).toBe(REDACTED);
        expect(scrubText({ toString: () => SECRETS.edSeed })).toBe(REDACTED);
    });

    it('scrubs 64 KB of input quickly', () => {
        const big = crypto.randomBytes(48 * 1024).toString('base64');
        const started = Date.now();
        scrubText(big);
        expect(Date.now() - started).toBeLessThan(1000);
    });
});

describe('scrubStack', () => {
    const APP_ID = '0B2D6F3E-1C2A-4B5D-8E9F-0A1B2C3D4E5F';
    const hermesStack = [
        `Error: failed for ${SECRETS.secpSeed} and ${SECRETS.secpPrivateKey}`,
        '    at signWithPrivateKey (address at index.android.bundle:1:1234567)',
        `    at anonymous (address at /private/var/containers/Bundle/Application/${APP_ID}/Xaman.app/main.jsbundle:1:123456)`,
        '    at apply (native)',
        '    at tryCallOne (address at index.android.bundle:1:2345)',
    ].join('\n');

    it('scrubs the message and keeps frames byte for byte', () => {
        const output = scrubStack(hermesStack);
        const lines = output.split('\n');
        expect(leaks(lines[0], SECRETS.secpSeed)).toEqual([]);
        expect(leaks(lines[0], SECRETS.secpPrivateKey)).toEqual([]);
        expect(lines.slice(1)).toEqual(hermesStack.split('\n').slice(1));
    });

    it('scrubs lines in the frame part that are not frames', () => {
        const output = scrubStack(`Error: x\n    at foo (address at index.android.bundle:1:1)\n${SECRETS.mnemonic12}`);
        expect(output).not.toContain(`${mnemonicWords[0]  } ${  mnemonicWords[1]}`);
    });

    it('keeps multi-line messages scrubbed', () => {
        const output = scrubStack(`Error: first\n${SECRETS.edSeed}\n    at foo (address at main.jsbundle:1:10)`);
        expect(output).toBe(`Error: first\n${REDACTED}\n    at foo (address at main.jsbundle:1:10)`);
    });
});

describe('parseFrames', () => {
    it('parses Hermes, native and JSC frames to basenames', () => {
        expect(
            parseFrames(
                [
                    'Error: x',
                    '    at onPress (address at /private/var/x/Xaman.app/main.jsbundle:1:4242)',
                    '    at apply (native)',
                    '    at index.android.bundle:1:7',
                    'render@http://localhost:8081/index.bundle?platform=ios:120:30',
                ].join('\n'),
            ),
        ).toEqual([
            { fn: 'onPress', file: 'main.jsbundle', line: 1, col: 4242 },
            { fn: 'apply', file: 'native', line: 0, col: 0 },
            { fn: '', file: 'index.android.bundle', line: 1, col: 7 },
            { fn: 'render', file: 'index.bundle', line: 120, col: 30 },
        ]);
    });
});

describe('scrubParams', () => {
    it('scrubs strings, keeps safe numbers and booleans, drops objects', () => {
        expect(
            scrubParams({
                transactionType: 'Payment',
                preferredSigner: ADDRESS,
                card: 'CB79000000018201',
                message: `failed ${SECRETS.edPrivateKey}`,
                tabsLength: 5,
                pin: 123456,
                ok: true,
                nested: { seed: SECRETS.secpSeed },
            }),
        ).toEqual({
            transactionType: 'Payment',
            preferredSigner: ADDRESS,
            card: 'CB79000000018201',
            message: `failed ${REDACTED}`,
            tabsLength: 5,
            pin: REDACTED,
            ok: true,
        });
    });
});

describe('helpers', () => {
    it('sha256 matches node crypto', () => {
        for (let length = 0; length < 200; length += 7) {
            const input = crypto.randomBytes(length);
            expect(Buffer.from(sha256(Array.from(input))).toString('hex')).toBe(
                crypto.createHash('sha256').update(input).digest('hex'),
            );
        }
    });

    it('classifies base58check tokens', () => {
        expect(xrplBase58Kind(secp.address!)).toBe('address');
        expect(xrplBase58Kind(SECRETS.secpSeed)).toBe('other');
        expect(xrplBase58Kind(SECRETS.edSeed)).toBe('other');
        expect(xrplBase58Kind('storageEncryptionKeyExist')).toBeUndefined();
    });

    it('tells random tokens from identifiers', () => {
        expect(looksRandom('storageEncryptionKeyExist')).toBe(false);
        expect(looksRandom('setServiceFeeSubmitCondition')).toBe(false);
        expect(looksRandom(SECRETS.secpSeed)).toBe(true);
    });

    it('describes non-Error throwables without dumping them', () => {
        expect(describeThrown('plain')).toBe('plain');
        expect(describeThrown(undefined)).toBe('undefined');
        expect(describeThrown({ code: 'E_X', message: 'boom', secret: 'x' })).toBe(
            'Object thrown, code: E_X, message: boom',
        );
        expect(describeThrown({ secret: 'x', other: 1 })).toBe('Object thrown, keys: secret,other');
    });

    it('groups the same bug under one stable name', () => {
        const frames = parseFrames(
            'Error\n    at tryCallOne (address at a:1:1)\n    at fetchRates (address at a:1:99)',
        );
        const first = groupingName({
            errorName: 'Error',
            message: 'HTTP 502 for 0b2d6f3e-1c2a-4b5d-8e9f-0a1b2c3d4e5f',
            frames,
        });
        const second = groupingName({
            errorName: 'Error',
            message: 'HTTP 504 for 1c2d6f3e-1c2a-4b5d-8e9f-0a1b2c3d4e5f',
            frames,
        });
        expect(first).toBe(second);
        expect(first).toBe('Error: HTTP <n> for <uuid> @ fetchRates');
        expect(groupingName({ context: 'Vault sign', errorName: 'TypeError', message: 'x', frames: [] })).toBe(
            'Vault sign: TypeError: x',
        );
    });
});

describe('fuzz', () => {
    it('200 fresh accounts: no seed, key, secret number or mnemonic survives', () => {
        for (let i = 0; i < 200; i++) {
            const account = generate.familySeed({ algorithm: i % 2 ? 'ed25519' : 'secp256k1' });
            const secretNumbers = generate.secretNumbers().secret.secretNumbers!;
            const words = generate.mnemonic().secret.mnemonic!;
            const secrets = [
                account.secret.familySeed!,
                account.keypair.privateKey!,
                account.keypair.publicKey!,
                secretNumbers.join(' '),
                words,
            ];
            const output = scrubText(
                `failed: ${secrets.join(' | ')} ${JSON.stringify(account)} ${account.secret.familySeed}x`,
                100000,
            );
            secrets.forEach((secret) => {
                expect(leaks(output, secret)).toEqual([]);
            });
            secretNumbers.forEach((row) => expect(output).not.toContain(row));
        }
    });
});
