import { binary, derive, rawSigning, sign } from 'xrpl-accountlib';
import { sign as signBytes, verify } from 'ripple-keypairs';
import NetworkService from '@services/NetworkService';
import CoreRepository from '@store/repositories/core';
import { Navigator } from '@common/helpers/navigator';
import { TransactionFactory, ExplainerFactory } from '@common/libs/ledger/factory';
import { MixingTypes } from '@common/libs/ledger/mixin/types';
import { InstanceTypes } from '@common/libs/ledger/types/enums';
import * as NativeTransactions from '@common/libs/ledger/transactions/genuine';
import { createNetworkDefinitions, normalizeDefinitions } from '@common/libs/ledger/utils/normalizeDefinitions';
import liveXrpl from '@common/libs/ledger/utils/__tests__/fixtures/definitions/live-xrpl.json';
import liveXahau from '@common/libs/ledger/utils/__tests__/fixtures/definitions/live-xahau.json';
import packageXrpl from '@common/libs/ledger/utils/__tests__/fixtures/definitions/package-xrpl.json';
import packageXahau from '@common/libs/ledger/utils/__tests__/fixtures/definitions/package-xahau.json';
import {
    collectSignRequestCounterparties, resolveScamSignRequest,
} from '@screens/Modal/ReviewTransaction/scamRejectAction';

jest.mock('@services/NetworkService', () => ({
    __esModule: true,
    default: {
        getNetworkDefinitions: jest.fn(),
        getRawNetworkDefinitions: jest.fn(),
        getNativeAsset: jest.fn(),
        getNetworkId: () => 0,
        getNetwork: () => ({ id: 'universal-test' }),
    },
}));
jest.mock('@common/helpers/navigator', () => ({ Navigator: { showOverlay: jest.fn() } }));

const signer = derive.passphrase('Universal transaction regression, offline and unfunded');
const account = { address: signer.address } as any;
const common = { Account: signer.address, Fee: '12', Sequence: 1, SigningPubKey: '' };
const json = { ...common, TransactionType: 'DefinitionOnly', Flags: 0x80000000,
    FutureBox: { FutureLeaf: 'CAFE' }, FutureBoxes: [{ FutureBox: { FutureLeaf: 'BEEF' } }] };

const setup = (source: unknown = liveXrpl) => {
    const raw = normalizeDefinitions(source);
    raw.TRANSACTION_TYPES.DefinitionOnly = 4094;
    for (const [name, type] of [['FutureLeaf', 'Blob'], ['FutureBox', 'STObject'],
        ['FutureBoxes', 'STArray'], ['FutureAccount', 'AccountID']]) {
        raw.FIELDS.push([name, { nth: 240, type, isSerialized: true, isSigningField: true,
            isVLEncoded: type === 'Blob' || type === 'AccountID' }]);
    }
    const defs = createNetworkDefinitions(raw);
    jest.spyOn(NetworkService, 'getNetworkDefinitions').mockReturnValue(defs);
    jest.spyOn(NetworkService, 'getRawNetworkDefinitions').mockReturnValue(raw);
    jest.spyOn(NetworkService, 'getNativeAsset').mockReturnValue(defs.getNativeAsset());
    return { raw, defs };
};

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(CoreRepository, 'isDeveloperModeEnabled').mockReturnValue(false);
});
afterEach(() => jest.restoreAllMocks());

