import { binary, derive, sign, XrplDefinitions } from 'xrpl-accountlib';
import { verify } from 'ripple-keypairs';
import NetworkService from '@services/NetworkService';
import FlagParser from '@common/libs/ledger/parser/common/flag';
import { LedgerEntryTypes, TransactionTypes } from '@common/libs/ledger/types/enums';
import { TransactionFactory } from '@common/libs/ledger/factory';
import { createNetworkDefinitions, normalizeDefinitions } from '../normalizeDefinitions';
import liveXrpl from './fixtures/definitions/live-xrpl.json';
import liveXahau from './fixtures/definitions/live-xahau.json';
import packageXrpl from './fixtures/definitions/package-xrpl.json';
import packageXahau from './fixtures/definitions/package-xahau.json';

jest.mock('@services/NetworkService', () => ({
    __esModule: true,
    default: {
        getNetworkDefinitions: jest.fn(),
        getNetworkId: () => 21337,
        getNetwork: () => ({ id: 'definitions-test' }),
        getNativeAsset: () => 'XAH',
    },
}));

const signer = derive.passphrase('Xaman definitions format regression, no funds');
const other = 'rQQQrUdN1cLdNmxH4dHfKgmX5P4kf3ZrM';
const common = { Account: signer.address, Sequence: 1, Fee: '12', SigningPubKey: '' };

