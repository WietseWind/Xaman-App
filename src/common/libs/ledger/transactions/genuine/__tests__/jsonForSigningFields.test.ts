/* eslint-disable max-len */

/**
 * JsonForSigning keeps only the common fields and the fields of the transaction model: a field the ledger
 * knows but the model does not was removed silently, so the signed transaction was not the reviewed one
 * (e.g. Xahau ClaimReward ClaimCurrency, OfferCreate OfferSequence). These fields are in the models now.
 */

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
        { DestinationTag: 7, CredentialIDs: [Hash] },
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
