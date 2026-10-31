/**
 * Base Ledger transaction
 */

import { TransactionJson, TransactionMetadata } from '@common/libs/ledger/types/transaction';

import { BaseTransaction } from '@common/libs/ledger/transactions/common';
import { TransactionType } from '@common/libs/ledger/parser/fields';

/* Types ==================================================================== */
import { InstanceTypes } from '@common/libs/ledger/types/enums';
import { FieldReturnType } from '@common/libs/ledger/parser/fields/types';

/* Class ==================================================================== */
class BaseGenuineTransaction extends BaseTransaction {
    public static InstanceType = InstanceTypes.GenuineTransaction as const;
    public readonly InstanceType = BaseGenuineTransaction.InstanceType;

    declare TransactionType: FieldReturnType<typeof TransactionType>;

    constructor(tx?: TransactionJson, meta?: TransactionMetadata, txFilter?: Function) {
        super(tx, meta, txFilter);
    }

    /**
     * serialize transaction object to the ledger tx json for signing
     * Model fields and serialized network fields are preserved. Unknown metadata is ignored.
     */
    get JsonForSigning(): TransactionJson {
        const tx = this.definitionJson(this._tx);

        if (this?._txFilter && typeof this._txFilter === 'function') {
            try {
                // This has the ability to modify the cloned tx object
                // E.g. used in NFTokenModify to remove Owner field if it's the same as Account
                this._txFilter(tx);
            } catch (e) {
                // ignore
            }
        }

        return tx;
    }

    get JsonRaw(): TransactionJson {
        // shallow copy and filter the fields
        const tx = { ...this._tx } as TransactionJson;

        return tx;
    }

    get MetaData() {
        return { ...this._meta };
    }
}

/* Export ==================================================================== */
export default BaseGenuineTransaction;
