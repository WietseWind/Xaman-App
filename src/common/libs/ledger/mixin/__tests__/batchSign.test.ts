/* eslint-disable max-len */
import * as AccountLib from 'xrpl-accountlib';
import { verify } from 'ripple-keypairs';

import NetworkService from '@services/NetworkService';

import { SignMixin } from '../Sign.mixin';
import { Batch } from '../../transactions/genuine/Batch';
import { batchJsonForSigning } from '../../utils/batchSigners';

import devnetBatch from './fixtures/BatchV1_1DevnetTx.json';

jest.mock('@services/NetworkService');

const A = 'r9QUHHpQcSHJ71dYYFNtb9Com71cm8NsjC'; // Batch Account
const B = 'rwu2j5RgfiiN2LANn3khFtZWsoUkkjcVjC'; // inner account
const C = 'rPJLVD5wBodKz721xk3V3AT7wUJx878ajU'; // not part of the Batch

const innerTx = (Account: string, Destination: string, Sequence: number) => ({
    RawTransaction: {
        TransactionType: 'Payment',
        Account,
        Destination,
        Amount: '1000',
        Fee: '0',
        Flags: 1073741824, // tfInnerBatchTxn
        SigningPubKey: '',
        Sequence,
    },
});

// Xaman-Issue-Tracker #520: the Batch Account owns 3 of the 6 inner transactions
const issue520Batch = (BatchSigners?: any[]) => ({
    TransactionType: 'Batch',
    Account: A,
    Sequence: 5907382,
    Flags: 65536,
    Fee: '20',
    RawTransactions: [
        innerTx(A, B, 5907383),
        innerTx(B, A, 5907390),
        innerTx(B, A, 5907391),
        innerTx(B, A, 5907392),
        innerTx(A, B, 5907384),
        innerTx(A, B, 5907385),
    ],
    ...(BatchSigners ? { BatchSigners } : {}),
});

const MixedBatch = SignMixin(Batch);

