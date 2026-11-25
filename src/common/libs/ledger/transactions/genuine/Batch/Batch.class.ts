import BaseGenuineTransaction from '@common/libs/ledger/transactions/genuine/base';

import { Hash256, STArray } from '@common/libs/ledger/parser/fields';
import { RawTransactions } from '@common/libs/ledger/parser/fields/codec';

/* Types ==================================================================== */
import { TransactionJson, TransactionMetadata } from '@common/libs/ledger/types/transaction';
import { TransactionTypes } from '@common/libs/ledger/types/enums';
import { FieldConfig, FieldReturnType } from '@common/libs/ledger/parser/fields/types';
import { BatchSigners } from '@common/libs/ledger/parser/fields/codec/BatchSigners';
// import NetworkService from '@services/NetworkService';

/* Class ==================================================================== */
class Batch extends BaseGenuineTransaction {
    public static Type = TransactionTypes.Batch as const;
    public readonly Type = Batch.Type;

    // public readonly ___translatedDelegations: string[];
    // public readonly ___dangerPerms: string[] = [];

    public static Fields: { [key: string]: FieldConfig } = {
        RawTransactions: { type: STArray, codec: RawTransactions },
        TxnIDs: { type: Hash256 },
        BatchSigners: { type: STArray, codec: BatchSigners },
    };

    // declare Authorize: FieldReturnType<typeof AccountID>;
    declare RawTransactions: FieldReturnType<typeof STArray, typeof RawTransactions>;
    declare BatchSigners: FieldReturnType<typeof STArray, typeof BatchSigners>;
    declare DeliverMin: FieldReturnType<typeof Hash256>;

    constructor(tx?: TransactionJson, meta?: TransactionMetadata) {
        super(tx, meta);

        // this.___translatedDelegations = (this.Permissions || []).map((p) => {
        //     const transactionDefinitions = NetworkService.getRawNetworkDefinitions()?.TRANSACTION_TYPES || {};
        //     const matchingTx = Object.keys(transactionDefinitions).filter(
        //         (v) => transactionDefinitions[v] === p.PermissionValue,
        //     )?.[0];

        //     if (matchingTx) {
        //         if (trustedNative.indexOf(Number(p.PermissionValue)) < 0) {
        //             this.___dangerPerms.push(String(matchingTx));

        //             return `${String(matchingTx)} (!)`;
        //         }
        //         return String(matchingTx);
        //     }

        //     if (customPerms?.[Number(p.PermissionValue)]) return customPerms?.[Number(p.PermissionValue)];

        //     return `${String(p.PermissionValue)}`;
        // });

        // if (!this?.Permissions) {
        //     this.Permissions = [];
        // }

        // set transaction type
        this.TransactionType = Batch.Type;
    }

    /**
     * The outer unsignable fields, then each inner transaction's as RawTransactions[i].<field>,
     * since the review shows each inner transaction through its own model.
     */
    unsignableFields(): string[] {
        // loaded at call time: the factory imports this class
        const { TransactionFactory } = require('@common/libs/ledger/factory');
        const inner = (this.RawTransactions || []).flatMap((rawTransaction, index) => {
            const transaction = TransactionFactory.fromJson({ ...rawTransaction });
            transaction.inheritSigningContext(this);
            const fields: string[] =
                typeof transaction.unsignableFields === 'function' ? transaction.unsignableFields() : [];
            return fields.map((field) => `RawTransactions[${index}].${field}`);
        });
        return [...super.unsignableFields().filter((field) => !field.startsWith('RawTransactions[')), ...inner];
    }
}

/* Export ==================================================================== */
export default Batch;
