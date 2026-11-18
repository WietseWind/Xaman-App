import * as AccountLib from 'xrpl-accountlib';
import { verify } from 'ripple-keypairs';

import mockTangemCard from '@common/utils/__tests__/helpers/mockTangemCard';

import { completeRawMultiSign, prepareRawMultiSign } from '../rawMultiSign';

const A = String(AccountLib.derive.passphrase('xaman-test-raw-multisign-A').address); // transaction Account
const S = String(AccountLib.derive.passphrase('xaman-test-raw-multisign-S').address); // signer list member

const tx = () => ({ TransactionType: 'AccountSet', Account: A, Sequence: 7, Fee: '200' });

const signOnCard = async (card: ReturnType<typeof mockTangemCard>, hash: string) => {
    const { signatures } = await card.sign({
        cardId: card.cardId, walletPublicKey: card.card.wallets[0].publicKey, hashes: [hash],
    });
    return signatures[0];
};

describe('raw multi sign (a key that only signs a hash)', () => {
    describe.each(['secp256k1', 'ed25519'] as const)('%s card', (curve) => {
        const card = mockTangemCard(`raw-multisign-${curve}`, { curve });

        it('as the account of the card: the same hash and the same blob as xrpl-accountlib rawSigning', async () => {
            const prepared = prepareRawMultiSign(tx(), card.cardPublicKey, card.address);
            const library = AccountLib.rawSigning.prepare(tx(), card.cardPublicKey, true);
            expect(prepared.hashToSign).toBe(library.hashToSign);
            expect(prepared.message).toBe(library.message);

            const signature = await signOnCard(card, prepared.hashToSign);
            const signed = completeRawMultiSign(prepared, signature);
            const fromLibrary = AccountLib.rawSigning.completeMultiSigned(tx(), [
                { pubKey: card.cardPublicKey, signature },
            ]);

            expect(signed.signedTransaction).toBe(fromLibrary.signedTransaction);
            expect(signed.id).toBe(fromLibrary.id);
            expect(signed.txJson).toStrictEqual(fromLibrary.txJson);
            expect(signed).toMatchObject({ type: 'MultiSignedTx', signers: [card.address] });
        });

        it('as another account (the card is its regular key): that account is the signer', async () => {
            const prepared = prepareRawMultiSign(tx(), card.cardPublicKey, S);
            expect(prepared.message).toBe(AccountLib.binary.encodeForMultisigning({ ...tx(), SigningPubKey: '' }, S));

            const signed = completeRawMultiSign(prepared, await signOnCard(card, prepared.hashToSign));
            const json: any = AccountLib.binary.decode(signed.signedTransaction);

            expect(json).toMatchObject({ ...tx(), SigningPubKey: '' });
            expect(json.Signers).toHaveLength(1);
            const { Signer } = json.Signers[0];
            expect(Signer).toMatchObject({ Account: S, SigningPubKey: card.publicKey });
            expect(verify(AccountLib.binary.encodeForMultisigning(json, S), Signer.TxnSignature, card.publicKey)).toBe(
                true,
            );
            // not valid as the card account: the signing data names the signer
            const asCardAccount = AccountLib.binary.encodeForMultisigning(json, card.address);
            expect(verify(asCardAccount, Signer.TxnSignature, card.publicKey)).toBe(false);
            expect(signed).toMatchObject({
                type: 'MultiSignedTx',
                signers: [S],
                id: AccountLib.utils.computeBinaryTransactionHash(signed.signedTransaction),
            });
        });

        it('takes the public key as the card gives it or as the app keeps it', () => {
            const fromCard = prepareRawMultiSign(tx(), card.cardPublicKey, S);
            const fromAccount = prepareRawMultiSign(tx(), card.publicKey, S);

            expect(fromCard).toStrictEqual(fromAccount);
            expect(fromCard.signingPubKey).toBe(card.publicKey);
        });

        it('refuses a signature for another account or of another key', async () => {
            const prepared = prepareRawMultiSign(tx(), card.cardPublicKey, S);
            const forCardAccount = prepareRawMultiSign(tx(), card.cardPublicKey, card.address);
            const otherCard = mockTangemCard(`raw-multisign-other-${curve}`, { curve });

            expect(() => completeRawMultiSign(prepared, 'AB'.repeat(64))).toThrow(`Invalid signature by/for ${S}`);
            const forOtherAccount = await signOnCard(card, forCardAccount.hashToSign);
            expect(() => completeRawMultiSign(prepared, forOtherAccount)).toThrow(`Invalid signature by/for ${S}`);
            const ofOtherKey = await signOnCard(otherCard, prepared.hashToSign);
            expect(() => completeRawMultiSign(prepared, ofOtherKey)).toThrow(`Invalid signature by/for ${S}`);
        });
    });

    it('a secp256k1 signature with s in the high half comes out fully canonical and valid', async () => {
        const card = mockTangemCard('raw-multisign-high-s', { highS: true });
        const prepared = prepareRawMultiSign(tx(), card.cardPublicKey, S);
        const signed = completeRawMultiSign(prepared, await signOnCard(card, prepared.hashToSign));
        const { Signer } = (AccountLib.binary.decode(signed.signedTransaction) as any).Signers[0];

        expect(verify(prepared.message, Signer.TxnSignature, card.publicKey)).toBe(true);
    });

    it('keeps the transaction as it is and always leaves the top level SigningPubKey empty', () => {
        const prepared = prepareRawMultiSign({ ...tx(), SigningPubKey: 'ED00' }, mockTangemCard('x').cardPublicKey, S);

        expect(prepared.transaction).toStrictEqual({ ...tx(), SigningPubKey: '' });
    });

    it('refuses an invalid account to sign as and a signature that is not 64 bytes', () => {
        const card = mockTangemCard('raw-multisign-invalid');

        expect(() => prepareRawMultiSign(tx(), card.cardPublicKey, 'rNotAnAccount')).toThrow('not a valid address');
        expect(() => completeRawMultiSign(prepareRawMultiSign(tx(), card.cardPublicKey, S), 'ABCD')).toThrow(
            '64 byte signature',
        );
    });
});
