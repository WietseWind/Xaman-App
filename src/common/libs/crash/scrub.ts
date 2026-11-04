/**
 * Crash report scrubber.
 *
 * Everything that leaves the device through Crashlytics (and Analytics, whose events
 * Crashlytics attaches to reports as breadcrumbs) goes through scrubText first.
 * When in doubt it redacts: a lost detail in a crash report is cheap, a leaked key is not.
 *
 * Redacted:
 *  - hex runs of 32+ characters (private keys, public keys, hashes, encryption keys)
 *  - XRPL base58 tokens: seeds (s…/sEd…), public keys, and anything else 25+ characters
 *    that has a valid XRPL checksum or looks random. Addresses (r… and X-addresses) are
 *    public and kept.
 *  - secret numbers: two or more 6-digit groups, any lone 6-digit number (also covers
 *    the passcode, also after ":" or "."; decimals like 1.123456 are kept), digit runs of 24+
 *  - mnemonic-like runs of 12+ words of 3-8 letters, in any case
 *  - values of token/secret/password/seed/... keys, Bearer/Basic credentials, JWTs; Analytics
 *    params and custom keys with such names are redacted whole
 *  - long random base64 runs (keys in base64)
 *  - URL query strings and fragments
 * Percent-encoded text is decoded first. Stack frame lines keep their line and column numbers;
 * their function and file names are scrubbed like any other text.
 * See docs/crash-reporting.md.
 */

import { isFrameLine, rewriteFrameLine, parseFrames, firstMeaningfulFunction, StackFrame } from './stack';

export const REDACTED = '[redacted]';

// Only this much input is scrubbed; output is always truncated far below it, so a secret cut at
// the cap can never reach the output.
const MAX_INPUT = 64 * 1024;

/* SHA-256 (for XRPL base58check)  ==================================================================== */
const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
    0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
    0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
    0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
    0xc67178f2,
];

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

export const sha256 = (input: number[]): number[] => {
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const bytes = input.slice();
    const bitLength = input.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) {
        bytes.push(0);
    }
    const high = Math.floor(bitLength / 0x100000000);
    const low = bitLength >>> 0;
    bytes.push((high >>> 24) & 0xff, (high >>> 16) & 0xff, (high >>> 8) & 0xff, high & 0xff);
    bytes.push((low >>> 24) & 0xff, (low >>> 16) & 0xff, (low >>> 8) & 0xff, low & 0xff);

    const w = new Array<number>(64);
    for (let offset = 0; offset < bytes.length; offset += 64) {
        for (let t = 0; t < 16; t++) {
            const i = offset + t * 4;
            w[t] = ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) | 0;
        }
        for (let t = 16; t < 64; t++) {
            const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
            const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
            w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
        }

        let [a, b, c, d, e, f, g, h] = H;
        for (let t = 0; t < 64; t++) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (h + S1 + ch + K[t] + w[t]) | 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) | 0;
            h = g;
            g = f;
            f = e;
            e = (d + t1) | 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) | 0;
        }
        H[0] = (H[0] + a) | 0;
        H[1] = (H[1] + b) | 0;
        H[2] = (H[2] + c) | 0;
        H[3] = (H[3] + d) | 0;
        H[4] = (H[4] + e) | 0;
        H[5] = (H[5] + f) | 0;
        H[6] = (H[6] + g) | 0;
        H[7] = (H[7] + h) | 0;
    }

    const out: number[] = [];
    H.forEach((word) => {
        out.push((word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff);
    });
    return out;
};

/* XRPL base58check  ==================================================================== */
const XRPL_ALPHABET = 'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz';

const decodeBase58 = (value: string): number[] | undefined => {
    const bytes: number[] = [];
    for (let i = 0; i < value.length; i++) {
        let carry = XRPL_ALPHABET.indexOf(value[i]);
        if (carry < 0) {
            return undefined;
        }
        for (let j = 0; j < bytes.length; j++) {
            carry += bytes[j] * 58;
            bytes[j] = carry & 0xff;
            carry >>= 8;
        }
        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }
    for (let k = 0; k < value.length && value[k] === XRPL_ALPHABET[0]; k++) {
        bytes.push(0);
    }
    return bytes.reverse();
};

type Base58Kind = 'address' | 'other';

/**
 * The kind of a valid XRPL base58check token (address, or anything else: seed, public key, ...),
 * or undefined when the checksum does not match.
 */
export const xrplBase58Kind = (token: string): Base58Kind | undefined => {
    if (token.length < 25 || token.length > 64) {
        return undefined;
    }
    const bytes = decodeBase58(token);
    if (!bytes || bytes.length < 5) {
        return undefined;
    }
    const payload = bytes.slice(0, bytes.length - 4);
    const checksum = sha256(sha256(payload));
    for (let i = 0; i < 4; i++) {
        if (checksum[i] !== bytes[bytes.length - 4 + i]) {
            return undefined;
        }
    }
    const isClassicAddress = payload.length === 21 && payload[0] === 0x00;
    const isXAddress =
        payload.length === 31 &&
        ((payload[0] === 0x05 && payload[1] === 0x44) || (payload[0] === 0x04 && payload[1] === 0x93));
    return isClassicAddress || isXAddress ? 'address' : 'other';
};

