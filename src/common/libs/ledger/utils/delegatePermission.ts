/**
 * DelegateSet PermissionValue.
 * rippled stores a whole-transaction permission as the transaction type plus one
 * (Permission::txToPermissionType). JSON may send that number or the transaction
 * name. Granular permissions are 65537 and up, and are not transaction types.
 */

/** Highest whole-transaction permission: uint16 max + 1. */
const TX_PERMISSION_MAX = 65536;

/**
 * Transaction types the review screen does not mark as dangerous to delegate.
 * Values are transaction type names, matching the previous numeric whitelist
 * (those numbers are TRANSACTION_TYPES codes, not permission values).
 */
const TRUSTED_DELEGATE_TRANSACTIONS = [
    'AMMClawback',
    'AMMWithdraw',
    'CheckCancel',
    'CheckCash',
    'Clawback',
    'CredentialAccept',
    'CredentialCreate',
    'CredentialDelete',
    'DIDDelete',
    'DIDSet',
    'DepositPreauth',
    'EscrowCancel',
    'EscrowFinish',
    'MPTokenAuthorize',
    'MPTokenIssuanceCreate',
    'MPTokenIssuanceDestroy',
    'MPTokenIssuanceSet',
    'NFTokenAcceptOffer',
    'NFTokenBurn',
    'NFTokenCancelOffer',
    'NFTokenMint',
    'NFTokenModify',
    'OfferCancel',
    'PaymentChannelClaim',
    'PaymentChannelFund',
    'TicketCreate',
];

const GRANULAR_PERMISSIONS: { [key: number]: string } = {
    65537: 'TrustlineAuthorize',
    65538: 'TrustlineFreeze',
    65539: 'TrustlineUnfreeze',
    65540: 'AccountDomainSet',
    65541: 'AccountEmailHashSet',
    65542: 'AccountMessageKeySet',
    65543: 'AccountTransferRateSet',
    65544: 'AccountTickSizeSet',
    65545: 'PaymentMint',
    65546: 'PaymentBurn',
    65547: 'MPTokenIssuanceLock',
    65548: 'MPTokenIssuanceUnlock',
};

const GRANULAR_NAMES = Object.keys(GRANULAR_PERMISSIONS).map((key) => GRANULAR_PERMISSIONS[Number(key)]);

export type DescribedDelegatePermission = {
    label: string;
    dangerous: boolean;
};

const transactionNameForType = (
    transactionTypes: { [key: string]: number } | undefined,
    txType: number,
): string | undefined => {
    if (!transactionTypes) {
        return undefined;
    }

    const names = Object.keys(transactionTypes);
    for (let i = 0; i < names.length; i += 1) {
        if (Number(transactionTypes[names[i]]) === txType) {
            return names[i];
        }
    }

    return undefined;
};

const describeTransactionName = (name: string): DescribedDelegatePermission => {
    return {
        label: name,
        dangerous: TRUSTED_DELEGATE_TRANSACTIONS.indexOf(name) < 0,
    };
};

/**
 * Label for one Permissions entry, and whether the review screen should warn.
 * Unknown values stay as entered and are not warned. A known transaction type
 * warns unless it is on the trusted list.
 */
export const describeDelegatePermission = (
    permissionValue: unknown,
    transactionTypes?: { [key: string]: number },
): DescribedDelegatePermission => {
    if (typeof permissionValue === 'string' && !/^\d+$/.test(permissionValue)) {
        if (GRANULAR_NAMES.indexOf(permissionValue) > -1) {
            return { label: permissionValue, dangerous: false };
        }

        if (transactionTypes && Object.prototype.hasOwnProperty.call(transactionTypes, permissionValue)) {
            return describeTransactionName(permissionValue);
        }

        return { label: permissionValue, dangerous: false };
    }

    const numeric = typeof permissionValue === 'number' ? permissionValue : Number(permissionValue);
    if (!Number.isInteger(numeric)) {
        return { label: String(permissionValue), dangerous: false };
    }

    if (GRANULAR_PERMISSIONS[numeric]) {
        return { label: GRANULAR_PERMISSIONS[numeric], dangerous: false };
    }

    // Whole-transaction permission = transaction type + 1. 0 is not a transaction.
    if (numeric >= 1 && numeric <= TX_PERMISSION_MAX) {
        const name = transactionNameForType(transactionTypes, numeric - 1);
        if (name) {
            return describeTransactionName(name);
        }
    }

    return { label: String(permissionValue), dangerous: false };
};
