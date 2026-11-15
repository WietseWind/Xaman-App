import { AccessLevels, AccountTypes } from '@store/types';

import { canUpgradeExisting, pickKnownCandidate } from '../importIntent';

const SECP = { address: 'rSecp', curve: 'secp256k1' };
const ED = { address: 'rEd', curve: 'ed25519' };

const readonlyIn =
    (...addresses: string[]) =>
    (address: string) =>
        addresses.includes(address);

describe('pickKnownCandidate', () => {
    describe('an upgrade', () => {
        it('takes the curve that gives the account being upgraded', () => {
            const none = readonlyIn();

            expect(pickKnownCandidate({ candidates: [SECP, ED], upgradeAddress: 'rEd', isReadonlyInApp: none })).toBe(
                ED,
            );
            expect(pickKnownCandidate({ candidates: [SECP, ED], upgradeAddress: 'rSecp', isReadonlyInApp: none })).toBe(
                SECP,
            );
        });

        it('takes it over a curve picked by hand', () => {
            expect(
                pickKnownCandidate({
                    candidates: [SECP, ED],
                    upgradeAddress: 'rEd',
                    isReadonlyInApp: readonlyIn(),
                    curvePickedByHand: true,
                }),
            ).toBe(ED);
        });

        it('takes it over another read-only account on the other curve', () => {
            expect(
                pickKnownCandidate({
                    candidates: [SECP, ED],
                    upgradeAddress: 'rEd',
                    isReadonlyInApp: readonlyIn('rSecp', 'rEd'),
                }),
            ).toBe(ED);
        });

        it('takes another read-only account when the secret does not give the account being upgraded', () => {
            expect(
                pickKnownCandidate({
                    candidates: [SECP, ED],
                    upgradeAddress: 'rOther',
                    isReadonlyInApp: readonlyIn('rOther', 'rEd'),
                }),
            ).toBe(ED);
        });

        it('cannot tell when the secret gives no account the app knows', () => {
            expect(
                pickKnownCandidate({
                    candidates: [SECP, ED],
                    upgradeAddress: 'rOther',
                    isReadonlyInApp: readonlyIn('rOther'),
                }),
            ).toBeUndefined();
        });
    });

    describe('an import', () => {
        it('takes the curve that gives a read-only account in the app', () => {
            expect(pickKnownCandidate({ candidates: [SECP, ED], isReadonlyInApp: readonlyIn('rEd') })).toBe(ED);
            expect(pickKnownCandidate({ candidates: [SECP, ED], isReadonlyInApp: readonlyIn('rSecp') })).toBe(SECP);
        });

        it('keeps a curve picked by hand', () => {
            expect(
                pickKnownCandidate({
                    candidates: [SECP, ED],
                    isReadonlyInApp: readonlyIn('rEd'),
                    curvePickedByHand: true,
                }),
            ).toBeUndefined();
        });

        it('cannot tell when both curves give a read-only account', () => {
            expect(
                pickKnownCandidate({ candidates: [SECP, ED], isReadonlyInApp: readonlyIn('rSecp', 'rEd') }),
            ).toBeUndefined();
        });

        it('cannot tell when the app knows neither', () => {
            expect(pickKnownCandidate({ candidates: [SECP, ED], isReadonlyInApp: readonlyIn() })).toBeUndefined();
        });
    });

    it('skips candidates without an address and does not look them up', () => {
        const isReadonlyInApp = jest.fn(() => true);

        expect(
            pickKnownCandidate({ candidates: [undefined, { address: null }, { address: '' }, ED], isReadonlyInApp }),
        ).toBe(ED);
        expect(isReadonlyInApp).toHaveBeenCalledTimes(1);
        expect(isReadonlyInApp).toHaveBeenCalledWith('rEd');

        expect(pickKnownCandidate({ candidates: [], upgradeAddress: 'rEd', isReadonlyInApp })).toBeUndefined();
    });
});

describe('canUpgradeExisting', () => {
    const withSecret = { accessLevel: AccessLevels.Full, type: AccountTypes.Regular };

    it('is true for a read-only account and an import with a secret', () => {
        expect(canUpgradeExisting({ accessLevel: AccessLevels.Readonly }, withSecret)).toBe(true);
    });

    it('is false for an account that already has full access', () => {
        expect(canUpgradeExisting({ accessLevel: AccessLevels.Full }, withSecret)).toBe(false);
    });

    it('is false for a read-only import and for a Tangem card', () => {
        const readonly = { accessLevel: AccessLevels.Readonly };

        expect(canUpgradeExisting(readonly, { accessLevel: AccessLevels.Readonly, type: AccountTypes.Regular })).toBe(
            false,
        );
        expect(canUpgradeExisting(readonly, { accessLevel: AccessLevels.Full, type: AccountTypes.Tangem })).toBe(false);
    });

    it('is false without an account', () => {
        expect(canUpgradeExisting(undefined, withSecret)).toBe(false);
        expect(canUpgradeExisting(null, withSecret)).toBe(false);
    });
});
