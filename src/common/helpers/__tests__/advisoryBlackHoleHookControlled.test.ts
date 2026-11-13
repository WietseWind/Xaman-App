/**
 * A black holed account gets no black hole warning only when it is whitelisted by us, on a Hooks network, black holed
 * through its regular key and has a Hook installed. Every other case, every doubt and every failure keeps the warning.
 */
import fs from 'fs';
import path from 'path';

import Advisory from '../advisory';

import LedgerService from '@services/LedgerService';
import NetworkService from '@services/NetworkService';

jest.mock('@services/LedgerService', () => ({
    __esModule: true,
    default: { getLedgerEntry: jest.fn() },
}));

jest.mock('@services/NetworkService', () => ({
    __esModule: true,
    default: { getNetworkId: jest.fn() },
}));

const ACCOUNT = 'rHookControlledAccountxxxxxxxxxxxx';
const BLACK_HOLE_KEY = 'rrrrrrrrrrrrrrrrrrrrBZbvji';
const HOOK_HASH = '5EDF6439C47C423EAC99C1061EE2A0CE6A24A58C8E8A66E4B3AF91D76772DC77';

const getLedgerEntry = LedgerService.getLedgerEntry as jest.Mock;
const getNetworkId = NetworkService.getNetworkId as jest.Mock;

const whitelisted = { force_whitelist: true };
const accountData = (overrides: Record<string, unknown> = {}) =>
    ({ Account: ACCOUNT, RegularKey: BLACK_HOLE_KEY, ...overrides }) as any;
const flags = (overrides: Record<string, unknown> = {}) => ({ disableMasterKey: true, ...overrides }) as any;
const hookNode = (overrides: Record<string, unknown> = {}) => ({
    node: {
        LedgerEntryType: 'Hook',
        Account: ACCOUNT,
        Hooks: [{ Hook: { HookHash: HOOK_HASH } }],
        ...overrides,
    },
});

const check = (
    advisory: any = whitelisted,
    data: any = accountData(),
    accountFlags: any = flags(),
    address: string = ACCOUNT,
) => Advisory.checkBlackHoleHookControlled(address, advisory, data, accountFlags);