/* Heuristics  ==================================================================== */
/**
 * Random-looking token (key material) versus an identifier or a word.
 */
export const looksRandom = (token: string): boolean => {
    if (/\d/.test(token) && /[A-Za-z]/.test(token)) {
        return true;
    }
    if (/[A-Z]{2}/.test(token)) {
        return true;
    }
    const letters = token.replace(/[^A-Za-z]/g, '');
    if (letters.length >= 20) {
        const vowels = letters.replace(/[^aeiouAEIOU]/g, '').length;
        if (vowels / letters.length < 0.25) {
            return true;
        }
    }
    return false;
};

const SENSITIVE_KEY = new RegExp(
    [
        'token',
        'secret',
        'passw',
        'passcode',
        'passphrase',
        'mnemonic',
        'seed',
        'private_?key',
        'privkey',
        'authoriz',
        'bearer',
        'jwt',
        'cookie',
        'credential',
        'api_?key',
        'signature',
    ].join('|'),
    'i',
);

// pin, PIN, pinCode, user_pin; not pinned, spinner or mapping
const PIN_KEY = /(?:^|[^A-Za-z])(?:pin|Pin|PIN)(?:$|[^a-z])/;

/**
 * True for a key name that marks its value as secret (token, password, seed, pin, …).
 */
export const isSensitiveKey = (key: string): boolean => SENSITIVE_KEY.test(key) || PIN_KEY.test(key);

const MIN_MNEMONIC_WORDS = 12;

const redactMnemonicRun = (run: string): string => {
    const words: Array<{ start: number; end: number; ok: boolean }> = [];
    const wordPattern = /[a-z]+/gi;
    let match = wordPattern.exec(run);
    while (match) {
        words.push({
            start: match.index,
            end: match.index + match[0].length,
            ok: match[0].length >= 3 && match[0].length <= 8,
        });
        match = wordPattern.exec(run);
    }
    if (words.length < MIN_MNEMONIC_WORDS) {
        return run;
    }

    let out = '';
    let cursor = 0;
    let i = 0;
    while (i < words.length) {
        if (!words[i].ok) {
            i += 1;
        } else {
            let j = i;
            while (j + 1 < words.length && words[j + 1].ok) {
                j += 1;
            }
            if (j - i + 1 >= MIN_MNEMONIC_WORDS) {
                out += run.slice(cursor, words[i].start) + REDACTED;
                cursor = words[j].end;
            }
            i = j + 1;
        }
    }
    return out + run.slice(cursor);
};

/* Rules  ==================================================================== */
const BASE58_ONLY = /^[1-9A-HJ-NP-Za-km-z]+$/;

