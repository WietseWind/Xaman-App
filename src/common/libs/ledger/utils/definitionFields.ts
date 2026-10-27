import { binary, XrplDefinitions } from 'xrpl-accountlib';

export interface ExtraField {
    name: string;
    value: unknown;
}

const bundledFields = new Set(binary.DEFAULT_DEFINITIONS.FIELDS.map(([name]) => String(name)));
// These common review codecs render named members rather than an entire object.
const nestedReviewFields: Record<string, string[]> = {
    HookParameters: ['HookParameter'],
    HookParameter: ['HookParameterName', 'HookParameterValue'],
    Memos: ['Memo'],
    Memo: ['MemoType', 'MemoFormat', 'MemoData'],
    Signers: ['Signer'],
    Signer: ['Account', 'SigningPubKey', 'TxnSignature'],
};
const nestedKnown = (parent: string, name: string) =>
    nestedReviewFields[parent]?.includes(name) ?? bundledFields.has(name);
const own = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
const fieldOf = (definitions: XrplDefinitions, name: string) => {
    const fields = definitions?.field as unknown as Record<string, ReturnType<XrplDefinitions['field']['fromString']>>;
    return fields && own(fields, name) ? fields[name] : undefined;
};

/** Keep codec-supported structure intact; currency/issuer/path components are not STObject fields. */
export function definitionJson(
    json: Record<string, any>,
    definitions: XrplDefinitions,
    declared: string[] = [],
): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [name, value] of Object.entries(json)) {
        const field = fieldOf(definitions, name);
        if (value === undefined || (!declared.includes(name) && field?.isSerialized !== true)) continue;
        let filtered = value;
        if (field?.type?.name === 'STObject' && value && typeof value === 'object' && !Array.isArray(value)) {
            filtered = definitionJson(value, definitions);
        } else if (field?.type?.name === 'STArray' && Array.isArray(value)) {
            filtered = value.map((entry) => definitionJson(entry, definitions))
                .filter((entry) => Object.keys(entry).length);
        }
        // Define a data property even for a schema field named __proto__.
        Object.defineProperty(result, name, { value: filtered, enumerable: true, writable: true, configurable: true });
    }
    return result;
}

/** Extra root fields use model coverage; new fields inside known containers use bundled codec coverage. */
export function definitionExtraFields(
    json: Record<string, any>,
    definitions: XrplDefinitions,
    declared: string[],
): ExtraField[] {
    const fields: ExtraField[] = [];
    const visit = (object: Record<string, any>, prefix: string, known: (name: string) => boolean) => {
        for (const [name, value] of Object.entries(object)) {
            const field = fieldOf(definitions, name);
            if (field?.isSerialized !== true || value === undefined) continue;
            const path = `${prefix}${name}`;
            if (!known(name)) {
                fields.push({ name: path, value });
            } else if (name !== 'RawTransactions') {
                // Batch inners have their own model and Extra fields section.
                if (field.type.name === 'STObject' && value && typeof value === 'object') {
                    visit(value, `${path}.`, (key) => nestedKnown(name, key));
                } else if (field.type.name === 'STArray' && Array.isArray(value)) {
                    value.forEach((entry, index) => visit(entry, `${path}[${index}].`, (key) => nestedKnown(name, key)));
                }
            }
        }
    };
    visit(json, '', (name) => declared.includes(name));
    return fields;
}

/** A schema cannot teach the codec a new binary primitive. Refuse it before opening the vault. */
export function unsupportedDefinitionFields(json: Record<string, any>, definitions: XrplDefinitions): string[] {
    const fields: string[] = [];
    const visit = (object: Record<string, any>, prefix: string) => {
        for (const [name, value] of Object.entries(object)) {
            const field = fieldOf(definitions, name);
            if (field?.isSerialized !== true || value === undefined) continue;
            const path = `${prefix}${name}`;
            if (!field.associatedType) fields.push(path);
            else if (field.type.name === 'STObject' && value && typeof value === 'object') visit(value, `${path}.`);
            else if (field.type.name === 'STArray' && Array.isArray(value)) {
                value.forEach((entry, index) => visit(entry, `${path}[${index}].`));
            }
        }
    };
    visit(json, '');
    return fields;
}

/** Validate once after account/sequence preparation, before opening the vault. */
export function unserializedDefinitionFields(json: Record<string, any>, definitions: XrplDefinitions): string[] {
    const fields: string[] = [];
    if (typeof definitions.getAssociatedTypes === 'function') {
        // A known primitive can still have a fixed composite layout. Check that
        // every definition-backed field survives encoding, including nested data.
        const decoded = binary.decode(binary.encode(json, definitions), definitions);
        const findMissing = (before: any, after: any, prefix: string) => {
            if (!before || typeof before !== 'object') return;
            if (Array.isArray(before)) {
                before.forEach((entry, index) => findMissing(entry, after?.[index], `${prefix}[${index}].`));
                return;
            }
            for (const [name, value] of Object.entries(before)) {
                const path = `${prefix}${name}`;
                const field = fieldOf(definitions, name);
                if (field?.isSerialized === true && value !== undefined &&
                    (!after || !own(after, name))) fields.push(path);
                else findMissing(value, after?.[name], Array.isArray(value) ? path : `${path}.`);
            }
        };
        findMissing(json, decoded, '');
    }
    return fields;
}