describe('network definition formats', () => {
    it.each([
        ['package XRPL', packageXrpl, 'XRP'], ['live XRPL', liveXrpl, 'XRP'],
        ['package Xahau', packageXahau, 'XAH'], ['live Xahau', liveXahau, 'XAH'],
    ])('preserves metadata, inputs and signed bytes for %s', (_name, source, asset) => {
        const before = JSON.stringify(source);
        const raw = normalizeDefinitions(source);
        const defs = createNetworkDefinitions(source);
        expect(JSON.stringify(source)).toBe(before);
        expect(raw.TRANSACTION_TYPES).toEqual(((source as any).result || source).TRANSACTION_TYPES);
        expect(defs.transactionNames).toContain('SignIn');
        expect(defs.getNativeAsset()).toBe(asset);
        const json = { ...common, TransactionType: 'Payment', Destination: other, Amount: '1' };
        const original = new XrplDefinitions(((source as any).result || source) as any);
        expect(binary.encode(json, defs)).toBe(binary.encode(json, original));
        const signed = sign(json, signer, defs);
        const decoded = binary.decode(signed.signedTransaction, defs);
        expect(binary.encode(decoded, defs)).toBe(signed.signedTransaction);
        expect(verify(binary.encodeForSigning(decoded, defs), decoded.TxnSignature, decoded.SigningPubKey)).toBe(true);
        const reported = (source as any).result || source;
        for (const key of ['HOOK', 'features', 'TRANSACTION_FORMATS', 'LEDGER_ENTRY_FORMATS',
            'LEDGER_ENTRY_FLAGS', 'TRANSACTION_MUTABLE_FLAGS']) {
            expect(defs.rawDefinitions[key]).toEqual(reported[key]);
        }
    });

    it('uses XRPL AccountSet and universal flags without importing old mutable flags', () => {
        const raw = normalizeDefinitions(liveXrpl);
        expect(raw.TRANSACTION_FLAGS_INDICES!.AccountSet).toEqual(raw.ACCOUNT_SET_FLAGS);
        expect(raw.TRANSACTION_FLAGS!.Universal).toEqual(raw.TRANSACTION_FLAGS!.universal);
        expect(raw.TRANSACTION_FLAGS!.Universal.tfFullyCanonicalSig).toBe(2147483648);
        expect(raw.TRANSACTION_MUTABLE_FLAGS).toBeUndefined();
        expect(raw.FIELDS.some(([name]) => name === 'ImmutableFlags')).toBe(true);
        expect(raw.FIELDS.some(([name]) => name === 'MutableFlags')).toBe(false);
    });

    it('uses the selected ledger flag numbers, including a cache without a package update', () => {
        for (const [source, index] of [[liveXrpl, 16], [liveXahau, 17]] as const) {
            (NetworkService.getNetworkDefinitions as jest.Mock).mockReturnValue(createNetworkDefinitions(source));
            expect(new FlagParser(TransactionTypes.AccountSet).setIndices('asfAllowTrustLineClawback')).toBe(index);
        }
        const current = normalizeDefinitions(liveXrpl);
        current.TRANSACTION_FLAGS_INDICES = { AccountSet: { asfAllowTrustLineClawback: 99 } };
        expect(normalizeDefinitions(current).TRANSACTION_FLAGS_INDICES!.AccountSet.asfAllowTrustLineClawback).toBe(16);
    });

    it('does not import bundled flags when the selected schema has no flag metadata', () => {
        const raw = normalizeDefinitions(liveXrpl);
        delete raw.ACCOUNT_SET_FLAGS;
        delete raw.TRANSACTION_FLAGS_INDICES;
        delete raw.TRANSACTION_FLAGS;
        (NetworkService.getNetworkDefinitions as jest.Mock).mockReturnValue(createNetworkDefinitions(raw));
        expect(() => new FlagParser(TransactionTypes.AccountSet).setIndices('asfAllowTrustLineClawback')).toThrow();
        expect(() => new FlagParser(TransactionTypes.Payment).set({ tfPartialPayment: true })).toThrow();
    });

    it('uses ledger entry flags from the selected schema', () => {
        const raw = normalizeDefinitions(liveXrpl);
        raw.LEDGER_ENTRY_FLAGS.AccountRoot = { lsfFutureFlag: 0x80000000 };
        (NetworkService.getNetworkDefinitions as jest.Mock).mockReturnValue(createNetworkDefinitions(raw));
        expect(new FlagParser(LedgerEntryTypes.AccountRoot, 0x80000000).get()).toEqual({ lsfFutureFlag: true });
    });

    it('uses the configured native asset only when the node omits it', () => {
        expect(createNetworkDefinitions(liveXrpl, 'XRP').getNativeAsset()).toBe('XRP');
        expect(createNetworkDefinitions(liveXahau, 'XRP').getNativeAsset()).toBe('XAH');
        const raw = normalizeDefinitions(liveXahau);
        delete raw.native_currency_code;
        expect(createNetworkDefinitions(raw, 'XAH').getNativeAsset()).toBe('XAH');
    });

    it('keeps new metadata and fields without adding them to the package snapshot', () => {
        const raw = normalizeDefinitions(liveXrpl);
        raw.FutureMetadata = { version: 2 };
        raw.TRANSACTION_TYPES.FutureTransaction = 4094;
        raw.FIELDS.push(['FutureField', {
            nth: 240, type: 'Blob', isSerialized: true, isSigningField: true, isVLEncoded: true,
        }]);
        const defs = createNetworkDefinitions(raw);
        expect(defs.rawDefinitions.FutureMetadata).toEqual({ version: 2 });
        expect(binary.decode(binary.encode({ TransactionType: 'FutureTransaction', FutureField: 'CAFE' }, defs), defs))
            .toEqual({ TransactionType: 'FutureTransaction', FutureField: 'CAFE' });
        expect(binary.DEFAULT_DEFINITIONS.TRANSACTION_TYPES).not.toHaveProperty('FutureTransaction');
    });

    it('retains ClaimCurrency from live Xahau definitions through model review and signing (#94)', () => {
        const defs = createNetworkDefinitions(liveXahau);
        (NetworkService.getNetworkDefinitions as jest.Mock).mockReturnValue(defs);
        const ClaimCurrency = { currency: '5841484D00000000000000000000000000000000', issuer: other };
        const tx = TransactionFactory.fromJson({ ...common, NetworkID: 21337,
            TransactionType: 'ClaimReward', Issuer: other, ClaimCurrency } as any);
        expect(tx.JsonForSigning.ClaimCurrency).toEqual(ClaimCurrency);
        expect(() => tx.assertSigningFields()).not.toThrow();
        const signed = sign(tx.JsonForSigning, signer, defs);
        expect(binary.decode(signed.signedTransaction, defs).ClaimCurrency).toEqual(ClaimCurrency);
    });

    it.each(['NFTokenModify', 62])('retains live DelegateSet permission %s through signing (#294)', (value) => {
        const defs = createNetworkDefinitions(liveXrpl);
        const signed = sign({ ...common, TransactionType: 'DelegateSet', Authorize: other,
            Permissions: [{ Permission: { PermissionValue: value } }] }, signer, defs);
        expect(binary.decode(signed.signedTransaction, defs).Permissions[0].Permission.PermissionValue)
            .toBe('NFTokenModify');
    });

    it.each([null, {}, { result: { error: 'failed' } }, { ...liveXrpl.result, TYPES: [] },
        { ...liveXrpl.result, ACCOUNT_SET_FLAGS: { invalid: -1 } },
        { ...liveXrpl.result, TRANSACTION_FLAGS: { Payment: null } },
        { ...liveXrpl.result, FIELDS: [['Bad', { type: 'Missing' }]] }])(
        'refuses an invalid schema %p', (raw) => {
            expect(() => createNetworkDefinitions(raw)).toThrow();
        },
    );
});
