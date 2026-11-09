/**
 * Guardrail: on Android every accessibility service receives announcements, also apps that are not
 * accessibility tools. So every place that announces something is reviewed and listed here, with what
 * it says. A new place fails this test until someone checks it never says a secret (secret numbers,
 * seeds, mnemonics, passcodes, keys) and adds it below.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../../..');

const REVIEWED_ANNOUNCERS: { [file: string]: string } = {
    'common/helpers/accessibility.ts': 'spells out a public account address on request',
    'common/helpers/interface.ts': 'iOS toast texts (fixed messages and error texts already on screen)',
    'components/General/ScreenReaderAnnouncement/ScreenReaderAnnouncement.tsx': 'the component itself',
    'components/General/SecurePinInput/SecurePinInput.tsx': 'how many digits are entered, never which',
    'screens/Modal/ReviewTransaction/Steps/Result/ResultStep.tsx': 'the transaction outcome title',
    'screens/Modal/ReviewTransaction/Steps/Review/ReviewStep.tsx': 'the scam warning',
    'screens/Modal/Scan/ScanModal.tsx': 'that a QR code was read, never its content',
    'screens/Overlay/Lock/LockOverlay.tsx': 'the wrong-passcode error',
    'screens/Send/Steps/Result/ResultStep.tsx': 'the transaction outcome title',
};

const sourceFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return entry.name === '__tests__' || entry.name === '__mocks__' ? [] : sourceFiles(full);
        }
        return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });

const LOGS_ACCESSIBILITY =
    /(console\.\w+|LoggerService\.\w+|logger\.\w+|crashlytics\(\)\.log|recordError)\([^)]*accessibility/i;

// iOS: these accessibility events exist only on a View. On a Text the native setter is missing, React
// Native drops the whole UI update and the screen stays blank (review screen of build 474).
const VIEW_ONLY_ACCESSIBILITY =
    /\b(onAccessibilityAction|onAccessibilityEscape|onAccessibilityTap|onMagicTap|AddressAccessibilityProps)\b/;

// opening tags of <Text …> and <Animated.Text …>, braces balanced so arrow functions don't end the tag
const textOpeningTags = (source: string): string[] => {
    const tags: string[] = [];
    const start = /<(Animated\.)?Text(?=[\s/>])/g;
    let match = start.exec(source);
    while (match) {
        let depth = 0;
        let end = match.index + match[0].length;
        while (end < source.length && !(source[end] === '>' && depth === 0)) {
            if (source[end] === '{') depth += 1;
            if (source[end] === '}') depth -= 1;
            end += 1;
        }
        tags.push(source.slice(match.index, end + 1));
        match = start.exec(source);
    }
    return tags;
};

describe('accessibility guardrails', () => {
    it('only reviewed places announce to screen readers', () => {
        const announcers = sourceFiles(SRC)
            .filter((file) =>
                /announceForAccessibility|<ScreenReaderAnnouncement\b/.test(fs.readFileSync(file, 'utf8')),
            )
            .map((file) => path.relative(SRC, file).split(path.sep).join('/'))
            .sort();

        expect(announcers).toEqual(Object.keys(REVIEWED_ANNOUNCERS).sort());
    });

    it('never logs what screen readers are told', () => {
        const logsAccessibility = sourceFiles(SRC)
            .filter((file) =>
                LOGS_ACCESSIBILITY.test(fs.readFileSync(file, 'utf8')),
            )
            .map((file) => path.relative(SRC, file));

        expect(logsAccessibility).toEqual([]);
    });

    it('finds a View-only accessibility event on a Text', () => {
        const tags = textOpeningTags(
            '<View><Text style={[a, b]} onPress={() => go()} {...AddressAccessibilityProps(address)}>{x}</Text>' +
                '<TextInput onAccessibilityAction={f} /><Animated.Text onMagicTap={f}>y</Animated.Text></View>',
        );

        expect(tags.filter((tag) => VIEW_ONLY_ACCESSIBILITY.test(tag))).toEqual([
            '<Text style={[a, b]} onPress={() => go()} {...AddressAccessibilityProps(address)}>',
            '<Animated.Text onMagicTap={f}>',
        ]);
    });

    it('never puts a View-only accessibility event on a Text', () => {
        const offenders = sourceFiles(SRC)
            .filter((file) => file.endsWith('.tsx'))
            .flatMap((file) =>
                textOpeningTags(fs.readFileSync(file, 'utf8'))
                    .filter((tag) => VIEW_ONLY_ACCESSIBILITY.test(tag))
                    .map((tag) => `${path.relative(SRC, file)}: ${tag}`),
            );

        expect(offenders).toEqual([]);
    });
});
