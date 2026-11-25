import { derive, sign } from 'xrpl-accountlib';

import { buildServiceFeePayment } from '../ServiceFee';

describe('service fee signing', () => {
    const account = 'rfajymHqQd4K23NHG3AeEQaqUj5ZqscvWo';

    const batch = {
        ServiceFee: 8,
        NetworkID: 0,
        JsonForSigning: {
            TransactionType: 'Batch',
            Account: account,
            Sequence: 76396596,
            Fee: '48',
            Flags: 65536,
            LastLedgerSequence: 107859757,
            RawTransactions: [
                {
                    RawTransaction: {
                        Account: account,
                        TransactionType: 'Payment',
                        Sequence: 76396597,
                        Fee: '0',
                    },
                },
                {
                    RawTransaction: {
                        Account: account,
                        TransactionType: 'Payment',
                        Sequence: 76396598,
                        Fee: '0',
                    },
                },
            ],
        },
    };

    it('signs the fee one sequence past the inner transactions, with a short last ledger', () => {
        const { feeTrx } = buildServiceFeePayment(batch as any, { id: 'AB'.repeat(32) });
        expect(feeTrx.Sequence).toBe(76396599);
        expect(feeTrx.LastLedgerSequence).toBe(107859777);
        expect(feeTrx.Amount).toBe('8');
        expect(feeTrx.Account).toBe(account);

        const signer = derive.passphrase('masterpassphrase');
        const signed = sign(
            {
                ...feeTrx,
                Account: signer.address,
            },
            signer,
        );

        expect(signed.txJson.Sequence).toBe(76396599);
        expect(signed.txJson.LastLedgerSequence).toBe(107859777);
        expect(signed.signedTransaction).toEqual(expect.any(String));
    });
});
