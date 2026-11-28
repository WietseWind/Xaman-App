/**
 * A card operation of the Tangem SDK shows the NFC prompt. While it is open (and a moment after),
 * a pause of the app is the scan, not the user leaving: the lock check asks `tangemCardPromptOpen`.
 */
import RNTangemSdk from 'tangem-sdk-react-native';

import {
    TangemCard,
    tangemCardPromptOpen,
    resetTangemCardPrompts,
    startTangemOfflineSession,
    stopTangemSessionLater,
    isTangemWrongCard,
    sameTangemCardId,
} from '../tangemSession';

jest.mock('tangem-sdk-react-native', () => ({
    __esModule: true,
    default: {
        startSession: jest.fn(async () => undefined),
        stopSession: jest.fn(async () => undefined),
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

/*
 * Issue 564. With a card id the SDK handles another card itself: it keeps the session open and starts
 * the NFC polling again, and on some Android phones that never finds the next card. So another card must
 * end the session, and the app must know that it was another card.
 */
describe('a card operation that gets another card than the app asked for', () => {
    const sdkError = (code: string) => Object.assign(new Error(`sdk error ${code}`), { code });
    const signOptions = { cardId: 'CB01', walletPublicKey: 'KEY', hashes: ['AB'] } as any;

    it('sign: the SDK does not get the card id, so it does not wait for one card', async () => {
        const sdk = jest.mocked(RNTangemSdk.sign).mockResolvedValue({ cardId: 'CB01', signatures: ['S'] } as any);
        await expect(TangemCard.sign(signOptions)).resolves.toEqual({ cardId: 'CB01', signatures: ['S'] });
        expect(sdk).toHaveBeenCalledWith({ walletPublicKey: 'KEY', hashes: ['AB'] });
    });

    it('sign: the card id in the answer is compared without regard to case', async () => {
        jest.mocked(RNTangemSdk.sign).mockResolvedValue({ cardId: 'cb01', signatures: ['S'] } as any);
        await expect(TangemCard.sign(signOptions)).resolves.toMatchObject({ signatures: ['S'] });
    });

    it('sign: a card without the wallet ("wallet not found") is the wrong card', async () => {
        jest.mocked(RNTangemSdk.sign).mockRejectedValue(sdkError('30008'));
        const error = await TangemCard.sign(signOptions).catch((e) => e);
        expect(isTangemWrongCard(error)).toBe(true);
    });

    it('sign: an answer of a card with another card id, or without one, is not used', async () => {
        for (const cardId of ['CB02', '', undefined]) {
            jest.mocked(RNTangemSdk.sign).mockResolvedValue({ cardId, signatures: ['S'] } as any);
            const error = await TangemCard.sign(signOptions).catch((e) => e);
            expect(isTangemWrongCard(error)).toBe(true);
        }
    });

    it('sign: without the card id of the expected card nothing is asked of a card', async () => {
        await expect(TangemCard.sign({ ...signOptions, cardId: '' })).rejects.toThrow('cardId is required');
        expect(RNTangemSdk.sign).not.toHaveBeenCalled();
    });

    it.each(['createWallet', 'setAccessCode', 'setPasscode', 'resetUserCodes'] as const)(
        '%s: the card id goes to the native check, and its "wrong card number" is the wrong card',
        async (name) => {
            const sdk = jest.mocked(RNTangemSdk[name] as any).mockRejectedValue(sdkError('50005'));
            const error = await (TangemCard[name] as any)({ cardId: 'CB01' }).catch((e: any) => e);
            expect(sdk).toHaveBeenCalledWith({ cardId: 'CB01' });
            expect(isTangemWrongCard(error)).toBe(true);
        },
    );

    it('every other error of the SDK is passed on as it is, and the prompt is closed', async () => {
        const cancelled = Object.assign(new Error('The user cancelled the operation'), { code: '50002' });
        jest.mocked(RNTangemSdk.sign).mockRejectedValue(cancelled);
        const error = await TangemCard.sign(signOptions).catch((e) => e);
        expect(error).toBe(cancelled);
        expect(isTangemWrongCard(error)).toBe(false);
        await jest.advanceTimersByTimeAsync(2100);
        expect(tangemCardPromptOpen()).toBe(false);
    });

    it('card ids are the same only when both are there', () => {
        expect(sameTangemCardId('CB01', 'cb01')).toBe(true);
        expect(sameTangemCardId('CB01', 'CB02')).toBe(false);
        expect(sameTangemCardId('', '')).toBe(false);
        expect(sameTangemCardId(undefined, 'CB01')).toBe(false);
    });
});

/*
 * On Android a stop of the session turns the NFC reader off. The vault stops the session 10 s after a
 * sign. A new try inside those 10 s (the normal thing after "different card") must not be ended by it.
 */
describe('a planned stop of the session', () => {
    it('stops the session after the delay', async () => {
        stopTangemSessionLater(10000);
        await jest.advanceTimersByTimeAsync(9900);
        expect(RNTangemSdk.stopSession).not.toHaveBeenCalled();
        await jest.advanceTimersByTimeAsync(200);
        expect(RNTangemSdk.stopSession).toHaveBeenCalledTimes(1);
    });

    it('does not stop a session that started after it was planned', async () => {
        stopTangemSessionLater(10000);
        await jest.advanceTimersByTimeAsync(3000);
        await startTangemOfflineSession();
        await jest.advanceTimersByTimeAsync(20000);
        expect(RNTangemSdk.stopSession).not.toHaveBeenCalled();
    });

    it('planned twice: one stop, at the later time', async () => {
        stopTangemSessionLater(10000);
        await jest.advanceTimersByTimeAsync(8000);
        stopTangemSessionLater(10000);
        await jest.advanceTimersByTimeAsync(9000);
        expect(RNTangemSdk.stopSession).not.toHaveBeenCalled();
        await jest.advanceTimersByTimeAsync(1100);
        expect(RNTangemSdk.stopSession).toHaveBeenCalledTimes(1);
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
