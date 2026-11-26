/**
 * The accounts that a Tangem card is the back-up card of.
 *
 * A back-up card is the regular key of the account of the original card. So a card is the back-up card of every
 * Tangem account in the app whose regular key is the address of that card. Only accounts that are in the app on
 * this device can be found this way.
 */
type Candidate = { address?: string | null; regularKey?: string | null; type?: string | null };

const TANGEM_TYPE = 'Tangem';

export const accountsBackedUpBy = <T extends Candidate>(
    card: { address?: string | null } | undefined,
    accounts: Iterable<T> | ArrayLike<T> | undefined | null,
): T[] => {
    const address = card?.address;
    if (!address || !accounts) {
        return [];
    }
    return Array.from(accounts).filter(
        (account) =>
            !!account && account.type === TANGEM_TYPE && account.regularKey === address && account.address !== address,
    );
};
