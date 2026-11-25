/**
 * Degen mode ("Fast onboarding (risky)") marker on an account record.
 *
 * A degen account is created before its secret numbers are backed up. Until the user backs them up
 * (red banner on Home), the numbers are kept in the vault, encrypted with the passcode
 * (see @common/libs/degenSecrets), and the account record only carries DEGEN_FLAG.
 * Accounts created by older versions kept the numbers in the record itself:
 * {"degenMode":"123456.234567.…"}. They are moved into the vault on startup.
 *
 * DEGEN_FLAG deliberately doesn't match the banner check of older builds (a record starting with
 * {"degenMode":), so an older build that runs after this one shows no banner instead of crashing on
 * numbers it can't read.
 */

export const DEGEN_FLAG = '{"degenVault":true}';

// written once the secret numbers are backed up
export const DEGEN_DONE = '{}';

const DEGEN_PREFIX = '{"degen';

export const degenVaultName = (publicKey: string): string => `${publicKey}_DEGEN`;

export type DegenInfo =
    // numbers in the vault
    | { kind: 'vault' }
    // numbers in the account record (older versions)
    | { kind: 'legacy'; secretNumbers: string }
    // not a degen account, or backed up
    | { kind: 'none' };

export const getDegenInfo = (additionalInfoString?: string): DegenInfo => {
    if (!additionalInfoString?.startsWith(DEGEN_PREFIX)) {
        return { kind: 'none' };
    }

    try {
        const { degenVault, degenMode } = JSON.parse(additionalInfoString);
        if (degenVault === true) {
            return { kind: 'vault' };
        }
        if (typeof degenMode === 'string' && degenMode) {
            return { kind: 'legacy', secretNumbers: degenMode };
        }
    } catch {
        // not a degen marker
    }

    return { kind: 'none' };
};