describe('Advisory: black holed account controlled by its Hook', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getNetworkId.mockReturnValue(21337);
        getLedgerEntry.mockResolvedValue(hookNode());
    });

    describe('checkBlackHoleHookControlled', () => {
        it('is true when whitelisted, on a Hooks network, black holed and a Hook is installed', async () => {
            expect(await check()).toBe(true);
            expect(getLedgerEntry).toHaveBeenCalledTimes(1);
            expect(getLedgerEntry).toHaveBeenCalledWith({ hook: { account: ACCOUNT } });
        });

        it('accepts the other black hole regular key and the Hooks test networks', async () => {
            getNetworkId.mockReturnValue(21338);
            expect(await check(whitelisted, accountData({ RegularKey: 'rrrrrrrrrrrrrrrrrrrrrhoLvTp' }))).toBe(true);
            getNetworkId.mockReturnValue(32000);
            expect(await check()).toBe(true);
        });

        it('is false when the backend did not whitelist the account, without a ledger lookup', async () => {
            const notWhitelisted = [
                undefined,
                {},
                { force_whitelist: false },
                { force_whitelist: 1 },
                { force_whitelist: 'true' },
            ];
            for (const advisory of notWhitelisted) {
                // called directly: `undefined` must not fall back to a default argument
                expect(
                    await Advisory.checkBlackHoleHookControlled(ACCOUNT, advisory as any, accountData(), flags()),
                ).toBe(false);
            }
            expect(getLedgerEntry).not.toHaveBeenCalled();
        });

        it('is false outside the Hooks networks, without a ledger lookup', async () => {
            for (const networkId of [0, 1, 2, 1024, 21336, 32001, 1337000, NaN, undefined, null, '21337', 21337.5]) {
                getNetworkId.mockReturnValue(networkId);
                expect(await check()).toBe(false);
            }
            expect(getLedgerEntry).not.toHaveBeenCalled();
        });

        it('is false when the account is not black holed through its regular key', async () => {
            expect(await check(whitelisted, accountData({ RegularKey: undefined }))).toBe(false);
            expect(await check(whitelisted, accountData({ RegularKey: 'rSomeOtherRegularKeyxxxxxxxxxxxxxx' }))).toBe(
                false,
            );
            expect(await check(whitelisted, accountData(), flags({ disableMasterKey: false }))).toBe(false);
            expect(await Advisory.checkBlackHoleHookControlled(ACCOUNT, whitelisted, accountData(), undefined)).toBe(
                false,
            );
            expect(await Advisory.checkBlackHoleHookControlled(ACCOUNT, whitelisted, undefined, flags())).toBe(false);
            expect(await Advisory.checkBlackHoleHookControlled(ACCOUNT, whitelisted, accountData(), {} as any)).toBe(
                false,
            );
            expect(getLedgerEntry).not.toHaveBeenCalled();
        });

        it('is false for the black hole and lost-key addresses themselves', async () => {
            for (const address of [...Advisory.BLACK_HOLE_KEYS, ...Advisory.LOST_KEYS]) {
                expect(await check(whitelisted, accountData({ Account: address }), flags(), address)).toBe(false);
            }
            expect(getLedgerEntry).not.toHaveBeenCalled();
        });

        it('is false when the ledger data is for another account', async () => {
            expect(await check(whitelisted, accountData({ Account: 'rAnotherAccountxxxxxxxxxxxxxxxxxxx' }))).toBe(
                false,
            );
            expect(await check(whitelisted, accountData(), flags(), '')).toBe(false);
            expect(getLedgerEntry).not.toHaveBeenCalled();
        });

        it('is false when no Hook is installed', async () => {
            const noHook = [
                { error: 'entryNotFound' },
                undefined,
                null,
                'nope',
                {},
                { node: undefined },
                hookNode({ Hooks: [] }),
                hookNode({ Hooks: undefined }),
                hookNode({ Hooks: 'x' }),
                // emptied Hook positions
                hookNode({ Hooks: [{ Hook: {} }, { Hook: {} }] }),
                hookNode({ Hooks: [{}, null, { Hook: { HookHash: '' } }, { Hook: { HookHash: 'ABCD' } }] }),
                hookNode({ Hooks: [{ Hook: { HookHash: 123 } }] }),
                // not this account's Hook object
                hookNode({ Account: 'rAnotherAccountxxxxxxxxxxxxxxxxxxx' }),
                hookNode({ LedgerEntryType: 'AccountRoot' }),
            ];
            for (const response of noHook) {
                getLedgerEntry.mockResolvedValueOnce(response);
                expect(await check()).toBe(false);
            }
            expect(getLedgerEntry).toHaveBeenCalledTimes(noHook.length);
        });

        it('is true when one of the Hook positions is filled', async () => {
            getLedgerEntry.mockResolvedValueOnce(
                hookNode({ Hooks: [{ Hook: {} }, { Hook: { HookHash: HOOK_HASH.toLowerCase() } }] }),
            );
            expect(await check()).toBe(true);
        });

        it('is false when the ledger lookup fails', async () => {
            getLedgerEntry.mockRejectedValueOnce(new Error('timeout'));
            expect(await check()).toBe(false);
            getLedgerEntry.mockImplementationOnce(() => {
                throw new Error('not connected');
            });
            expect(await check()).toBe(false);
        });

        it('is false when the network lookup fails', async () => {
            getNetworkId.mockImplementation(() => {
                throw new Error('no network');
            });
            expect(await check()).toBe(false);
            expect(getLedgerEntry).not.toHaveBeenCalled();
        });

        it('is false when the network changed during the lookup', async () => {
            getNetworkId.mockReturnValueOnce(21337).mockReturnValueOnce(21338);
            expect(await check()).toBe(false);
            getNetworkId.mockReset();
            getNetworkId.mockReturnValueOnce(21337).mockReturnValueOnce(0);
            expect(await check()).toBe(false);
        });
    });

    describe('checkHooksNetwork', () => {
        it('covers 21337 up to and including 32000 only', () => {
            expect(Advisory.checkHooksNetwork(21337)).toBe(true);
            expect(Advisory.checkHooksNetwork(21338)).toBe(true);
            expect(Advisory.checkHooksNetwork(32000)).toBe(true);
            expect(Advisory.checkHooksNetwork(21336)).toBe(false);
            expect(Advisory.checkHooksNetwork(32001)).toBe(false);
            expect(Advisory.checkHooksNetwork(0)).toBe(false);
            expect(Advisory.checkHooksNetwork(undefined)).toBe(false);
        });
    });

    describe('checkHardBlackHoleAddress', () => {
        it('is true for the black hole and lost-key addresses only', () => {
            for (const address of [...Advisory.BLACK_HOLE_KEYS, ...Advisory.LOST_KEYS]) {
                expect(Advisory.checkHardBlackHoleAddress(address)).toBe(true);
            }
            expect(Advisory.checkHardBlackHoleAddress(ACCOUNT)).toBe(false);
            expect(Advisory.checkHardBlackHoleAddress('')).toBe(false);
            expect(Advisory.checkHardBlackHoleAddress(undefined)).toBe(false);
        });
    });

    describe('shouldWarnBlackHole', () => {
        it('warns for every black holed account, except a Hook controlled one', () => {
            expect(Advisory.shouldWarnBlackHole({ blackHole: true })).toBe(true);
            expect(Advisory.shouldWarnBlackHole({ blackHole: true, blackHoleHookControlled: false })).toBe(true);
            expect(Advisory.shouldWarnBlackHole({ blackHole: true, blackHoleHookControlled: undefined })).toBe(true);
            expect(Advisory.shouldWarnBlackHole({ blackHole: true, blackHoleHookControlled: 1 as any })).toBe(true);
            expect(Advisory.shouldWarnBlackHole({ blackHole: true, blackHoleHookControlled: true })).toBe(false);
        });

        it('does not warn when the account is not black holed', () => {
            expect(Advisory.shouldWarnBlackHole({ blackHole: false })).toBe(false);
            expect(Advisory.shouldWarnBlackHole({})).toBe(false);
            expect(Advisory.shouldWarnBlackHole(undefined)).toBe(false);
            expect(Advisory.shouldWarnBlackHole({ blackHole: false, blackHoleHookControlled: true })).toBe(false);
        });

        it('is what both warnings use: the sign request review and the send flow', () => {
            const read = (file: string) => fs.readFileSync(path.join(__dirname, '../../../screens', file), 'utf8');
            const review = read('Modal/ReviewTransaction/ReviewTransactionModal.tsx');
            const send = read('Send/Steps/Recipient/RecipientStep.tsx');
            expect(review).toContain('if (Advisory.shouldWarnBlackHole(destinationInfo)) {');
            expect(send).toContain('Advisory.shouldWarnBlackHole(destinationInfo) &&');
            // no black hole decision left that skips the helper
            expect(review).not.toMatch(/destinationInfo\.blackHole\b/);
            expect(send).not.toMatch(/destinationInfo\.blackHole\b/);
        });
    });
});
