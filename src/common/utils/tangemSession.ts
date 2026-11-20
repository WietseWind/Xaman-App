import RNTangemSdk, { OptionsStartSession } from 'tangem-sdk-react-native';

/** Every Tangem card action starts here so attestation stays offline. */
export const startTangemOfflineSession = (
    options: Omit<OptionsStartSession, 'attestationMode'> = {},
): Promise<void> => {
    return RNTangemSdk.startSession({
        ...options,
        attestationMode: 'offline',
    });
};

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

type Sdk = typeof RNTangemSdk;

/** The card operations of the Tangem SDK. Use these, not `RNTangemSdk`, for anything that shows the NFC prompt. */
export const TangemCard = {
    scanCard: (...args: Parameters<Sdk['scanCard']>) => withPrompt(() => RNTangemSdk.scanCard(...args)),
    sign: (...args: Parameters<Sdk['sign']>) => withPrompt(() => RNTangemSdk.sign(...args)),
    createWallet: (...args: Parameters<Sdk['createWallet']>) => withPrompt(() => RNTangemSdk.createWallet(...args)),
    setAccessCode: (...args: Parameters<Sdk['setAccessCode']>) => withPrompt(() => RNTangemSdk.setAccessCode(...args)),
    setPasscode: (...args: Parameters<Sdk['setPasscode']>) => withPrompt(() => RNTangemSdk.setPasscode(...args)),
    resetUserCodes: (...args: Parameters<Sdk['resetUserCodes']>) =>
        withPrompt(() => RNTangemSdk.resetUserCodes(...args)),
};

/** For tests. */
export const resetTangemCardPrompts = () => {
    open = [];
    lastClosed = 0;
};
