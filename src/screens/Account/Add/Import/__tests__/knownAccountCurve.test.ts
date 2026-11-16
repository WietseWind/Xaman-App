/**
 * Import flow: the secret entry steps take the curve of an account the app already knows
 * (the account being upgraded, or a read-only account), without asking the ledger.
 */
import LedgerService from '@services/LedgerService';

import { Prompt } from '@common/helpers/interface';

import EnterMnemonicStep from '../Steps/EnterMnemonic/EnterMnemonicStep';
import EnterSeedStep from '../Steps/EnterSeed/EnterSeedStep';
import { pickKnownCandidate } from '../importIntent';

jest.mock('@common/helpers/navigator', () => ({ Navigator: {} }));
jest.mock('@common/helpers/interface', () => ({ Prompt: jest.fn() }));
jest.mock('@components/General', () => ({}));
jest.mock('@components/General/SensitiveAccessibilityView', () => ({}));
jest.mock('@store/repositories', () => ({ CoreRepository: {} }));
jest.mock('@services/LedgerService', () => ({ getAccountInfo: jest.fn() }));
jest.mock('@services/NetworkService', () => ({ prepareForAccountLookup: jest.fn() }));
jest.mock('../Steps/EnterMnemonic/styles', () => ({}));
jest.mock('../Steps/EnterSeed/styles', () => ({}));

const MNEMONIC = [
    'lamp elevator orchard music glare night upper race mixture bullet property nasty',
    'agent sword blind dynamic gossip life series shrug day ice control reunion',
].join(' ');
const MNEMONIC_SECP = 'r9w2RvKA6rYyBsN3WWFBuEKB7XM83jVqbU';
const MNEMONIC_ED = 'r4wtygUBUyzLiibEwwKsA1YA9CKoWjUujS';

const SEED = 'snYHBZDJ51PPSuzWYVhEh1kb9zvEU';
const SEED_SECP = 'rJ9uJ32u3Y46RenZrfvdYWjVf5ReKwf5Wr';
const SEED_ED = 'raKHBXGhVR5nXKtSCeyGqBjswbboUa17tC';

const OTHER_ADDRESS = 'rrrrrrrrrrrrrrrrrrrrBZbvji';

type Known = { upgrade?: string; readonly?: string[] };

// the import view's context, with the real decision rules
const contextFor = ({ upgrade, readonly = [] }: Known = {}) => ({
    goNext: jest.fn(),
    setImportedAccount: jest.fn((_account: unknown, callback?: () => void) => callback?.()),
    pickKnownAccount: jest.fn((candidates: any[], curvePickedByHand?: boolean) =>
        pickKnownCandidate({
            candidates,
            upgradeAddress: upgrade,
            isReadonlyInApp: (address) => readonly.includes(address),
            curvePickedByHand,
        }),
    ),
});

const withDirectState = <T extends { state: any }>(step: T): T => {
    (step as any).setState = (patch: Record<string, unknown>, callback?: () => void) => {
        step.state = { ...step.state, ...patch };
        callback?.();
    };
    return step;
};

const importedAddress = (context: ReturnType<typeof contextFor>) =>
    (context.setImportedAccount.mock.calls[0]?.[0] as { address?: string })?.address;

