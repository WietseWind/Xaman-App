import BaseGenuineTransaction from '@common/libs/ledger/transactions/genuine/base';

import { AccountID, STArray } from '@common/libs/ledger/parser/fields';
import { PermissionEntries } from '@common/libs/ledger/parser/fields/codec';

/* Types ==================================================================== */
import { describeDelegatePermission } from '@common/libs/ledger/utils/delegatePermission';
import { TransactionJson, TransactionMetadata } from '@common/libs/ledger/types/transaction';
import { TransactionTypes } from '@common/libs/ledger/types/enums';
import { FieldConfig, FieldReturnType } from '@common/libs/ledger/parser/fields/types';
import NetworkService from '@services/NetworkService';

/* Class ==================================================================== */
class DelegateSet extends BaseGenuineTransaction {
    public static Type = TransactionTypes.DelegateSet as const;
    public readonly Type = DelegateSet.Type;

    public readonly ___translatedDelegations: string[];
    public readonly ___dangerPerms: string[] = [];

    public static Fields: { [key: string]: FieldConfig } = {
        Authorize: { type: AccountID },
        Permissions: { type: STArray, codec: PermissionEntries },
    };

    declare Authorize: FieldReturnType<typeof AccountID>;
    declare Permissions: FieldReturnType<typeof STArray, typeof PermissionEntries>;

    constructor(tx?: TransactionJson, meta?: TransactionMetadata) {
        super(tx, meta);

        const transactionTypes = NetworkService.getRawNetworkDefinitions()?.TRANSACTION_TYPES || {};
        this.___translatedDelegations = (this.Permissions || []).map((p) => {
            const described = describeDelegatePermission(p.PermissionValue, transactionTypes);
            if (described.dangerous) {
                this.___dangerPerms.push(described.label);
            }
            return described.label;
        });

        if (!this?.Permissions) {
            this.Permissions = [];
        }

        // set transaction type
        this.TransactionType = DelegateSet.Type;
    }
}

/* Export ==================================================================== */
export default DelegateSet;
