import fs from 'fs';
import path from 'path';
import { I18n } from 'i18n-js';

type Messages = { [key: string]: string | Messages };

const localeDirectory = path.resolve(__dirname, '..');
const translationsDirectory = path.join(localeDirectory, 'translations');

// Parse the complete file to catch invalid JSON; exclude Moment from message checks.
// Its library-specific date/time definitions are outside this audit.
const readMessages = (file: string): Messages => JSON.parse(fs.readFileSync(file, 'utf8'));

const flatten = (messages: Messages, prefix = ''): Record<string, string> =>
    Object.entries(messages).reduce<Record<string, string>>((result, [key, value]) => {
        if (!prefix && key === 'moment') return result;
        const scope = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'string') result[scope] = value;
        else Object.assign(result, flatten(value, scope));
        return result;
    }, {});

const variables = (message: string): string[] =>
    [...new Set(Array.from(message.matchAll(/%\{([^}]+)\}/g), (m) => m[1]))].sort();

const integrityIssues = (english: Messages, translated: Messages): string[] => {
    const reference = flatten(english);
    const actual = flatten(translated);
    const issues: string[] = [];
    Object.entries(reference).forEach(([key, message]) => {
        if (!actual[key]?.trim()) {
            issues.push(`${key}: missing or empty`);
        } else if (JSON.stringify(variables(message)) !== JSON.stringify(variables(actual[key]))) {
            issues.push(
                `${key}: expected ${variables(message).join(', ')}; received ${variables(actual[key]).join(', ')}`,
            );
        }
        const withoutVariables = actual[key]?.replace(/%\{\w+\}/g, '') ?? '';
        if (/[{}]/.test(withoutVariables) && !/[{}]/.test(message.replace(/%\{\w+\}/g, ''))) {
            issues.push(`${key}: malformed interpolation fragment`);
        }
    });
    Object.keys(actual).forEach((key) => {
        if (!(key in reference)) issues.push(`${key}: unexpected key`);
    });
    return issues;
};

describe('translation integrity guard', () => {
    it('checks full paths, empty text, case-sensitive variables and unexpected variables', () => {
        expect(
            integrityIssues(
                { account: { label: 'Label', amount: '%{amount} %{nativeAsset}' }, send: { label: 'Send' } },
                { account: { label: '', amount: '%{amount} %{nativeasset} %{network}' }, label: 'Send' },
            ),
        ).toEqual([
            'account.label: missing or empty',
            'account.amount: expected amount, nativeAsset; received amount, nativeasset, network',
            'send.label: missing or empty',
            'label: unexpected key',
        ]);
    });

    it('allows reordered and repeated variables for natural translated sentences', () => {
        expect(
            integrityIssues({ text: '%{amount} %{nativeAsset}' }, { text: '%{nativeAsset}: %{amount} %{nativeAsset}' }),
        ).toEqual([]);
    });

    it('rejects damaged variables embedded inside words even if a valid copy is also present', () => {
        expect(integrityIssues({ text: '%{nativeAsset}' }, { text: '{nativ %{nativeAsset} eAsset}' })).toEqual([
            'text: malformed interpolation fragment',
        ]);
    });
});

const english = readMessages(path.join(localeDirectory, 'en.json'));
const reference = flatten(english);
const localeFiles = fs
    .readdirSync(translationsDirectory)
    .filter((file) => file.endsWith('.json'))
    .sort();

describe.each(localeFiles)('%s', (file) => {
    const locale = file.slice(0, -5);
    const messages = readMessages(path.join(translationsDirectory, file));

    it('has every English message and exactly the supported replacement variables', () => {
        expect(integrityIssues(english, messages)).toEqual([]);
    });

    if (locale !== 'en-AU') {
        it('localizes the scam and dangerous-delegation confirmation warnings', () => {
            const translated = flatten(messages);
            const criticalWarnings = [
                'payload.scamAcceptConfirm',
                'payload.scamPreferCancel',
                'payload.scamDoNotAccept',
                'delegation.acceptConfirm',
            ];
            expect(criticalWarnings.filter((key) => translated[key] === reference[key])).toEqual([]);
        });
    }

    it.each([
        ['XRP', 1],
        ['XAH', 2],
    ])('renders every message through i18n-js with %s and quantity %s, without fallback', (nativeAsset, quantity) => {
        const i18n = new I18n({ [locale]: messages }, { locale, enableFallback: false });
        const issues: string[] = [];
        Object.entries(reference).forEach(([key, message]) => {
            const options = Object.fromEntries(variables(message).map((variable) => [variable, `TEST_${variable}_42`]));
            options.nativeAsset = String(nativeAsset);
            ['count', 'txCount', 'signCount', 'signers', 'txs', 'ticketCount', 'signersCount'].forEach((variable) => {
                if (variable in options) options[variable] = String(quantity);
            });
            const rendered = i18n.t(key, options);
            if (/\[missing|%\{/i.test(rendered)) issues.push(`${key}: ${rendered}`);
            variables(message).forEach((variable) => {
                if (!rendered.includes(options[variable])) issues.push(`${key}: lost ${variable}`);
            });
        });
        expect(issues).toEqual([]);
    });
});
