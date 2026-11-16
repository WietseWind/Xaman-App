/**
 * Import and upgrade: which account does the entered secret belong to?
 *
 * A mnemonic or a family seed gives one address on secp256k1 and another on ed25519. When the app
 * already knows one of them, that is the one that is meant, and no ledger lookup is needed.
 */
import { AccessLevels, AccountTypes } from '@store/types';

type Candidate = { address?: string | null };

/**
 * Pick the candidate the app already knows, in this order:
 * 1. the account that is being upgraded, also over a curve picked by hand: that address is fixed;
 * 2. the only candidate that is in the app as a read-only account, unless the curve was picked by hand.
 * Returns undefined when the app cannot tell: the ledger lookup then decides, as before.
 */
export const pickKnownCandidate = <T extends Candidate>(input: {
    candidates: Array<T | undefined>;
    upgradeAddress?: string | null;
    isReadonlyInApp: (address: string) => boolean;
    curvePickedByHand?: boolean;
}): T | undefined => {
    const candidates = input.candidates.filter((candidate): candidate is T => !!candidate?.address);

    if (input.upgradeAddress) {
        const upgraded = candidates.find((candidate) => candidate.address === input.upgradeAddress);
        if (upgraded) {
            return upgraded;
        }
    }

    if (input.curvePickedByHand) {
        return undefined;
    }

    const readonly = candidates.filter((candidate) => input.isReadonlyInApp(candidate.address as string));

    return readonly.length === 1 ? readonly[0] : undefined;
};

/**
 * An account that is already in the app can be upgraded with the entered secret when it is
 * read-only and the import is one with a secret (not read-only, not a Tangem card).
 */
export const canUpgradeExisting = (
    existing: { accessLevel?: AccessLevels } | undefined | null,
    importing: { accessLevel?: AccessLevels; type?: AccountTypes },
): boolean => {
    if (!existing) {
        return false;
    }

    return (
        existing.accessLevel !== AccessLevels.Full &&
        importing.accessLevel !== AccessLevels.Readonly &&
        importing.type !== AccountTypes.Tangem
    );
};
