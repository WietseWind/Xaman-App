/* eslint-disable max-len */
import { binary, derive, rawSigning, sign, XrplDefinitions } from 'xrpl-accountlib';
import { sign as signBytes, verify } from 'ripple-keypairs';
import NetworkService from '@services/NetworkService';
import { TransactionFactory } from '@common/libs/ledger/factory';
import { Batch, Payment, PaymentChannelAuthorize, SignIn } from '@common/libs/ledger/transactions';
import { definitionJson } from '../definitionFields';
import { Payload } from '@common/libs/payload';

jest.mock('@services/NetworkService');

const HookName = '6177616B656E';
const account = derive.passphrase('Xaman issue 367 offline test, no funds');
const destination = 'rQHGELnuopj4fWjsrbMA53ViqRLt5bS8Hb';
const payment = { TransactionType: 'Payment', Account: account.address, Destination: destination,
    Amount: '500000000', Fee: '9082', Sequence: 1, NetworkID: 21338, SigningPubKey: '', HookName };

const definitions = (hash = 'test-definitions') => new XrplDefinitions({
    ...binary.DEFAULT_DEFINITIONS,
    TRANSACTION_TYPES: { ...binary.DEFAULT_DEFINITIONS.TRANSACTION_TYPES, SignIn: 999, DefinitionOnlyTransaction: 4094 },
    FIELDS: [...binary.DEFAULT_DEFINITIONS.FIELDS,
        ['HookName', { nth: 97, type: 'Blob', isSerialized: true, isSigningField: true, isVLEncoded: true }],
        ['FutureCounter', { nth: 240, type: 'UInt64', isSerialized: true, isSigningField: true, isVLEncoded: false }],
    ], hash,
} as any);

