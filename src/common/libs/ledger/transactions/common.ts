/**
 * Common base transaction
 */

import { TransactionType, AccountID, Amount, UInt32, Hash256, STArray, Blob } from '@common/libs/ledger/parser/fields';
import { Flags, Signers, Memos, HookParameters } from '@common/libs/ledger/parser/fields/codec';

/* Types ==================================================================== */
import { FieldConfig, FieldReturnType } from '@common/libs/ledger/parser/fields/types';
import { TransactionJson, TransactionMetadata } from '@common/libs/ledger/types/transaction';
import { createPropertyConfig } from '@common/libs/ledger/parser/fields/factory';
import { InstanceTypes } from '@common/libs/ledger/types/enums';
import { binary, XrplDefinitions } from 'xrpl-accountlib';
import NetworkService from '@services/NetworkService';
import Localize from '@locale';
import {
    definitionExtraFields,
    definitionJson,
    ExtraField,
    unsupportedDefinitionFields,
    unserializedDefinitionFields,
} from '@common/libs/ledger/utils/definitionFields';

export abstract class BaseTransaction {
    InstanceType!: InstanceTypes;

    protected _tx!: TransactionJson | Record<string, never>;
    protected _meta!: TransactionMetadata | Record<string, never>;

    public _txFilter?: Function;
    private signingDefinitions?: XrplDefinitions;
    private signingNetworkId?: number;
    private signingNetworkKey?: string;

    get SigningDefinitions(): XrplDefinitions {
        if (!this.signingDefinitions) {
            this.signingDefinitions = NetworkService.getNetworkDefinitions() ||
                new XrplDefinitions(binary.DEFAULT_DEFINITIONS);
            try {
                this.signingNetworkId = NetworkService.getNetworkId();
                this.signingNetworkKey = NetworkService.getNetwork()?.id?.toString();
            } catch {
                // Ledger history can be read before a network is initialized.
                // Actual signing still requires a connected network below.
            }
        }
        return this.signingDefinitions;
    }

    inheritSigningContext(transaction: BaseTransaction): void {
        this.signingDefinitions = transaction.SigningDefinitions;
        this.signingNetworkId = transaction.signingNetworkId;
        this.signingNetworkKey = transaction.signingNetworkKey;
    }

    assertSigningContext(): void {
        const definitions = this.SigningDefinitions;
        const current = NetworkService.getNetworkDefinitions();
        if (this.signingNetworkId !== NetworkService.getNetworkId() ||
            this.signingNetworkKey !== NetworkService.getNetwork()?.id?.toString() ||
            (current && definitions.getHash?.() !== current.getHash?.())) {
            throw new Error(Localize.t('payload.definitionsChanged'));
        }
    }

    protected get DeclaredFields(): string[] {
        const model = this.constructor as typeof BaseTransaction;
        return Object.keys({ ...model.CommonFields, ...model.Fields });
    }

    protected definitionJson(json: Record<string, any>): TransactionJson {
        return definitionJson(json, this.SigningDefinitions, this.DeclaredFields) as TransactionJson;
    }

    get ExtraFields(): ExtraField[] {
        return definitionExtraFields(this.JsonForSigning, this.SigningDefinitions, this.DeclaredFields);
    }

    unsignableFields(): string[] {
        return unsupportedDefinitionFields(this.JsonForSigning, this.SigningDefinitions);
    }

    assertSigningFields(): void {
        const unsupported = this.unsignableFields();
        const fields = unsupported.length ? unsupported
            : unserializedDefinitionFields(this.JsonForSigning, this.SigningDefinitions);
        if (fields.length) throw new Error(`Xaman cannot sign this transaction yet: it carries ${fields.join(', ')}.`);
    }

    public static Fields: { [key: string]: FieldConfig } = {};
    public static CommonFields: { [key: string]: FieldConfig } = {
        hash: { required: true, type: Hash256 },
        TransactionType: { required: true, type: TransactionType },
        Account: { required: true, type: AccountID },
        Sequence: { required: true, type: UInt32 },
        LastLedgerSequence: { required: true, type: UInt32 },

        SourceTag: { type: UInt32 },
        Memos: { type: STArray, codec: Memos },
        Flags: { type: UInt32, codec: Flags },
        Signers: { type: STArray, codec: Signers },
        Fee: { type: Amount },
        TicketSequence: { type: UInt32 },
        NetworkID: { type: UInt32 },
        FirstLedgerSequence: { type: UInt32 },
        OperationLimit: { type: UInt32 },
        SigningPubKey: { type: Blob },
        TxnSignature: { type: Blob },
        HookParameters: { type: STArray, codec: HookParameters },
        AccountTxnID: { type: Hash256 },
        PreviousTxnID: { type: Hash256 },
    };

    protected constructor(tx?: TransactionJson, meta?: TransactionMetadata, txFilter?: Function) {
        this._tx = tx ?? {};
        this._meta = meta ?? {};
        this._txFilter = txFilter;

        const fields = {
            ...(this.constructor as typeof BaseTransaction).Fields,
            ...BaseTransaction.CommonFields,
        };

        for (const property of Object.keys(fields)) {
            // get the property config
            const fieldConfig = createPropertyConfig(property, fields[property], this._tx);
            // define the property
            Object.defineProperty(this, property, fieldConfig);
        }
    }

    declare hash: FieldReturnType<typeof Hash256>;
    declare TransactionType: FieldReturnType<typeof TransactionType>;
    declare Account: FieldReturnType<typeof AccountID>;
    declare Sequence: FieldReturnType<typeof UInt32>;
    declare LastLedgerSequence: FieldReturnType<typeof UInt32>;

    declare SourceTag?: FieldReturnType<typeof UInt32>;
    declare Signers?: FieldReturnType<typeof STArray>;
    declare Memos?: FieldReturnType<typeof STArray, typeof Memos>;
    declare Flags?: FieldReturnType<typeof UInt32, typeof Flags>;
    declare Fee?: FieldReturnType<typeof Amount>;
    declare TicketSequence?: FieldReturnType<typeof UInt32>;
    declare NetworkID?: FieldReturnType<typeof UInt32>;
    declare FirstLedgerSequence?: FieldReturnType<typeof UInt32>;
    declare OperationLimit?: FieldReturnType<typeof UInt32>;
    declare SigningPubKey?: FieldReturnType<typeof Blob>;
    declare TxnSignature?: FieldReturnType<typeof Blob>;
    declare HookParameters?: FieldReturnType<typeof STArray, typeof HookParameters>;
    declare AccountTxnID?: FieldReturnType<typeof Hash256>;
    declare PreviousTxnID?: FieldReturnType<typeof Hash256>;

    get JsonForSigning(): TransactionJson {
        throw new Error('Method JsonForSigning not implemented.');
    }

    get JsonRaw(): TransactionJson {
        throw new Error('Method JsonRaw not implemented.');
    }

    get MetaData(): TransactionMetadata | Record<string, never> {
        throw new Error('Method MetaData not implemented.');
    }
}