const RULES: Array<(text: string) => string> = [
    // percent-encoded text (deep links, URLs) is scrubbed in its decoded form
    (text) =>
        text.replace(/(?:%[0-9A-Fa-f]{2})+/g, (sequence) => {
            try {
                return decodeURIComponent(sequence);
            } catch {
                return sequence;
            }
        }),
    // URL query strings and fragments (tokens, ids)
    (text) => text.replace(/\b([a-z][a-z0-9+.-]{1,20}:\/\/[^\s?#"'<>()]*)[?#][^\s"'<>()]*/gi, `$1?${REDACTED}`),
    // credentials and JWTs
    (text) => text.replace(/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${REDACTED}`),
    (text) => text.replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, REDACTED),
    // values of sensitive keys: "accessToken":"…", seed=…, password: …
    (text) =>
        text.replace(
            /(["']?)([A-Za-z][\w-]{0,63})\1(\s*[:=]\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s,;&}\])]+)/g,
            (all, quote, key, separator, value) => {
                if (!isSensitiveKey(key)) {
                    return all;
                }
                const wrap = ['"', '\''].includes(value[0]) ? value[0] : '';
                return `${quote}${key}${quote}${separator}${wrap}${REDACTED}${wrap}`;
            },
        ),
    // hex: private keys, public keys (66), hashes (64), encryption keys
    (text) => text.replace(/(?:0x)?[0-9a-fA-F]{32,}/g, REDACTED),
    // secret numbers (and the passcode): long digit runs, 6-digit groups, lone 6-digit numbers.
    // A lone number is kept only as the fraction of a decimal (1.123456); stack positions are kept
    // by the frame rewrite in scrubStack, not here.
    (text) => text.replace(/\d{24,}/g, REDACTED),
    (text) => text.replace(/(^|\D)(\d{6}(?:[\s.,;:|/"'[\]\\-]{1,6}\d{6})+)(?!\d)/g, `$1${REDACTED}`),
    (text) => text.replace(/(^|[^\d.]|\D\.)\d{6}(?!\d)/g, `$1${REDACTED}`),
    // mnemonics, in any case and with any common separator
    (text) => text.replace(/[a-z]+(?:[\s,._"'[\]\\-]{1,6}[a-z]+)*/gi, redactMnemonicRun),
    // base64 key material (pure base58 runs are left to the next rule)
    (text) =>
        text.replace(/[A-Za-z0-9+/]{40,}={0,2}/g, (token) =>
            !BASE58_ONLY.test(token) && looksRandom(token) ? REDACTED : token,
        ),
    // XRPL base58: seeds, keys (and other random base58). Addresses are public: kept.
    (text) =>
        text.replace(/[1-9A-HJ-NP-Za-km-z]{25,}/g, (token) => {
            const kind = xrplBase58Kind(token);
            if (kind === 'address') {
                return token;
            }
            if (kind === 'other' || looksRandom(token)) {
                return REDACTED;
            }
            return token;
        }),
];

const truncate = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
};

/**
 * Scrub free text. Non-strings are converted with String() first.
 */
export const scrubText = (input: unknown, maxLength = 1000): string => {
    let text: string;
    try {
        text = typeof input === 'string' ? input : String(input);
    } catch {
        text = '[unprintable]';
    }
    text = text.slice(0, MAX_INPUT);
    for (const rule of RULES) {
        text = rule(text);
    }
    return truncate(text, maxLength);
};

// Scrub a function or file name inside a frame line (never truncated: the line must stay a frame).
const scrubFrameText = (text: string): string => scrubText(text, 1000);

/**
 * Scrub a JS stack: the message part fully, frame lines with their names and files scrubbed and
 * their line and column numbers kept (symbolication needs them). Any other line is scrubbed as text.
 */
export const scrubStack = (stack: unknown, maxFrames = 50): string => {
    if (typeof stack !== 'string' || !stack) {
        return '';
    }
    const lines = stack.slice(0, MAX_INPUT).split('\n');
    let firstFrame = lines.findIndex(isFrameLine);
    if (firstFrame === -1) {
        firstFrame = lines.length;
    }
    const out = [scrubText(lines.slice(0, firstFrame).join('\n'), 2000)];
    lines.slice(firstFrame, firstFrame + maxFrames).forEach((line) => {
        out.push(rewriteFrameLine(line, scrubFrameText) ?? scrubText(line, 300));
    });
    return out.join('\n');
};

/**
 * Scrub analytics event params (Crashlytics shows recent Analytics events as breadcrumbs).
 * A param named like a secret (token, passphrase, pin…) is redacted whatever its value.
 */
export const scrubParams = (
    params?: Record<string, unknown>,
): Record<string, string | number | boolean> | undefined => {
    if (!params || typeof params !== 'object') {
        return undefined;
    }
    const out: Record<string, string | number | boolean> = {};
    Object.keys(params).forEach((key) => {
        const value = params[key];
        if ((typeof value === 'string' || typeof value === 'number') && isSensitiveKey(key)) {
            out[key] = REDACTED;
        } else if (typeof value === 'string') {
            out[key] = scrubText(value, 100);
        } else if (typeof value === 'number') {
            out[key] = scrubText(String(value), 100) === String(value) ? value : REDACTED;
        } else if (typeof value === 'boolean') {
            out[key] = value;
        }
    });
    return out;
};

/**
 * Describe a thrown value that is not an Error, without dumping its content.
 */
export const describeThrown = (value: unknown): string => {
    if (typeof value === 'string') {
        return value;
    }
    if (value === null || value === undefined) {
        return String(value);
    }
    if (typeof value !== 'object') {
        return `${typeof value}: ${String(value)}`;
    }
    const name = (value as any)?.constructor?.name ?? 'Object';
    const parts = [`${name} thrown`];
    ['name', 'code', 'message'].forEach((key) => {
        const field = (value as any)[key];
        if (typeof field === 'string' || typeof field === 'number') {
            parts.push(`${key}: ${String(field)}`);
        }
    });
    if (parts.length === 1) {
        try {
            parts.push(`keys: ${Object.keys(value).slice(0, 10).join(',')}`);
        } catch {
            // ignore
        }
    }
    return parts.join(', ');
};

/* Grouping  ==================================================================== */
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/**
 * Stable issue name: the same bug gets the same name in every build and on every device
 * (no offsets, ids or numbers). Input must already be scrubbed.
 */
export const groupingName = ({
    context,
    errorName,
    message,
    frames,
}: {
    context?: string;
    errorName?: string;
    message: string;
    frames: StackFrame[];
}): string => {
    const firstLine = (message.split('\n')[0] || '').trim();
    const normalized = firstLine
        .replace(UUID, '<uuid>')
        .replace(/\d+(?:\.\d+)?/g, '<n>')
        .replace(/(["'`])[^"'`]{24,}\1/g, '$1…$1')
        .replace(/\s+/g, ' ')
        .slice(0, 120);
    const name = typeof errorName === 'string' && errorName ? errorName.slice(0, 40) : 'Error';
    const where = firstMeaningfulFunction(frames);
    const prefix = context ? `${context.slice(0, 60)}: ` : '';
    return truncate(`${prefix}${name}: ${normalized}${where ? ` @ ${where}` : ''}`, 200);
};

export { parseFrames };
