/* eslint-disable max-len */

/**
 * JsonForSigning keeps only the common fields and the fields of the transaction model: a field the ledger
 * knows but the model does not was removed silently, so the signed transaction was not the reviewed one
 * (e.g. Xahau ClaimReward ClaimCurrency, OfferCreate OfferSequence). These fields are in the models now.
 */

import NetworkService from '@services/NetworkService';
import { binary, XrplDefinitions } from 'xrpl-accountlib';

import { TransactionFactory } from '@common/libs/ledger/factory';

import {
    ClaimReward,
    OfferCreate,
    Invoke,
    MPTokenIssuanceCreate,
    MPTokenIssuanceSet,
    VaultCreate,
    VaultDelete,
    VaultWithdraw,
    LoanBrokerCoverWithdraw,
    Payment,
    Batch,
    AMMClawback,
    LedgerStateFix,
} from '..';

jest.mock('@services/NetworkService');

const Account = 'rE6wHjDtqWbpvcyZDjhxVrt6ykg4LSwXWz';
const Other = 'rJ8e4mfYAu8ZcAcr4gMFxPRhZuawjAGzBi';
const Hash = 'A'.repeat(64);

const cases: [string, any, Record<string, any>, any][] = [
    [
        'ClaimReward',
        ClaimReward,
        { ClaimCurrency: { currency: '5841484D00000000000000000000000000000000', issuer: Other } },
        { Issuer: Other },
    ],
    [
        'OfferCreate',
        OfferCreate,
        { OfferSequence: 42 },
        { TakerGets: '1000000', TakerPays: { currency: 'USD', issuer: Other, value: '1' } },
    ],
    ['Invoke', Invoke, { DestinationTag: 123 }, { Destination: Other }],
    [
        'MPTokenIssuanceCreate',
        MPTokenIssuanceCreate,
        { DomainID: Hash, ImmutableFlags: 2 },
        { AssetScale: 2 },
    ],
    [
        'MPTokenIssuanceSet',
        MPTokenIssuanceSet,
        {
            DomainID: Hash,
            MPTokenMetadata: 'ABCD',
            ImmutableFlags: 4,
            IssuerEncryptionKey: 'BEEF',
            AuditorEncryptionKey: 'CAFE',
        },
        { MPTokenIssuanceID: '0'.repeat(48) },
    ],
    [
        'VaultCreate',
        VaultCreate,
        { VaultKind: 1, SubscriptionDate: 800000000, RedemptionDate: 900000000 },
        { Asset: { currency: 'XRP' } },
    ],
    ['VaultDelete', VaultDelete, { MemoData: 'ABCD' }, { VaultID: Hash }],
    ['VaultWithdraw', VaultWithdraw, { CredentialIDs: [Hash] }, { VaultID: Hash, Amount: '1000000' }],
    [
        'LoanBrokerCoverWithdraw',
        LoanBrokerCoverWithdraw,
        { CredentialIDs: [Hash] },
        { LoanBrokerID: Hash, Amount: '1000000', Destination: Other },
    ],
    [
        'AMMClawback',
        AMMClawback,
        { Amount: { currency: 'USD', issuer: Account, value: '1' } },
        { Holder: Other, Asset: { currency: 'USD', issuer: Account }, Asset2: { currency: 'XRP' } },
    ],
    ['LedgerStateFix', LedgerStateFix, { Owner: Other }, { LedgerFixType: 1 }],
];

describe('JsonForSigning keeps the ledger fields of the models', () => {
    for (const [type, Model, fields, base] of cases) {
        it(`${type}: keeps ${Object.keys(fields).join(', ')}`, () => {
            const tx = { TransactionType: type, Account, Fee: '12', Sequence: 1, ...base, ...fields };
            const instance = new Model(tx);
            const signing = instance.JsonForSigning;
            for (const [key, value] of Object.entries(fields)) {
                expect(signing[key]).toEqual(value);
            }
        });

        it(`${type}: adds nothing when the fields are not set`, () => {
            const tx = { TransactionType: type, Account, Fee: '12', Sequence: 1, ...base };
            const signing = new Model(tx).JsonForSigning;
            for (const key of Object.keys(fields)) {
                expect(Object.keys(signing)).not.toContain(key);
            }
            expect(signing).toEqual(tx);
        });

        it(`${type}: still removes unknown fields`, () => {
            const tx = { TransactionType: type, Account, Fee: '12', Sequence: 1, ...base, NotALedgerField: 'x' };
            expect(Object.keys(new Model(tx).JsonForSigning)).not.toContain('NotALedgerField');
        });
    }

    it('OfferCreate: OfferSequence reads like before (number, undefined when not set)', () => {
        const base = { TransactionType: 'OfferCreate', Account, TakerGets: '1', TakerPays: '2' };
        expect(new OfferCreate({ ...base, OfferSequence: 42 } as any).OfferSequence).toBe(42);
        expect(new OfferCreate(base as any).OfferSequence).toBeUndefined();
        expect(new OfferCreate({ ...base, Sequence: 5 } as any).OfferSequence).toBeUndefined();
    });
});

describe('Network fields beyond model coverage', () => {
    const payment = { TransactionType: 'Payment', Account, Destination: Other, Amount: '1', Fee: '12', Sequence: 1 };
    beforeEach(() => jest.spyOn(NetworkService, 'getNetworkDefinitions').mockReturnValue(
        new XrplDefinitions(binary.DEFAULT_DEFINITIONS),
    ));
    afterEach(() => jest.restoreAllMocks());

    it('preserves a serialized field missing from a model and exposes its exact ledger value', () => {
        const tx = new Payment({ ...payment, Delegate: Other } as any);
        expect(tx.JsonForSigning.Delegate).toBe(Other);
        expect(tx.ExtraFields).toEqual([{ name: 'Delegate', value: Other }]);
        expect(tx.unsignableFields()).toEqual([]);
    });

    it('keeps existing model coverage out of Extra fields', () => {
        for (const [type, Model, fields, base] of cases) {
            const tx = new Model({ TransactionType: type, Account, Fee: '12', Sequence: 1, ...base, ...fields });
            expect(tx.ExtraFields).toEqual([]);
            expect(tx.unsignableFields()).toEqual([]);
        }
    });

    it('ignores unknown fields and nonserialized metadata in the extra-field review', () => {
        const tx = new Payment({ ...payment, NotALedgerField: 'x', hash: Hash, index: Hash } as any);
        expect(tx.JsonForSigning).not.toHaveProperty('NotALedgerField');
        expect(tx.JsonForSigning).not.toHaveProperty('index');
        expect(tx.ExtraFields).toEqual([]);
    });

    it('preserves Batch inner fields under the same definitions', () => {
        const inner = { ...payment, Delegate: Other, Fee: '0', SigningPubKey: '', Flags: 0x40000000 };
        const tx = new Batch({ TransactionType: 'Batch', Account, Sequence: 1, Fee: '40', Flags: 65536,
            RawTransactions: [{ RawTransaction: inner }] } as any);
        expect(tx.JsonForSigning.RawTransactions?.[0].RawTransaction.Delegate).toBe(Other);
        expect(tx.unsignableFields()).toEqual([]);
        expect(tx.ExtraFields).toEqual([]);
        const reviewed = TransactionFactory.fromJson(inner as any);
        reviewed.inheritSigningContext(tx);
        expect(reviewed.ExtraFields).toEqual([{ name: 'Delegate', value: Other }]);
    });
});