describe('unmapped transaction types from network definitions', () => {
    it.each([
        ['live XRPL', liveXrpl], ['live Xahau', liveXahau],
        ['package XRPL', packageXrpl], ['package Xahau', packageXahau],
    ])('reviews and signs nested fields using %s without developer mode', (_name, source) => {
        const { defs } = setup(source);
        const tx = TransactionFactory.fromJson(json as any);
        expect(tx.InstanceType).toBe(InstanceTypes.FallbackTransaction);
        expect(CoreRepository.isDeveloperModeEnabled()).toBe(false);
        expect(tx.JsonForSigning).toEqual(json);
        expect(() => tx.assertSigningContext()).not.toThrow();
        expect(() => tx.assertSigningFields()).not.toThrow();
        const signed = sign(tx.JsonForSigning, signer, defs);
        const decoded = binary.decode(signed.signedTransaction, defs);
        expect(decoded).toMatchObject({ ...json, SigningPubKey: signer.keypair.publicKey });
        expect(binary.encode(decoded, defs)).toBe(signed.signedTransaction);
        expect(verify(binary.encodeForSigning(decoded, defs), decoded.TxnSignature, decoded.SigningPubKey)).toBe(true);
    });

    it('keeps existing native transaction classes for every registered native type', () => {
        setup();
        const classes = Object.values(NativeTransactions).filter((value: any) =>
            typeof value === 'function' && value.InstanceType === InstanceTypes.GenuineTransaction &&
            typeof value.Type === 'string');
        expect(classes.length).toBeGreaterThan(60);
        for (const Native of classes as any[]) {
            const tx = TransactionFactory.fromJson({ TransactionType: Native.Type } as any);
            expect(tx).toBeInstanceOf(Native);
            expect(tx.InstanceType).toBe(InstanceTypes.GenuineTransaction);
        }
    });

    it('keeps historical raw data and the type label even when the current schema does not know them', () => {
        setup();
        const history = { ...json, hash: 'A'.repeat(64), date: 123, HistoricalField: { value: null } };
        const tx = TransactionFactory.fromLedger({ tx: history, meta: { AffectedNodes: [] } } as any,
            [MixingTypes.Mutation]);
        const info = ExplainerFactory.fromTransaction(tx as any, account);
        expect(tx.JsonRaw).toEqual(history);
        expect(tx.MetaData).toEqual({ AffectedNodes: [] });
        expect(info.getEventsLabel()).toBe('DefinitionOnly');
        expect(info.generateDescription()).toBe('Transaction type: DefinitionOnly');
        expect(tx.JsonForSigning).not.toHaveProperty('HistoricalField');
    });

    it('refuses a type missing from the selected network before opening the vault', async () => {
        setup();
        const tx = TransactionFactory.fromJson({ ...json, TransactionType: 'NotOnThisNetwork' } as any,
            [MixingTypes.Sign]);
        await expect((tx as any).sign(account)).rejects.toThrow('selected network does not support');
        expect(Navigator.showOverlay).not.toHaveBeenCalled();
    });

    it('keeps network/schema change checks for a universal transaction', () => {
        const { raw } = setup();
        const tx = TransactionFactory.fromJson(json as any);
        expect(() => tx.assertSigningContext()).not.toThrow();
        jest.mocked(NetworkService.getNetworkDefinitions)
            .mockReturnValue(createNetworkDefinitions({ ...raw, hash: 'new' }));
        expect(() => tx.assertSigningContext()).toThrow();
    });

    it('refuses an unsupported primitive before opening the vault', async () => {
        const { raw } = setup();
        raw.TYPES.FuturePrimitive = 99;
        raw.FIELDS.push(['UnsupportedValue', { type: 'FuturePrimitive', nth: 1,
            isSerialized: true, isSigningField: true, isVLEncoded: false }]);
        jest.mocked(NetworkService.getNetworkDefinitions).mockReturnValue(createNetworkDefinitions(raw));
        const tx = TransactionFactory.fromJson({ ...json, UnsupportedValue: 'AB' } as any, [MixingTypes.Sign]);
        await expect((tx as any).sign(account)).rejects.toThrow('UnsupportedValue');
        expect(Navigator.showOverlay).not.toHaveBeenCalled();
    });

    it('preserves the same universal transaction in a Batch inner transaction', () => {
        const { defs } = setup();
        const inner = { ...json, Fee: '0', Flags: 0x40000000 };
        const batch = TransactionFactory.fromJson({ ...common, TransactionType: 'Batch', Flags: 65536,
            RawTransactions: [{ RawTransaction: inner }] } as any);
        expect(() => batch.assertSigningFields()).not.toThrow();
        const signed = sign(batch.JsonForSigning, signer, defs);
        const decoded = binary.decode(signed.signedTransaction, defs);
        expect(decoded.RawTransactions[0].RawTransaction).toEqual(inner);
        expect(verify(binary.encodeForSigning(decoded, defs), decoded.TxnSignature, decoded.SigningPubKey)).toBe(true);
    });

    it('preserves nested data in multisigning', () => {
        const { defs } = setup();
        const signed = sign(json, signer.signAs(signer.address), defs);
        const decoded = binary.decode(signed.signedTransaction, defs);
        expect(decoded).toMatchObject({ FutureBox: json.FutureBox, FutureBoxes: json.FutureBoxes });
        const multi = decoded.Signers[0].Signer;
        expect(verify(binary.encodeForMultisigning(decoded, multi.Account, defs), multi.TxnSignature,
            multi.SigningPubKey)).toBe(true);
    });

    it('checks definition-backed counterparties for scams, including unknown Batch inner types', async () => {
        setup();
        const other = 'rQQQrUdN1cLdNmxH4dHfKgmX5P4kf3ZrM';
        const body = { ...json, FutureBox: { FutureAccount: other, FutureLeaf: 'CAFE' } };
        const tx = TransactionFactory.fromJson(body as any);
        expect(collectSignRequestCounterparties(tx, signer.address)).toContain(other);
        const lookup = {
            getLedgerEntry: jest.fn(async () => undefined),
            getNFTDetails: jest.fn(async () => ({})),
            getAccountAdvisory: jest.fn(async (address) => ({ danger: address === other ? 'CONFIRMED' : 'UNKNOWN' })),
            getAccountName: jest.fn(async () => ({})),
        };
        expect((await resolveScamSignRequest(tx, signer.address, false, lookup)).isScam).toBe(true);
        const batch = TransactionFactory.fromJson({ ...common, TransactionType: 'Batch', Flags: 65536,
            RawTransactions: [{ RawTransaction: { ...body, Fee: '0', Flags: 0x40000000 } }] } as any);
        expect((await resolveScamSignRequest(batch, signer.address, false, lookup)).isScam).toBe(true);
    });

    it('preserves the reviewed fields through Tangem raw signing', () => {
        const { defs } = setup();
        const prepared = rawSigning.prepare(json, signer.keypair.publicKey, false, defs);
        const der = Buffer.from(signBytes(prepared.message, signer.keypair.privateKey), 'hex');
        const rLength = der[3];
        const sLength = der[5 + rLength];
        const signature = [der.subarray(4, 4 + rLength), der.subarray(6 + rLength, 6 + rLength + sLength)]
            .map((part) => part.subarray(-32).toString('hex').padStart(64, '0')).join('');
        const signed = rawSigning.complete(prepared, signature, defs);
        const decoded = binary.decode(signed.signedTransaction, defs);
        expect(decoded).toMatchObject({ ...json, SigningPubKey: signer.keypair.publicKey });
        expect(verify(binary.encodeForSigning(decoded, defs), decoded.TxnSignature, decoded.SigningPubKey)).toBe(true);
    });
});