describe('Batch signing (BatchV1_1)', () => {
    describe('Signer routing', () => {
        it('Should leave out every occurrence of the Batch Account', () => {
            const tx = new MixedBatch(issue520Batch() as any);

            expect(tx.innerBatchSigners()).toStrictEqual([A, B]);
            expect(tx.innerBatchSigners(true)).toStrictEqual([B]);
        });

        it('Should only make inner accounts (not the Batch Account) co-signers', () => {
            const tx = new MixedBatch(issue520Batch() as any);

            expect(tx.isBatchCoSigner(B)).toBe(true);
            expect(tx.isBatchCoSigner(A)).toBe(false);
            expect(tx.isBatchCoSigner(C)).toBe(false);
        });

        it('Should not need more signers when the inner signature is present (issue #520)', () => {
            expect(new MixedBatch(issue520Batch() as any).isBatchInNeedOfMultipleSigners()).toBe(true);

            const signed = new MixedBatch(
                issue520Batch([{ BatchSigner: { Account: B, SigningPubKey: 'ED00', TxnSignature: '00' } }]) as any,
            );
            expect(signed.isBatchInNeedOfMultipleSigners()).toBe(false);
            expect(signed.isBatchCoSigner(A)).toBe(false);
        });

        it('Should make the inner account a co-signer when another account submits', () => {
            const tx = new MixedBatch({
                ...issue520Batch(),
                Account: C,
                RawTransactions: [innerTx(B, A, 1), innerTx(B, A, 2)],
            } as any);

            expect(tx.innerBatchSigners()).toStrictEqual([B]);
            expect(tx.isBatchCoSigner(B)).toBe(true);
            expect(tx.isBatchCoSigner(C)).toBe(false);
            expect(tx.isBatchInNeedOfMultipleSigners()).toBe(true);
        });

        it('Should have no co-signers without a Batch Account', () => {
            const tx = new MixedBatch({ ...issue520Batch(), Account: undefined } as any);

            expect(tx.isBatchCoSigner(B)).toBe(false);
        });
    });

    describe('BatchSigner signature', () => {
        it('Should match a validated (tesSUCCESS) XRPL Devnet Batch', () => {
            const tx = new MixedBatch(devnetBatch.tx as any);
            const { BatchSigner } = devnetBatch.tx.BatchSigners[0];

            const data = AccountLib.utils.batchSignerSigningData(tx.JsonForSigning as any, BatchSigner.Account);
            expect(verify(data, BatchSigner.TxnSignature, BatchSigner.SigningPubKey)).toBe(true);
        });

        it('Should sign the BatchV1_1 data as the inner account', () => {
            const inner = AccountLib.derive.familySeed('sEdVfE5cbKj6DG5oDnfCED3WX4J7nD1'); // rnmxGK7ShgVNynKJCeFKkDZVJ1ji1UXmL3
            const tx = new MixedBatch({
                ...issue520Batch(),
                RawTransactions: [innerTx(A, String(inner.address), 1), innerTx(String(inner.address), A, 2)],
            } as any);

            expect(tx.isBatchCoSigner(String(inner.address))).toBe(true);

            const { BatchSigner } = AccountLib.signInnerBatch(tx.JsonForSigning, inner);
            expect(BatchSigner.Account).toBe(inner.address);

            const data = AccountLib.utils.batchSignerSigningData(tx.JsonForSigning as any, String(inner.address));
            expect(verify(data, BatchSigner.TxnSignature, BatchSigner.SigningPubKey)).toBe(true);
        });

        it('Should sign as the inner account with its regular key', () => {
            const regularKey = AccountLib.derive.familySeed('sEdTtwrsJDWb4vVg63YTTez3WGGn8gz').signAs(B);
            const tx = new MixedBatch(issue520Batch() as any);

            const { BatchSigner } = AccountLib.signInnerBatch(tx.JsonForSigning, regularKey);
            expect(BatchSigner.Account).toBe(B);
            expect(BatchSigner.SigningPubKey).toBe(regularKey.keypair.publicKey);

            const data = AccountLib.utils.batchSignerSigningData(tx.JsonForSigning as any, B);
            expect(verify(data, BatchSigner.TxnSignature, BatchSigner.SigningPubKey)).toBe(true);
        });
    });

    describe('Required inner signers (as rippled)', () => {
        it('Should use the Delegate, the Counterparty and a signing Sponsor of an inner transaction', () => {
            const D = 'rnmxGK7ShgVNynKJCeFKkDZVJ1ji1UXmL3';
            const tx = new MixedBatch({
                ...issue520Batch(),
                RawTransactions: [
                    { RawTransaction: { ...innerTx(B, A, 1).RawTransaction, Delegate: D } },
                    { RawTransaction: { ...innerTx(A, B, 2).RawTransaction, Counterparty: C } },
                    { RawTransaction: { ...innerTx(A, B, 3).RawTransaction, Sponsor: B } },
                ],
            } as any);

            // B delegated its inner transaction to D, B is a Sponsor without SponsorSignature
            expect(tx.innerBatchSigners(true)).toStrictEqual([D, C]);
            expect(tx.isBatchCoSigner(B)).toBe(false);
        });
    });

    describe('Batch Account when an account is selected', () => {
        it('Should keep the payload Batch Account when other inner accounts sign', () => {
            const tx = new MixedBatch(issue520Batch() as any);

            expect(tx.batchAccountForSource(B, A)).toBe(A);
            expect(tx.batchAccountForSource(C, A)).toBe(A);
        });

        it('Should follow the selected account on a single account Batch (select A, then C, then A)', () => {
            const tx = new MixedBatch({ ...issue520Batch(), RawTransactions: [innerTx(A, B, 1), innerTx(A, B, 2)] } as any);

            const pick = (source: string) => {
                const batchAccount = tx.batchAccountForSource(source, A);
                if (typeof batchAccount !== 'undefined') {
                    tx.Account = batchAccount;
                }
            };

            pick(A);
            expect(tx.Account).toBe(A);
            pick(C);
            expect(tx.Account).toBe(A); // C cannot sign this Batch, sign() tells why
            pick(A);
            expect(tx.Account).toBe(A);
            expect(tx.isBatchCoSigner(A)).toBe(false);
        });

        it('Should not set a Batch Account for a Batch of more accounts without one', () => {
            const tx = new MixedBatch({ ...issue520Batch(), Account: undefined } as any);

            expect(tx.batchAccountForSource(A, undefined)).toBeUndefined();
        });
    });

    describe('sign() checks', () => {
        beforeEach(() => {
            jest.spyOn(NetworkService, 'getNetworkDefinitions').mockReturnValue({} as any);
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('Should refuse a Batch of more accounts without a Batch Account', async () => {
            const tx = new MixedBatch({ ...issue520Batch(), Account: undefined } as any);

            await expect(tx.sign({ address: B } as any)).rejects.toThrow('the Batch Account must be set');
        });

        it('Should refuse an inner account without a Batch Sequence', async () => {
            const tx = new MixedBatch({ ...issue520Batch(), Sequence: undefined, TicketSequence: 5 } as any);

            await expect(tx.sign({ address: B } as any)).rejects.toThrow('the Batch Sequence must be set');
        });

        it('Should refuse an account that is not the Batch Account or an inner account', async () => {
            const tx = new MixedBatch(issue520Batch() as any);

            await expect(tx.sign({ address: C } as any)).rejects.toThrow(
                `This Batch can only be signed by its Account (${A})`,
            );
        });
    });

    describe('Co-sign and outer sign (as the vault does)', () => {
        it('Should give a valid BatchSigner and a valid outer signature for the issue #520 shape', () => {
            const outer = AccountLib.derive.familySeed('sEdVG7nzg5iXsHWbd6CxKs5PYx6qKyG'); // rPJLVD5wBodKz721xk3V3AT7wUJx878ajU
            const inner = AccountLib.derive.familySeed('sEdVfE5cbKj6DG5oDnfCED3WX4J7nD1'); // rnmxGK7ShgVNynKJCeFKkDZVJ1ji1UXmL3
            const [O, I] = [String(outer.address), String(inner.address)];
            const json = {
                ...issue520Batch(),
                Account: O,
                RawTransactions: [innerTx(O, I, 2), innerTx(I, O, 9), innerTx(O, I, 3), innerTx(O, I, 4)],
            };

            // 1) inner account co-signs
            const coSign = new MixedBatch(json as any);
            expect(coSign.isBatchCoSigner(I)).toBe(true);
            const coSigned = AccountLib.sign(
                batchJsonForSigning(coSign.JsonForSigning, O, AccountLib.signInnerBatch(coSign.JsonForSigning, inner)),
                inner,
            );
            const { BatchSigners } = coSigned.txJson as any;
            expect(BatchSigners[0].BatchSigner.Account).toBe(I);

            // 2) the Batch Account signs with that BatchSigner (and an old entry of its own, issue #520)
            const final = new MixedBatch({
                ...json,
                BatchSigners: [...BatchSigners, { BatchSigner: { Account: O, SigningPubKey: 'ED00', TxnSignature: '00' } }],
            } as any);
            expect(final.isBatchCoSigner(O)).toBe(false);
            expect(final.isBatchInNeedOfMultipleSigners()).toBe(false);

            const signed = AccountLib.sign(batchJsonForSigning(final.JsonForSigning, O), outer);
            const signedJson = signed.txJson as any;

            expect(signedJson.SigningPubKey).toBe(outer.keypair.publicKey);
            expect(signedJson.BatchSigners).toStrictEqual(BatchSigners);
            // the outer signature does not cover the BatchSigners
            expect(
                verify(
                    AccountLib.binary.encodeForSigning(signedJson),
                    signedJson.TxnSignature,
                    signedJson.SigningPubKey,
                ),
            ).toBe(true);

            const data = AccountLib.utils.batchSignerSigningData(signedJson, I);
            expect(
                verify(data, BatchSigners[0].BatchSigner.TxnSignature, BatchSigners[0].BatchSigner.SigningPubKey),
            ).toBe(true);
        });
    });
});
