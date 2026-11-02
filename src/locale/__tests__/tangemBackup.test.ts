import fs from 'fs';
import path from 'path';
import { I18n } from 'i18n-js';

const directory = path.resolve(__dirname, '..');
const english = JSON.parse(fs.readFileSync(path.join(directory, 'en.json'), 'utf8')).tangemBackup;
const files = fs.readdirSync(path.join(directory, 'translations')).filter((file) => file.endsWith('.json'));

describe('Tangem back-up wizard translations', () => {
    it.each(files)('%s has complete localized messages and a working step variable', (file) => {
        const translated = JSON.parse(
            fs.readFileSync(path.join(directory, 'translations', file), 'utf8'),
        ).tangemBackup;
        expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());
        for (const key of Object.keys(english)) {
            expect(typeof translated[key]).toBe('string');
            expect(translated[key].trim()).not.toBe('');
            const variables = (value: string) =>
                [...value.matchAll(/%\{\w+\}/g)].map((match) => match[0]).sort();
            expect(variables(translated[key])).toEqual(variables(english[key]));
        }
        const i18n = new I18n({ test: { tangemBackup: translated } });
        i18n.locale = 'test';
        const step = i18n.t('tangemBackup.step', { number: 2 });
        expect(step).toContain('2');
        expect(step).not.toMatch(/%\{|missing/i);
        if (file !== 'en-AU.json') {
            expect(translated.introBody).not.toBe(english.introBody);
            expect(translated.reviewBody).not.toBe(english.reviewBody);
            expect(translated.retired).not.toBe(english.retired);
        }
    });
});
