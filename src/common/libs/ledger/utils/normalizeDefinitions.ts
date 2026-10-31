import { cloneDeep, isPlainObject } from 'lodash';
import { DefinitionsData, XrplDefinitions } from 'xrpl-accountlib';

// Increase this when cached definitions need a full server reply after a parser change.
export const DEFINITION_CACHE_VERSION = 1;

export type NetworkDefinitionsData = DefinitionsData & Record<string, any>;
export type NetworkDefinitions = XrplDefinitions & { rawDefinitions: NetworkDefinitionsData };

/** Accept package JSON and RPC replies, retaining metadata added by either ledger. */
export function normalizeDefinitions(input: unknown, nativeAsset = 'XRP'): NetworkDefinitionsData {
    if (!isPlainObject(input) || (input as any).error || (input as any).status === 'error') {
        throw new Error('Invalid server definitions response');
    }
    const source = (Array.isArray((input as any).FIELDS) ? input : (input as any).result) as Record<string, any>;
    if (!isPlainObject(source) || source.error || (source.status && source.status !== 'success')) {
        throw new Error('Invalid server definitions response');
    }
    const data = cloneDeep(source) as NetworkDefinitionsData;
    for (const key of ['TYPES', 'TRANSACTION_TYPES', 'TRANSACTION_RESULTS', 'LEDGER_ENTRY_TYPES']) {
        if (!isPlainObject(data[key]) || !Object.keys(data[key]).length ||
            Object.values(data[key]).some((value) => !Number.isInteger(value))) {
            throw new Error(`Invalid server definitions ${key}`);
        }
    }
    if (!Array.isArray(data.FIELDS) || !data.FIELDS.length) throw new Error('Invalid server definitions FIELDS');
    for (const entry of data.FIELDS) {
        const [name, field] = entry as [string, any];
        if (!Array.isArray(entry) || entry.length !== 2 || typeof name !== 'string' || !name ||
            !isPlainObject(field) || !Number.isInteger(field.nth) ||
            !Object.prototype.hasOwnProperty.call(data.TYPES, field.type) ||
            ['isSerialized', 'isSigningField', 'isVLEncoded'].some((key) => typeof field[key] !== 'boolean')) {
            throw new Error(`Invalid server definitions field ${name}`);
        }
    }
    for (const key of ['ACCOUNT_SET_FLAGS', 'TRANSACTION_FLAGS', 'TRANSACTION_FLAGS_INDICES',
        'TRANSACTION_MUTABLE_FLAGS', 'TRANSACTION_FORMATS', 'LEDGER_ENTRY_FORMATS', 'LEDGER_ENTRY_FLAGS']) {
        if (data[key] !== undefined && !isPlainObject(data[key])) {
            throw new Error(`Invalid server definitions ${key}`);
        }
    }
    const validateFlags = (flags: Record<string, any>) => {
        if (Object.values(flags).some((value) => !Number.isInteger(value) || value < 0 || value > 0xFFFFFFFF)) {
            throw new Error('Invalid server definitions flags');
        }
    };
    if (data.ACCOUNT_SET_FLAGS) validateFlags(data.ACCOUNT_SET_FLAGS);
    for (const key of ['TRANSACTION_FLAGS', 'TRANSACTION_FLAGS_INDICES',
        'TRANSACTION_MUTABLE_FLAGS', 'LEDGER_ENTRY_FLAGS']) {
        for (const flags of Object.values(data[key] || {})) {
            if (!isPlainObject(flags)) throw new Error(`Invalid server definitions ${key}`);
            validateFlags(flags as Record<string, any>);
        }
    }
    // The current node's AccountSet values take priority. XRPL and Xahau assign different values.
    const accountFlags = data.ACCOUNT_SET_FLAGS || data.TRANSACTION_FLAGS_INDICES?.AccountSet;
    if (accountFlags) {
        data.ACCOUNT_SET_FLAGS = { ...accountFlags };
        data.TRANSACTION_FLAGS_INDICES = { ...data.TRANSACTION_FLAGS_INDICES, AccountSet: { ...accountFlags } };
    }
    if (data.TRANSACTION_FLAGS?.universal) {
        data.TRANSACTION_FLAGS.Universal = data.TRANSACTION_FLAGS.universal;
    }
    if (data.native_currency_code !== undefined &&
        (typeof data.native_currency_code !== 'string' || !data.native_currency_code.trim())) {
        throw new Error('Invalid server definitions native_currency_code');
    }
    data.native_currency_code = data.native_currency_code || nativeAsset;
    // Transport fields belong to the response, not the stored schema. Keep all other metadata.
    for (const key of ['id', '__replyMs', '__command', '__networkId', 'inLedger']) delete data[key];
    return data;
}

export function createNetworkDefinitions(input: unknown, nativeAsset = 'XRP'): NetworkDefinitions {
    const data = normalizeDefinitions(input, nativeAsset);
    data.TRANSACTION_TYPES.SignIn = 999;
    return Object.assign(new XrplDefinitions(data), { rawDefinitions: data });
}