describe('definitions-backed fields', () => {
    beforeEach(() => jest.spyOn(NetworkService, 'getNetworkDefinitions').mockReturnValue(definitions()));
    afterEach(() => jest.restoreAllMocks());

    it('round-trips the exact HookName blob from issue 367 through the Payment model', () => {
        const blob = '120000210000535A2430A0C7F8201B00CE869061400000001DCD650068400000000000237A73007061066177616B656E8114CA55F9027E601EB3A3FFD468748D70A77F662B778314FF5E46A8DA6B7677D6D534D3F5448E08E35E477DF013E01770180154701920A85F8AFB8BCBDCEE7819D42AD57FE75F918742FACC829157997A866D960E96D8E1F1';
        const tx = new Payment(binary.decode(blob, definitions()) as any);
        expect(binary.encode(tx.JsonForSigning, tx.SigningDefinitions)).toBe(blob);
        expect(tx.ExtraFields).toEqual([{ name: 'HookName', value: HookName }]);
        expect(() => tx.assertSigningFields()).not.toThrow();
    });

    it('preserves and reviews HookName while ignoring fields absent from the definitions', () => {
        const tx = new Payment({ ...payment, NotDefined: 'ignore me' } as any);
        expect(tx.JsonForSigning.HookName).toBe(HookName);
        expect(tx.JsonForSigning).not.toHaveProperty('NotDefined');
        expect(tx.ExtraFields).toEqual([{ name: 'HookName', value: HookName }]);
        expect(tx.unsignableFields()).toEqual([]);
    });

    it('covers the extra field in a software signature', () => {
        const tx = new Payment(payment as any);
        const signed = sign(tx.JsonForSigning, account, tx.SigningDefinitions);
        const decoded = binary.decode(signed.signedTransaction, tx.SigningDefinitions);
        expect(decoded.HookName).toBe(HookName);
        expect(verify(binary.encodeForSigning(decoded, tx.SigningDefinitions), decoded.TxnSignature, decoded.SigningPubKey)).toBe(true);
        expect(verify(binary.encodeForSigning({ ...decoded, HookName: '00' }, tx.SigningDefinitions), decoded.TxnSignature, decoded.SigningPubKey)).toBe(false);
    });

    it('covers the same field through raw preparation/completion used by Tangem', () => {
        const tx = new Payment(payment as any);
        const prepared = rawSigning.prepare(tx.JsonForSigning, account.keypair.publicKey, false, tx.SigningDefinitions);
        const der = Buffer.from(signBytes(prepared.message, account.keypair.privateKey), 'hex');
        const rLength = der[3];
        const sLength = der[5 + rLength];
        const signature = [
            der.subarray(4, 4 + rLength).subarray(-32),
            der.subarray(6 + rLength, 6 + rLength + sLength).subarray(-32),
        ].map((part) => part.toString('hex').padStart(64, '0')).join('');
        const signed = rawSigning.complete(prepared, signature, tx.SigningDefinitions);
        const decoded = binary.decode(signed.signedTransaction, tx.SigningDefinitions);
        expect(decoded.HookName).toBe(HookName);
        expect(verify(binary.encodeForSigning(decoded, tx.SigningDefinitions), decoded.TxnSignature, decoded.SigningPubKey)).toBe(true);
    });

    it('preserves the field in multisigning', () => {
        const tx = new Payment(payment as any);
        const signed = sign(tx.JsonForSigning, account.signAs(account.address), tx.SigningDefinitions);
        expect(binary.decode(signed.signedTransaction, tx.SigningDefinitions).HookName).toBe(HookName);
    });

    it('supports a network-defined transaction type through the fallback model', () => {
        const tx = TransactionFactory.fromJson({ ...payment, TransactionType: 'DefinitionOnlyTransaction' } as any);
        expect(tx.ExtraFields).toEqual(expect.arrayContaining([{ name: 'HookName', value: HookName }]));
        expect(tx.unsignableFields()).toEqual([]);
        const signed = sign(tx.JsonForSigning, account, tx.SigningDefinitions);
        expect(binary.decode(signed.signedTransaction, tx.SigningDefinitions)).toMatchObject({
            TransactionType: 'DefinitionOnlyTransaction', HookName,
        });
    });

    it('preserves future fields nested in known containers and ignores unknown nested data', () => {
        const raw = { ...payment, HookParameters: [{ HookParameter: {
            HookParameterName: '54', HookParameterValue: 'ABCD', HookName, NotDefined: 'ignore',
        } }] };
        const tx = new Payment(raw as any);
        expect(tx.JsonForSigning.HookParameters?.[0].HookParameter).not.toHaveProperty('NotDefined');
        expect(tx.ExtraFields).toEqual(expect.arrayContaining([
            { name: 'HookParameters[0].HookParameter.HookName', value: HookName },
        ]));
        expect(raw.HookParameters[0].HookParameter.NotDefined).toBe('ignore');
    });

    it('keeps Amount/Issue internals intact rather than filtering currency and issuer as ledger field names', () => {
        const raw = { ...payment, Amount: { currency: 'USD', issuer: destination, value: '0.000000000000001' } };
        expect(definitionJson(raw, definitions()).Amount).toEqual(raw.Amount);
    });

    it('pins the schema through review and refuses signing after the schema or network changes', () => {
        const tx = new Payment(payment as any);
        expect(tx.ExtraFields).toHaveLength(1);
        (NetworkService.getNetworkDefinitions as jest.Mock).mockReturnValue(definitions('changed'));
        expect(tx.JsonForSigning.HookName).toBe(HookName);
        expect(() => tx.assertSigningContext()).toThrow('Network details changed');
        (NetworkService.getNetworkDefinitions as jest.Mock).mockReturnValue(definitions());
        jest.spyOn(NetworkService, 'getNetworkId').mockReturnValue(9999);
        expect(() => tx.assertSigningContext()).toThrow('Network details changed');
    });

    it('shows extras in SignIn and refuses extras in the fixed Channel/Amount claim format', () => {
        const login = new SignIn({ Account: account.address, HookName } as any);
        expect(login.JsonForSigning.HookName).toBe(HookName);
        expect(login.ExtraFields).toEqual([{ name: 'HookName', value: HookName }]);
        const signed = sign(login.JsonForSigning, account, login.SigningDefinitions);
        expect(binary.decode(signed.signedTransaction, login.SigningDefinitions).HookName).toBe(HookName);
        const claim = new PaymentChannelAuthorize({ Channel: 'AB'.repeat(32), Amount: '1', HookName } as any);
        expect(claim.ExtraFields).toEqual([{ name: 'HookName', value: HookName }]);
        expect(claim.unsignableFields()).toEqual(['HookName']);
    });

    it('does not claim support for a new binary primitive without codec implementation', () => {
        const raw = { ...binary.DEFAULT_DEFINITIONS, TYPES: { ...binary.DEFAULT_DEFINITIONS.TYPES, FutureWireType: 99 },
            FIELDS: [...binary.DEFAULT_DEFINITIONS.FIELDS, ['FutureValue', {
                nth: 1, type: 'FutureWireType', isSerialized: true, isSigningField: true, isVLEncoded: false,
            }]] };
        (NetworkService.getNetworkDefinitions as jest.Mock).mockReturnValue(new XrplDefinitions(raw as any));
        expect(new Payment({ ...payment, FutureValue: 'AB' } as any).unsignableFields()).toEqual(['FutureValue']);
    });

    it('filters and preserves the same fields in Batch inner transactions', () => {
        const inner = { ...payment, Fee: '0', Flags: 0x40000000, NotDefined: 'ignore' };
        const batch = new Batch({ TransactionType: 'Batch', Account: account.address, Sequence: 1, Fee: '40',
            Flags: 65536, RawTransactions: [{ RawTransaction: inner }] } as any);
        const json = batch.JsonForSigning;
        expect(json.RawTransactions?.[0].RawTransaction.HookName).toBe(HookName);
        expect(json.RawTransactions?.[0].RawTransaction).not.toHaveProperty('NotDefined');
        expect(batch.unsignableFields()).toEqual([]);
        expect(batch.ExtraFields).toEqual([]);
        expect(binary.decode(binary.encode(json, batch.SigningDefinitions), batch.SigningDefinitions)
            .RawTransactions[0].RawTransaction.HookName).toBe(HookName);
    });

    it('refuses known nested fields that a fixed composite codec would silently discard', () => {
        const tx = new Payment({ ...payment, Asset: { currency: 'XRP', HookName } } as any);
        expect(() => tx.assertSigningFields()).toThrow();
    });

    it('does not change SignIn into a Payment Channel claim through extra fields', () => {
        const tx = new SignIn({ Account: account.address, Channel: 'AB'.repeat(32), Amount: '1' } as any);
        expect(tx.unsignableFields()).toEqual(['Channel', 'Amount']);
    });

    it('preserves large integer strings without converting them to JavaScript numbers', () => {
        const tx = new Payment({ ...payment, FutureCounter: 'FFFFFFFFFFFFFFFF' } as any);
        expect(tx.ExtraFields).toContainEqual({ name: 'FutureCounter', value: 'FFFFFFFFFFFFFFFF' });
        const signed = sign(tx.JsonForSigning, account, tx.SigningDefinitions);
        expect(binary.decode(signed.signedTransaction, tx.SigningDefinitions).FutureCounter).toBe('FFFFFFFFFFFFFFFF');
    });

    it('shows known field names that are new to a common nested review codec', () => {
        const tx = new Payment({ ...payment, HookParameters: [{ HookParameter: {
            HookParameterName: '54', HookParameterValue: 'ABCD', SourceTag: 9,
        } }] } as any);
        expect(tx.ExtraFields).toContainEqual({ name: 'HookParameters[0].HookParameter.SourceTag', value: 9 });
    });

    it('decodes embedded BatchSigner blobs with network definitions without losing their fields', () => {
        const defs = definitions();
        const blob = binary.encode({ BatchSigners: [{ BatchSigner: {
            Account: account.address, SigningPubKey: account.keypair.publicKey, TxnSignature: '', HookName,
        } }] }, defs);
        const payload = Payload.build({ TransactionType: 'Batch', Account: account.address, Sequence: 1,
            Fee: '40', Flags: 65536, BatchSigners: [blob], RawTransactions: [] } as any);
        const tx = payload.getTransaction();
        expect(tx.JsonForSigning.BatchSigners?.[0].BatchSigner.HookName).toBe(HookName);
        expect(tx.ExtraFields).toContainEqual({ name: 'BatchSigners[0].BatchSigner.HookName', value: HookName });
    });

    it('refuses an undecodable embedded signer instead of deleting BatchSigners', () => {
        const payload = Payload.build({ TransactionType: 'Batch', BatchSigners: ['DEADBEEF'] } as any);
        expect(() => payload.getTransaction()).toThrow('Could not decode BatchSigners');
        expect(payload.payload.request_json.BatchSigners).toEqual(['DEADBEEF']);
    });
});