describe('[Import] curve of an account the app already knows', () => {
    beforeEach(() => {
        // the ledger knows neither address: the usual pick falls back to secp256k1
        jest.mocked(LedgerService.getAccountInfo).mockResolvedValue({ error: 'actNotFound' } as any);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('mnemonic', () => {
        const run = async (known: Known, curveByHand?: 'secp256k1' | 'ed25519') => {
            const step = withDirectState(new EnterMnemonicStep({} as any));
            const context = contextFor(known);
            step.context = context as any;

            await step.deriveAndContinue(MNEMONIC.split(' '), {}, curveByHand);

            return context;
        };

        it('upgrade: takes ed25519 when the account is the ed25519 address', async () => {
            const context = await run({ upgrade: MNEMONIC_ED });

            expect(importedAddress(context)).toBe(MNEMONIC_ED);
            expect(context.goNext).toHaveBeenCalledWith('ConfirmPublicKey');
            expect(LedgerService.getAccountInfo).not.toHaveBeenCalled();
        });

        it('upgrade: takes secp256k1 when the account is the secp256k1 address', async () => {
            const context = await run({ upgrade: MNEMONIC_SECP });

            expect(importedAddress(context)).toBe(MNEMONIC_SECP);
            expect(LedgerService.getAccountInfo).not.toHaveBeenCalled();
        });

        it('upgrade: takes the matching curve over a curve picked by hand', async () => {
            expect(importedAddress(await run({ upgrade: MNEMONIC_ED }, 'secp256k1'))).toBe(MNEMONIC_ED);
            expect(importedAddress(await run({ upgrade: MNEMONIC_SECP }, 'ed25519'))).toBe(MNEMONIC_SECP);
        });

        it('upgrade: takes another read-only account the secret belongs to', async () => {
            const context = await run({ upgrade: OTHER_ADDRESS, readonly: [OTHER_ADDRESS, MNEMONIC_ED] });

            expect(importedAddress(context)).toBe(MNEMONIC_ED);
            expect(LedgerService.getAccountInfo).not.toHaveBeenCalled();
        });

        it('upgrade: falls back to the usual pick when the secret gives no known account', async () => {
            const context = await run({ upgrade: OTHER_ADDRESS, readonly: [OTHER_ADDRESS] });

            expect(LedgerService.getAccountInfo).toHaveBeenCalledTimes(2);
            expect(importedAddress(context)).toBe(MNEMONIC_SECP);
        });

        it('import: takes the curve that gives a read-only account in the app', async () => {
            const context = await run({ readonly: [MNEMONIC_ED] });

            expect(importedAddress(context)).toBe(MNEMONIC_ED);
            expect(LedgerService.getAccountInfo).not.toHaveBeenCalled();
        });

        it('import: keeps a curve picked by hand', async () => {
            expect(importedAddress(await run({ readonly: [MNEMONIC_ED] }, 'secp256k1'))).toBe(MNEMONIC_SECP);
        });

        it('import: is as before when the app knows neither address', async () => {
            const context = await run({});

            expect(LedgerService.getAccountInfo).toHaveBeenCalledTimes(2);
            expect(importedAddress(context)).toBe(MNEMONIC_SECP);

            expect(importedAddress(await run({}, 'ed25519'))).toBe(MNEMONIC_ED);
        });

        it('import: still follows the ledger when only the ed25519 account is activated', async () => {
            jest.mocked(LedgerService.getAccountInfo).mockImplementation((async (address: string) =>
                address === MNEMONIC_ED ? { account_data: { Account: address } } : { error: 'actNotFound' }) as any);

            expect(importedAddress(await run({}))).toBe(MNEMONIC_ED);
        });
    });

    describe('family seed', () => {
        const make = (known: Known) => {
            const step = withDirectState(new EnterSeedStep({} as any));
            const context = contextFor(known);
            step.context = context as any;
            step.state = { ...step.state, secret: SEED };

            return { step, context };
        };

        const run = async (known: Known, curveByHand?: 'secp256k1' | 'ed25519') => {
            const { step, context } = make(known);

            if (curveByHand) {
                (step as any).userSelectedCurve = true;
                step.state = { ...step.state, secretType: curveByHand };
            }

            await step.driveFamilySeed();

            return context;
        };

        it('upgrade: takes ed25519 when the account is the ed25519 address', async () => {
            const context = await run({ upgrade: SEED_ED });

            expect(importedAddress(context)).toBe(SEED_ED);
            expect(context.goNext).toHaveBeenCalledWith('ConfirmPublicKey');
            expect(LedgerService.getAccountInfo).not.toHaveBeenCalled();
        });

        it('upgrade: takes secp256k1 when the account is the secp256k1 address', async () => {
            const context = await run({ upgrade: SEED_SECP });

            expect(importedAddress(context)).toBe(SEED_SECP);
            expect(LedgerService.getAccountInfo).not.toHaveBeenCalled();
        });

        it('upgrade: takes the matching curve over a curve picked by hand', async () => {
            expect(importedAddress(await run({ upgrade: SEED_ED }, 'secp256k1'))).toBe(SEED_ED);
        });

        it('upgrade: takes another read-only account the secret belongs to', async () => {
            const context = await run({ upgrade: OTHER_ADDRESS, readonly: [OTHER_ADDRESS, SEED_ED] });

            expect(importedAddress(context)).toBe(SEED_ED);
            expect(LedgerService.getAccountInfo).not.toHaveBeenCalled();
        });

        it('upgrade: falls back to the usual pick when the secret gives no known account', async () => {
            const context = await run({ upgrade: OTHER_ADDRESS, readonly: [OTHER_ADDRESS] });

            expect(LedgerService.getAccountInfo).toHaveBeenCalled();
            expect(importedAddress(context)).toBe(SEED_SECP);
        });

        it('import: takes the curve that gives a read-only account in the app', async () => {
            const context = await run({ readonly: [SEED_ED] });

            expect(importedAddress(context)).toBe(SEED_ED);
            expect(LedgerService.getAccountInfo).not.toHaveBeenCalled();
        });

        it('import: keeps a curve picked by hand', async () => {
            expect(importedAddress(await run({ readonly: [SEED_ED] }, 'secp256k1'))).toBe(SEED_SECP);
        });

        it('import: is as before when the app knows neither address', async () => {
            const context = await run({});

            expect(LedgerService.getAccountInfo).toHaveBeenCalled();
            expect(importedAddress(context)).toBe(SEED_SECP);
        });

        it('while typing: shows the known curve without a lookup or a prompt', async () => {
            const { step } = make({ readonly: [SEED_ED] });

            const curve = await step.runCurveAutodetect(0, SEED);

            expect(curve).toBe('ed25519');
            expect(step.state.secretType).toBe('ed25519');
            expect(LedgerService.getAccountInfo).not.toHaveBeenCalled();
            expect(Prompt).not.toHaveBeenCalled();
        });

        it('while typing: still asks the ledger when the app knows neither address', async () => {
            const { step } = make({});

            const curve = await step.runCurveAutodetect(0, SEED);

            expect(curve).toBe('secp256k1');
            expect(LedgerService.getAccountInfo).toHaveBeenCalled();
        });
    });
});
