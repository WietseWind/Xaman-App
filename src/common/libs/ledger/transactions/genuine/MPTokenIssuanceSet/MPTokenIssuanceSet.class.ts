import BaseGenuineTransaction from '@common/libs/ledger/transactions/genuine/base';

import { AccountID, Blob, Hash192, Hash256, UInt16, UInt32 } from '@common/libs/ledger/parser/fields';
import { TransferFee } from '@common/libs/ledger/parser/fields/codec';

/* Types ==================================================================== */
import { TransactionJson, TransactionMetadata } from '@common/libs/ledger/types/transaction';
import { TransactionTypes } from '@common/libs/ledger/types/enums';
import { FieldConfig, FieldReturnType } from '@common/libs/ledger/parser/fields/types';

/* Class ==================================================================== */
class MPTokenIssuanceSet extends BaseGenuineTransaction {
    public static Type = TransactionTypes.MPTokenIssuanceSet as const;
    public readonly Type = MPTokenIssuanceSet.Type;

    public static Fields: { [key: string]: FieldConfig } = {
        MPTokenIssuanceID: { required: true, type: Hash192 },
        Holder: { type: AccountID },
        DomainID: { type: Hash256 },
        MPTokenMetadata: { type: Blob },
        TransferFee: { type: UInt16, codec: TransferFee },
        ImmutableFlags: { type: UInt32 },
        IssuerEncryptionKey: { type: Blob },
        AuditorEncryptionKey: { type: Blob },
    };

    declare MPTokenIssuanceID: FieldReturnType<typeof Hash192>;
    declare Holder: FieldReturnType<typeof AccountID>;
    declare DomainID: FieldReturnType<typeof Hash256>;
    declare MPTokenMetadata: FieldReturnType<typeof Blob>;
    declare TransferFee: FieldReturnType<typeof UInt16, typeof TransferFee>;
    declare ImmutableFlags: FieldReturnType<typeof UInt32>;
    declare IssuerEncryptionKey: FieldReturnType<typeof Blob>;
    declare AuditorEncryptionKey: FieldReturnType<typeof Blob>;

    constructor(tx?: TransactionJson, meta?: TransactionMetadata) {
        super(tx, meta);

        // set transaction type
        this.TransactionType = MPTokenIssuanceSet.Type;
    }
}

/* Export ==================================================================== */
export default MPTokenIssuanceSet;
