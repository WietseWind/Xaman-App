import BaseGenuineTransaction from '@common/libs/ledger/transactions/genuine/base';

import { AccountID, Amount, Issue } from '@common/libs/ledger/parser/fields';

/* Types ==================================================================== */
import { TransactionJson, TransactionMetadata } from '@common/libs/ledger/types/transaction';
import { TransactionTypes } from '@common/libs/ledger/types/enums';
import { FieldConfig, FieldReturnType } from '@common/libs/ledger/parser/fields/types';

/* Class ==================================================================== */
class AMMClawback extends BaseGenuineTransaction {
    public static Type = TransactionTypes.AMMClawback as const;
    public readonly Type = AMMClawback.Type;

    public static Fields: { [key: string]: FieldConfig } = {
        Holder: { required: true, type: AccountID },
        Asset: { required: true, type: Issue },
        Asset2: { required: true, type: Issue },
        Amount: { type: Amount },
    };

    declare Holder: FieldReturnType<typeof AccountID>;
    declare Asset: FieldReturnType<typeof Issue>;
    declare Asset2: FieldReturnType<typeof Issue>;
    declare Amount: FieldReturnType<typeof Amount>;

    constructor(tx?: TransactionJson, meta?: TransactionMetadata) {
        super(tx, meta);

        // set transaction type
        this.TransactionType = AMMClawback.Type;
    }
}

/* Export ==================================================================== */
export default AMMClawback;
