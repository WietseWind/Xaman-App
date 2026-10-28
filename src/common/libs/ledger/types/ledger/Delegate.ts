import { Permission } from '../common';

import { BaseLedgerEntry, HasPreviousTxnID } from './BaseLedgerEntry';

/**
 * Permissions granted by Account to Authorize. DelegateSet replaces or removes this exact relationship.
 *
 * @category Ledger Entries
 */
export default interface Delegate extends BaseLedgerEntry, HasPreviousTxnID {
    Account: string;
    /**
     * Account that is authorized
     */
    Authorize: string;
    /**
     * Ledger entry flags.
     */
    Flags: number;
    /**
     * A hint indicating which page of the owner directory links to this object,
     * in case the directory consists of multiple pages.
     */
    OwnerNode: string;
    DestinationNode?: string;
    /**
     * Permissions granted to Authorize by Account.
     */
    Permissions: { Permission: Permission }[];
}
