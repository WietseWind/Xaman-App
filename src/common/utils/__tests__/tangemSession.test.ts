/**
 * A card operation of the Tangem SDK shows the NFC prompt. While it is open (and a moment after),
 * a pause of the app is the scan, not the user leaving: the lock check asks `tangemCardPromptOpen`.
 */
import RNTangemSdk from 'tangem-sdk-react-native';

import { TangemCard, tangemCardPromptOpen, resetTangemCardPrompts } from '../tangemSession';

jest.mock('tangem-sdk-react-native', () => ({
    __esModule: true,
    default: {
        startSession: jest.fn(async () => undefined),
        scanCard: jest.fn(),
        sign: jest.fn(),
        createWallet: jest.fn(),
        setAccessCode: jest.fn(),
        setPasscode: jest.fn(),
        resetUserCodes: jest.fn(),
    },
}));

const realFs = jest.requireActual('fs');
const realPath = jest.requireActual('path');

beforeEach(() => {
    jest.useFakeTimers();
    resetTangemCardPrompts();
});

afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
});

const pendingScan = () => {
    let answer: (card: any) => void = () => undefined;
    let fail: (error: any) => void = () => undefined;
    jest.mocked(RNTangemSdk.scanCard).mockImplementation(
        () =>
            new Promise((resolve, reject) => {
                answer = resolve;
                fail = reject;
            }) as any,
    );
    return { answer: (card: any) => answer(card), fail: (error: any) => fail(error) };
};

describe('a card prompt', () => {
    // the resume of the app can come a moment after the answer of the card
    it('is open from the call until the card answered, and 2 s more', async () => {
        const scan = pendingScan();
        expect(tangemCardPromptOpen()).toBe(false);

        const result = TangemCard.scanCard();
        expect(tangemCardPromptOpen()).toBe(true);
        await jest.advanceTimersByTimeAsync(30000);
        expect(tangemCardPromptOpen()).toBe(true);

        scan.answer({ cardId: 'CB1' });
        await expect(result).resolves.toEqual({ cardId: 'CB1' });
        expect(tangemCardPromptOpen()).toBe(true);
        await jest.advanceTimersByTimeAsync(1900);
        expect(tangemCardPromptOpen()).toBe(true);
        await jest.advanceTimersByTimeAsync(200);
        expect(tangemCardPromptOpen()).toBe(false);
    });

    it('is closed again when the user cancelled or the card failed, and the error is passed on', async () => {
        const scan = pendingScan();
        const result = TangemCard.scanCard();
        scan.fail(new Error('The user cancelled the operation'));
        await expect(result).rejects.toThrow('The user cancelled the operation');
        await jest.advanceTimersByTimeAsync(2100);
        expect(tangemCardPromptOpen()).toBe(false);
    });

    it('that never answers does not keep the lock away for more than 2 minutes', async () => {
        pendingScan();
        TangemCard.scanCard();
        await jest.advanceTimersByTimeAsync(119000);
        expect(tangemCardPromptOpen()).toBe(true);
        await jest.advanceTimersByTimeAsync(2000);
        expect(tangemCardPromptOpen()).toBe(false);
    });

    it('passes the options of every card operation to the SDK', async () => {
        const operations = [
            'scanCard',
            'sign',
            'createWallet',
            'setAccessCode',
            'setPasscode',
            'resetUserCodes',
        ] as const;
        for (const name of operations) {
            const sdk = jest.mocked(RNTangemSdk[name] as any).mockResolvedValue({ done: name } as any);
            const options = { cardId: 'CB1', marker: name } as any;
            await expect((TangemCard[name] as any)(options)).resolves.toEqual({ done: name });
            expect(sdk).toHaveBeenCalledWith(options);
        }
    });
});

describe('every card operation in the app goes through TangemCard', () => {
    // a flow that calls the SDK directly is not known as an open prompt, and would lock in the middle
    const sources = (dir: string): string[] =>
        realFs.readdirSync(dir, { withFileTypes: true }).flatMap((entry: any) => {
            const file = realPath.join(dir, entry.name);
            if (entry.isDirectory()) {
                return ['__tests__', '__mocks__', 'node_modules'].includes(entry.name) ? [] : sources(file);
            }
            return /\.tsx?$/.test(entry.name) ? [file] : [];
        });

    it('no file but tangemSession.ts calls a card operation of the SDK', () => {
        const src = realPath.resolve(__dirname, '../../..');
        const operations = 'scanCard|sign|createWallet|purgeWallet|setAccessCode|setPasscode|resetUserCodes';
        const direct = new RegExp(`RNTangemSdk\\s*\\.\\s*(${operations})\\b`);
        const offenders = sources(src)
            .filter((file) => !file.endsWith(realPath.join('common', 'utils', 'tangemSession.ts')))
            .filter((file) => direct.test(realFs.readFileSync(file, 'utf8')))
            .map((file) => realPath.relative(src, file));
        expect(offenders).toEqual([]);
    });
});
