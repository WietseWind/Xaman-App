import BaseGenuineTransaction from '@common/libs/ledger/transactions/genuine/base';

import { Hash256, UInt8, UInt32, Amount, Issue, Blob } from '@common/libs/ledger/parser/fields';
import { RippleTime } from '@common/libs/ledger/parser/fields/codec';

/* Types ==================================================================== */
import { TransactionJson, TransactionMetadata } from '@common/libs/ledger/types/transaction';
import { TransactionTypes } from '@common/libs/ledger/types/enums';
import { FieldConfig, FieldReturnType } from '@common/libs/ledger/parser/fields/types';

/* Class ==================================================================== */
class VaultCreate extends BaseGenuineTransaction {
    public static Type = TransactionTypes.VaultCreate as const;
    public readonly Type = VaultCreate.Type;

    public static Fields: { [key: string]: FieldConfig } = {
        Asset: { required: true, type: Issue },
        Scale: { type: UInt8 },
        AssetsMaximum: { type: Amount },
        DomainID: { type: Hash256 },
        Data: { type: Blob },
        MPTokenMetadata: { type: Blob },
        WithdrawalPolicy: { type: UInt8 },
        VaultKind: { type: UInt8 },
        // Ledger times (closed-ended vaults)
        SubscriptionDate: { type: UInt32, codec: RippleTime },
        RedemptionDate: { type: UInt32, codec: RippleTime },
    };

    declare Asset: FieldReturnType<typeof Issue>;
    declare Scale: FieldReturnType<typeof UInt8>;
    declare AssetsMaximum: FieldReturnType<typeof Amount>;
    declare DomainID: FieldReturnType<typeof Hash256>;
    declare Data: FieldReturnType<typeof Blob>;
    declare MPTokenMetadata: FieldReturnType<typeof Blob>;
    declare WithdrawalPolicy: FieldReturnType<typeof UInt8>;
    declare VaultKind: FieldReturnType<typeof UInt8>;
    declare SubscriptionDate: FieldReturnType<typeof UInt32, typeof RippleTime>;
    declare RedemptionDate: FieldReturnType<typeof UInt32, typeof RippleTime>;

    constructor(tx?: TransactionJson, meta?: TransactionMetadata) {
        super(tx, meta);

        // set transaction type
        this.TransactionType = VaultCreate.Type;
    }

    get isPrivate(): boolean {
        return !!(this.Flags && (typeof this.Flags === 'object' ? this.Flags.tfVaultPrivate : this.Flags & 0x00010000));
    }

    get isShareNonTransferable(): boolean {
        if (!this.Flags) return false;
        const flagValue = typeof this.Flags === 'object'
            ? this.Flags.tfVaultShareNonTransferable
            : this.Flags & 0x00020000;
        return !!flagValue;
    }
}

/* Export ==================================================================== */
export default VaultCreate;
