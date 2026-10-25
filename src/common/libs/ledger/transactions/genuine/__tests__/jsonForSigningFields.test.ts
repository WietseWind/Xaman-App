/* eslint-disable max-len */

/**
 * JsonForSigning keeps only the common fields and the fields of the transaction model: a field the ledger
 * knows but the model does not was removed silently, so the signed transaction was not the reviewed one
 * (e.g. Xahau ClaimReward ClaimCurrency, OfferCreate OfferSequence). These fields are in the models now.
 */

import NetworkService from '@services/NetworkService';
import { binary, XrplDefinitions } from 'xrpl-accountlib';

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

describe('A ledger field the model does not declare is refused by name, never removed', () => {
    const payment = { TransactionType: 'Payment', Account, Destination: Other, Amount: '1', Fee: '12', Sequence: 1 };

    beforeEach(() => {
        jest.spyOn(NetworkService, 'getNetworkDefinitions').mockReturnValue(
            new XrplDefinitions(binary.DEFAULT_DEFINITIONS),
        );
    });
    afterEach(() => jest.restoreAllMocks());

    for (const [type, Model, fields, base] of cases) {
        it(`${type}: names nothing when it carries only the model's fields`, () => {
            const tx = { TransactionType: type, Account, Fee: '12', Sequence: 1, ...base, ...fields };
            expect(new Model(tx).unsignableFields()).toEqual([]);
        });
    }

    it('names a ledger field the model does not declare for the type', () => {
        expect(new Payment({ ...payment, TakerPays: '5' }).unsignableFields()).toEqual(['TakerPays']);
    });

    it('names Delegate, since signing on behalf of another account is not built', () => {
        expect(new Payment({ ...payment, Delegate: Other }).unsignableFields()).toEqual(['Delegate']);
    });

    it('names LoanBrokerCoverWithdraw DestinationTag, which its review cannot show', () => {
        const tx = {
            TransactionType: 'LoanBrokerCoverWithdraw',
            Account,
            Fee: '12',
            Sequence: 1,
            LoanBrokerID: Hash,
            Amount: '1000000',
            Destination: Other,
            DestinationTag: 99,
        };
        expect(new LoanBrokerCoverWithdraw(tx).unsignableFields()).toEqual(['DestinationTag']);
    });

    describe('Batch', () => {
        const inner = { ...payment, Fee: '0', Sequence: 2, SigningPubKey: '', Flags: 0x40000000 };
        const batch = (rawTransactions: Record<string, any>[]) => ({
            TransactionType: 'Batch',
            Account,
            Fee: '40',
            Sequence: 1,
            Flags: 0x00010000,
            RawTransactions: rawTransactions.map((RawTransaction) => ({ RawTransaction })),
        });

        it('names the ledger fields an inner transaction carries that its model does not declare', () => {
            const tx = batch([{ ...inner, Delegate: Other, TakerPays: '5' }]);
            expect(new Batch(tx as any).unsignableFields()).toEqual([
                'RawTransactions[0].Delegate',
                'RawTransactions[0].TakerPays',
            ]);
        });

        it('names the outer fields first, then each inner field by the index of its transaction', () => {
            const tx = { ...batch([inner, { ...inner, Sequence: 3, Delegate: Other }]), Delegate: Other };
            expect(new Batch(tx as any).unsignableFields()).toEqual(['Delegate', 'RawTransactions[1].Delegate']);
        });

        it('names nothing when every inner transaction carries only its model fields', () => {
            const tx = batch([inner, { ...inner, Sequence: 3 }]);
            expect(new Batch(tx as any).unsignableFields()).toEqual([]);
        });
    });

    it('still drops a key that is not a ledger field, and names nothing', () => {
        const tx = { ...payment, NotALedgerField: 'x' };
        expect(Object.keys(new Payment(tx).JsonForSigning)).not.toContain('NotALedgerField');
        expect(new Payment(tx).unsignableFields()).toEqual([]);
    });
});
