import BaseGenuineTransaction from '@common/libs/ledger/transactions/genuine/base';

import { AccountID, Hash256, UInt16 } from '@common/libs/ledger/parser/fields';

/* Types ==================================================================== */
import { TransactionJson, TransactionMetadata } from '@common/libs/ledger/types/transaction';
import { TransactionTypes } from '@common/libs/ledger/types/enums';
import { FieldConfig, FieldReturnType } from '@common/libs/ledger/parser/fields/types';

/* Class ==================================================================== */
class LedgerStateFix extends BaseGenuineTransaction {
    public static Type = TransactionTypes.LedgerStateFix as const;
    public readonly Type = LedgerStateFix.Type;

    public static Fields: { [key: string]: FieldConfig } = {
        LedgerFixType: { required: true, type: UInt16 },
        Owner: { type: AccountID },
        BookDirectory: { type: Hash256 },
    };

    declare LedgerFixType: FieldReturnType<typeof UInt16>;
    declare Owner: FieldReturnType<typeof AccountID>;
    declare BookDirectory: FieldReturnType<typeof Hash256>;

    constructor(tx?: TransactionJson, meta?: TransactionMetadata) {
        super(tx, meta);

        // set transaction type
        this.TransactionType = LedgerStateFix.Type;
    }
}

/* Export ==================================================================== */
export default LedgerStateFix;
