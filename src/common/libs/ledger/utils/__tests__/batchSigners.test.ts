import { batchJsonForSigning, outerBatchSigners } from '../batchSigners';

const entry = (Account: string) => ({ BatchSigner: { Account, SigningPubKey: 'ED', TxnSignature: 'SIG' } });

describe('outerBatchSigners', () => {
    it('Should sort by AccountID, not by address', () => {
        // rMrcK... is AccountID DB7FFE..., rnmxG... is AccountID 3460F0...: the address order is the other way around
        const sorted = outerBatchSigners([
            entry('rMrcKatiqxvM2wZ7d2LT8Ro8fQyyEyUFVP'),
            entry('rnmxGK7ShgVNynKJCeFKkDZVJ1ji1UXmL3'),
        ]);

        expect(sorted.map((e) => e.BatchSigner.Account)).toStrictEqual([
            'rnmxGK7ShgVNynKJCeFKkDZVJ1ji1UXmL3',
            'rMrcKatiqxvM2wZ7d2LT8Ro8fQyyEyUFVP',
        ]);
    });

    it('Should leave out an entry of the Batch Account', () => {
        const signers = [
            entry('rwu2j5RgfiiN2LANn3khFtZWsoUkkjcVjC'),
            entry('r9QUHHpQcSHJ71dYYFNtb9Com71cm8NsjC'),
        ];

        expect(
            outerBatchSigners(signers, 'r9QUHHpQcSHJ71dYYFNtb9Com71cm8NsjC').map((e) => e.BatchSigner.Account),
        ).toStrictEqual(['rwu2j5RgfiiN2LANn3khFtZWsoUkkjcVjC']);

        // the input is not changed
        expect(signers.length).toBe(2);
    });

    it('Should leave out duplicates and entries that are not BatchSigner objects', () => {
        const signers: any[] = [
            entry('rwu2j5RgfiiN2LANn3khFtZWsoUkkjcVjC'),
            'F00D',
            entry('rwu2j5RgfiiN2LANn3khFtZWsoUkkjcVjC'),
        ];

        expect(outerBatchSigners(signers).map((e) => e.BatchSigner.Account)).toStrictEqual([
            'rwu2j5RgfiiN2LANn3khFtZWsoUkkjcVjC',
        ]);
    });
});

describe('batchJsonForSigning', () => {
    const A = 'r9QUHHpQcSHJ71dYYFNtb9Com71cm8NsjC';
    const B = 'rwu2j5RgfiiN2LANn3khFtZWsoUkkjcVjC';
    const batch = { TransactionType: 'Batch', Account: A, BatchSigners: [entry(B), entry(A)] };

    it('Should keep the BatchSigners of the inner accounts for the Batch Account (issue #520)', () => {
        expect(batchJsonForSigning(batch, A).BatchSigners).toStrictEqual([entry(B)]);
    });

    it('Should only add its own BatchSigner for an inner account', () => {
        const own = entry(B);
        expect(batchJsonForSigning({ ...batch, BatchSigners: undefined }, A, own).BatchSigners).toStrictEqual([own]);
    });

    it('Should not change other transactions or the input', () => {
        const payment = { TransactionType: 'Payment', Account: A };
        expect(batchJsonForSigning(payment, A)).toStrictEqual(payment);
        expect(batch.BatchSigners.length).toBe(2);
    });
});
