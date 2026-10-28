import BaseLedgerObject from '@common/libs/ledger/objects/base';
import NetworkService from '@services/NetworkService';

import { AccountID, Hash256, STArray, UInt32, UInt64 } from '@common/libs/ledger/parser/fields';

/* Types ==================================================================== */
import { Delegate as DelegateLedgerEntry } from '@common/libs/ledger/types/ledger';
import { LedgerEntryTypes } from '@common/libs/ledger/types/enums';
import { FieldReturnType } from '@common/libs/ledger/parser/fields/types';

/* Class ==================================================================== */
class Delegate extends BaseLedgerObject<DelegateLedgerEntry> {
    public static Type = LedgerEntryTypes.Delegate as const;
    public readonly Type = Delegate.Type;
    public readonly PermissionTransactionTypes: Record<string, number>;
    private readonly networkContext: ReturnType<typeof NetworkService.getConnectionDetails>;
    private readonly networkIdentity?: string;

    public static Fields = {
        Account: { type: AccountID },
        Authorize: { type: AccountID },
        Permissions: { type: STArray },

        OwnerNode: { type: UInt64 },
        DestinationNode: { type: UInt64 },
        PreviousTxnID: { type: Hash256 },
        PreviousTxnLgrSeq: { type: UInt32 },
    };

    declare Account: FieldReturnType<typeof AccountID>;
    declare Authorize: FieldReturnType<typeof AccountID>;
    declare Permissions: FieldReturnType<typeof STArray>;

    declare OwnerNode: FieldReturnType<typeof UInt64>;
    declare DestinationNode?: FieldReturnType<typeof UInt64>;
    declare PreviousTxnID: FieldReturnType<typeof Hash256>;
    declare PreviousTxnLgrSeq: FieldReturnType<typeof UInt32>;

    constructor(object: DelegateLedgerEntry) {
        super(object);

        this.PermissionTransactionTypes = { ...NetworkService.getRawNetworkDefinitions()?.TRANSACTION_TYPES };
        this.networkContext = NetworkService.getConnectionDetails();
        this.networkIdentity = NetworkService.getNetwork()?.id?.toString();

        this.LedgerEntryType = LedgerEntryTypes.Delegate;
    }

    get Date(): undefined {
        return undefined;
    }

    isOnCurrentNetwork(): boolean {
        const current = NetworkService.getConnectionDetails();
        return current.networkKey === this.networkContext.networkKey &&
            current.networkId === this.networkContext.networkId && current.type === this.networkContext.type &&
            NetworkService.getNetwork()?.id?.toString() === this.networkIdentity;
    }
}

/* Export ==================================================================== */
export default Delegate;
