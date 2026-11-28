import RNTangemSdk, { OptionsStartSession } from 'tangem-sdk-react-native';

let stopLater: ReturnType<typeof setTimeout> | undefined;

/** Every Tangem card action starts here so attestation stays offline. */
export const startTangemOfflineSession = (
    options: Omit<OptionsStartSession, 'attestationMode'> = {},
): Promise<void> => {
    // a stop that was planned for the session before this one must not end this one
    if (stopLater) {
        clearTimeout(stopLater);
        stopLater = undefined;
    }
    return RNTangemSdk.startSession({
        ...options,
        attestationMode: 'offline',
    });
};

/**
 * Stops the session after a delay (the prompt of the SDK needs a moment to close), unless a new session
 * starts before that. On Android a stop turns the NFC reader off: a stop that arrives late would end the
 * scan of the next try, and that scan would never see a card.
 */
export const stopTangemSessionLater = (delay: number) => {
    if (stopLater) clearTimeout(stopLater);
    stopLater = setTimeout(() => {
        stopLater = undefined;
        RNTangemSdk.stopSession().catch(() => {
            // ignore
        });
    }, delay);
};

/*
 * The right card.
 *
 * The app does not give the card id of the card it expects to the session of the Tangem SDK. With a card
 * id the SDK handles another card itself: it shows "wrong card", keeps the session open and starts the
 * NFC polling again. On some Android phones that polling never finds the next card (issue 564). Without
 * a card id another card ends the session: the app shows its own message, and the next scan is a new
 * session, started by the user with the same button.
 *
 * - sign: the card is known by its wallet key. A card without that wallet answers "wallet not found".
 *   The card id in the answer is checked here.
 * - createWallet and the code changes write to the card, so the check must come before the operation.
 *   The native module does it (`ExpectedCard` in patches/tangem-sdk-react-native): it compares the card
 *   id after the SDK read the card, and ends the session with "wrong card number" before anything is
 *   sent to another card. (iOS resetUserCodes still uses the check of the SDK.)
 */

// TangemSdkError codes, the same on Android and iOS
const WALLET_NOT_FOUND = '30008';
const WRONG_CARD_NUMBER = '50005';

/** The user scanned another card than the one the app asked for. The session is over. */
export class TangemWrongCardError extends Error {
    code = 'WRONG_CARD';

    constructor() {
        super('The scanned Tangem card is not the card the app asked for');
        this.name = 'TangemWrongCardError';
    }
}

export const isTangemWrongCard = (error: unknown): boolean =>
    (error as any)?.name === 'TangemWrongCardError' && (error as any)?.code === 'WRONG_CARD';

export const sameTangemCardId = (one?: string, other?: string): boolean =>
    !!one && !!other && String(one).toUpperCase() === String(other).toUpperCase();

/*
 * Card prompts.
 *
 * A card operation (scan, sign, create a wallet, change a code) shows the NFC prompt of the Tangem
 * SDK until the card answered or the user cancelled. On Android the scan can pause and resume the
 * app. That is not the user leaving Xaman. AuthenticationService asks `tangemCardPromptOpen` and
 * does not run its lock check for such a pause: a lock in the middle of a flow that needs several
 * scans (the back-up card set-up) closed that flow.
 *
 * Every card operation goes through `TangemCard`, so no flow is left out (a test checks that no
 * other file calls these SDK methods).
 */

// the resume of the app can arrive a moment after the SDK gave its answer
const AFTER_PROMPT_MS = 2000;
// a prompt that never answers does not keep the lock away
const LONGEST_PROMPT_MS = 2 * 60 * 1000;

let open: number[] = [];
let lastClosed = 0;

export const tangemCardPromptOpen = (now: number = Date.now()): boolean => {
    open = open.filter((started) => now - started < LONGEST_PROMPT_MS);
    return open.length > 0 || (lastClosed > 0 && now - lastClosed < AFTER_PROMPT_MS);
};

const withPrompt = async <T>(operation: () => Promise<T>): Promise<T> => {
    const started = Date.now();
    open.push(started);
    try {
        return await operation();
    } finally {
        const at = open.indexOf(started);
        if (at !== -1) open.splice(at, 1);
        lastClosed = Date.now();
    }
};

const forExpectedCard = async <T>(operation: () => Promise<T>): Promise<T> => {
    try {
        return await withPrompt(operation);
    } catch (error: any) {
        if ([WALLET_NOT_FOUND, WRONG_CARD_NUMBER].includes(String(error?.code))) {
            throw new TangemWrongCardError();
        }
        throw error;
    }
};

type Sdk = typeof RNTangemSdk;
type SignOptions = Parameters<Sdk['sign']>[0];

/** The card operations of the Tangem SDK. Use these, not `RNTangemSdk`, for anything that shows the NFC prompt. */
export const TangemCard = {
    scanCard: (...args: Parameters<Sdk['scanCard']>) => withPrompt(() => RNTangemSdk.scanCard(...args)),
    /** `cardId` is the card the app expects. The SDK does not get it; the answer is checked against it. */
    sign: async (options: SignOptions) => {
        const { cardId, ...withoutCardId } = options;
        if (!cardId) throw new Error('cardId is required');
        const result = await forExpectedCard(() => RNTangemSdk.sign(withoutCardId as SignOptions));
        if (!sameTangemCardId(result?.cardId, cardId)) throw new TangemWrongCardError();
        return result;
    },
    createWallet: (...args: Parameters<Sdk['createWallet']>) =>
        forExpectedCard(() => RNTangemSdk.createWallet(...args)),
    setAccessCode: (...args: Parameters<Sdk['setAccessCode']>) =>
        forExpectedCard(() => RNTangemSdk.setAccessCode(...args)),
    setPasscode: (...args: Parameters<Sdk['setPasscode']>) =>
        forExpectedCard(() => RNTangemSdk.setPasscode(...args)),
    resetUserCodes: (...args: Parameters<Sdk['resetUserCodes']>) =>
        forExpectedCard(() => RNTangemSdk.resetUserCodes(...args)),
};

/** For tests. */
export const resetTangemCardPrompts = () => {
    open = [];
    lastClosed = 0;
    if (stopLater) clearTimeout(stopLater);
    stopLater = undefined;
};
