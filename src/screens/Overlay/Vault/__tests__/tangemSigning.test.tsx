/**
 * Signing with a Tangem card, through the real vault overlay (setSigners + signWithTangemCard).
 *
 * The card is a mock that signs like a card does: it gets a hash and answers with a raw signature
 * (see @common/utils/__tests__/helpers/mockTangemCard). The signed blob is decoded and its signature checked.
 */
import * as AccountLib from 'xrpl-accountlib';
import { verify } from 'ripple-keypairs';
import RNTangemSdk from 'tangem-sdk-react-native';

import NetworkService from '@services/NetworkService';
import LedgerService from '@services/LedgerService';
import LoggerService from '@services/LoggerService';
import { AccountRepository } from '@store/repositories';
import { AccessLevels, EncryptionLevels } from '@store/types';

import { AppConfig } from '@common/constants';
import { SignMixin } from '@common/libs/ledger/mixin/Sign.mixin';
import { AccountSet } from '@common/libs/ledger/transactions/genuine/AccountSet';
import { Batch } from '@common/libs/ledger/transactions/genuine/Batch';
import mockTangemCard, {
    mockTangemSdkSign,
    mockTangemSdkError,
    MockTangemCard,
    TANGEM_WRONG_CARD_NUMBER,
    TANGEM_DERIVATION_PATH,
} from '@common/utils/__tests__/helpers/mockTangemCard';

import { showTangemWrongCard } from '@common/helpers/tangemWrongCard';

import VaultOverlay from '../VaultOverlay';
import { AuthMethods } from '../types';

jest.mock('tangem-sdk-react-native', () => ({
    __esModule: true,
    default: {
        sign: jest.fn(),
        startSession: jest.fn(async () => undefined),
        stopSession: jest.fn(async () => undefined),
    },
    EllipticCurve: { Secp256k1: 'secp256k1', Secp256r1: 'secp256r1', Ed25519: 'ed25519' },
}));
jest.mock('@services/NetworkService');
jest.mock('@services/LedgerService');
jest.mock('@services/LoggerService', () => ({
    __esModule: true,
    LogEvents: {},
    default: {
        logEvent: jest.fn(),
        recordError: jest.fn(),
        createLogger: () => ({ debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
    },
}));
jest.mock('@store/repositories', () => ({
    AccountRepository: { findOne: jest.fn() },
    CoreRepository: { getSettings: jest.fn(() => ({})) },
}));
jest.mock('@common/libs/vault', () => ({ __esModule: true, default: { open: jest.fn() } }));
jest.mock('@common/libs/crash', () => ({ __esModule: true, default: { breadcrumb: jest.fn() } }));
jest.mock('@common/helpers/interface', () => ({ Prompt: jest.fn(), VibrateHapticFeedback: jest.fn() }));
jest.mock('@common/helpers/keyboard', () => ({ __esModule: true, default: { dismiss: jest.fn() } }));
jest.mock('@common/helpers/navigator', () => ({ Navigator: { dismissOverlay: jest.fn() } }));
jest.mock('@common/helpers/tangemWrongCard', () => ({ showTangemWrongCard: jest.fn() }));
jest.mock('../Methods', () => ({
    PasscodeMethod: 'PasscodeMethod', PassphraseMethod: 'PassphraseMethod', TangemMethod: 'TangemMethod',
}));
jest.mock('../SelectSinger', () => ({ SelectSigner: 'SelectSigner' }));

/* Helpers ==================================================================== */
const OTHER = String(AccountLib.derive.passphrase('xaman-test-tangem-other-account').address);

type Model = {
    address: string;
    publicKey?: string;
    label: string;
    accessLevel: AccessLevels;
    encryptionLevel: EncryptionLevels;
    regularKey?: string;
    flags: { disableMasterKey: boolean };
    additionalInfo?: any;
};

/** The account of a card, as the app keeps it */
const cardAccount = (card: MockTangemCard): Model => ({
    address: card.address,
    publicKey: card.publicKey,
    label: card.name,
    accessLevel: AccessLevels.Full,
    encryptionLevel: EncryptionLevels.Physical,
    flags: { disableMasterKey: false },
    additionalInfo: card.card,
});

/** A read-only account that has the account of a card as its regular key */
const readonlyAccount = (address: string, regularKey: MockTangemCard): Model => ({
    address,
    label: 'read-only',
    accessLevel: AccessLevels.Readonly,
    encryptionLevel: EncryptionLevels.None,
    regularKey: regularKey.address,
    flags: { disableMasterKey: true },
});

const MixedAccountSet = SignMixin(AccountSet);
const MixedBatch = SignMixin(Batch);

const accountSet = (Account: string, extra: Record<string, any> = {}) =>
    new MixedAccountSet({ TransactionType: 'AccountSet', Account, Sequence: 7, Fee: '12', ...extra } as any);

/** SHA-512Half of signing data, as hex: what a secp256k1 card gets to sign */
const sha512Half = (data: string) => AccountLib.utils.bytesToHex(AccountLib.utils.hash(data)).toUpperCase();

/** s of a DER signature is in the low half of the curve order (fully canonical) */
const hasLowS = (der: string) => {
    const bytes = Buffer.from(der, 'hex');
    const rLength = bytes[3];
    const s = bytes.subarray(4 + rLength + 2).toString('hex').padStart(64, '0').slice(-64);
    return BigInt(`0x${s}`) <= BigInt('0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0');
};

type Request = { account: Model; accounts: Model[]; cards: MockTangemCard[]; transaction: any; multiSign?: boolean };

const signWithCard = async ({ account, accounts, cards, transaction, multiSign = false }: Request) => {
    jest.mocked(AccountRepository.findOne).mockImplementation(
        ((query: any) => accounts.find((item) => item.address === query.address)) as any,
    );
    if (jest.mocked(RNTangemSdk.sign).getMockImplementation() === undefined) {
        jest.mocked(RNTangemSdk.sign).mockImplementation(mockTangemSdkSign(cards) as any);
    }

    const onSign = jest.fn();
    const onDismissed = jest.fn();
    const overlay = new VaultOverlay({ account, transaction, multiSign, onSign, onDismissed } as any);
    jest.spyOn(overlay, 'setState').mockImplementation((value: any, done?: any) => {
        Object.assign(overlay.state, value);
        if (typeof done === 'function') done();
    });

    // the overlay picks the key, the Tangem method then asks the card of that key (TangemMethod)
    overlay.setSigners();
    const { preferredSigner } = overlay.state;
    expect(preferredSigner?.encryptionLevel).toBe(EncryptionLevels.Physical);
    overlay.sign(AuthMethods.TANGEM, { tangemCard: preferredSigner!.additionalInfo as any });
    // the overlay hands the result over after 2 seconds and stops the card session after 10
    await jest.advanceTimersByTimeAsync(12000);

    const signed = onSign.mock.calls[0]?.[0];
    const fee = onSign.mock.calls[0]?.[1];
    const json: any = signed?.signedTransaction ? AccountLib.binary.decode(signed.signedTransaction) : undefined;

    return { overlay, onSign, onDismissed, signed, fee, json, preferredSigner };
};

const singleSignatureValid = (json: any) =>
    verify(AccountLib.binary.encodeForSigning(json), json.TxnSignature, json.SigningPubKey);

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest.mocked(RNTangemSdk.sign).mockReset();
    jest.spyOn(NetworkService, 'getNetworkDefinitions').mockReturnValue(undefined as any);
    jest.spyOn(NetworkService, 'getNetworkId').mockReturnValue(0);
    (NetworkService as any).getNetwork = jest.fn(() => ({ id: 'network', key: 'TESTNET' }));
    (LedgerService as any).getLedgerStatus = jest.fn(() => ({ LastLedger: 1000 }));
});
afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
});

/* Tests ==================================================================== */
describe('the mock card', () => {
    it('gives the public key as a card does and the app turns it into the account key', () => {
        const secp = mockTangemCard('secp');
        const ed = mockTangemCard('ed', { curve: 'ed25519' });

        expect(secp.card.wallets[0].publicKey).toMatch(/^04[0-9A-F]{128}$/);
        expect(AccountLib.utils.compressPubKey(secp.card.wallets[0].publicKey)).toBe(secp.publicKey);
        expect(AccountLib.rawSigning.accountAddress(secp.card.wallets[0].publicKey)).toBe(secp.address);

        expect(ed.card.wallets[0].publicKey).toMatch(/^[0-9A-F]{64}$/);
        expect(AccountLib.utils.compressPubKey(ed.card.wallets[0].publicKey)).toBe(ed.publicKey);
        expect(AccountLib.rawSigning.accountAddress(ed.card.wallets[0].publicKey)).toBe(ed.address);
    });

    it('refuses another card id, another wallet key and a wrong derivation path', async () => {
        const card = mockTangemCard('strict');
        const hd = mockTangemCard('strict-hd', { hdWallet: 'ios' });
        const hashes = ['AB'.repeat(32)];
        const walletPublicKey = card.card.wallets[0].publicKey;

        await expect(card.sign({ cardId: 'CB00', walletPublicKey, hashes })).rejects.toThrow('not the card');
        await expect(card.sign({ cardId: card.cardId, walletPublicKey: card.publicKey, hashes })).rejects.toThrow(
            'no wallet with this public key',
        );
        await expect(
            card.sign({ cardId: card.cardId, walletPublicKey, hashes, derivationPath: TANGEM_DERIVATION_PATH }),
        ).rejects.toThrow('derivation path');
        await expect(
            hd.sign({ cardId: hd.cardId, walletPublicKey: hd.card.wallets[0].publicKey, hashes }),
        ).rejects.toThrow('derivation path');
        await expect(card.sign({ cardId: card.cardId, walletPublicKey, hashes: ['AB'] })).rejects.toThrow('32 byte');
    });
});

describe('a normal transaction signed with a card', () => {
    it('secp256k1: the card gets the SHA-512Half of the signing data, the blob has a valid DER signature', async () => {
        const card = mockTangemCard('secp');
        const account = cardAccount(card);
        const result = await signWithCard({
            account, accounts: [account], cards: [card], transaction: accountSet(card.address),
        });

        expect(RNTangemSdk.startSession).toHaveBeenCalledWith({ attestationMode: 'offline' });
        expect(card.signCalls).toStrictEqual([
            // no card id: the SDK does not look for one card, the app checks the card that answered
            { walletPublicKey: card.card.wallets[0].publicKey, hashes: [expect.any(String)] },
        ]);

        const { json, signed } = result;
        expect(json).toMatchObject({ Account: card.address, SigningPubKey: card.publicKey, Sequence: 7, Fee: '12' });
        // a card can take long: the transaction stays valid for 150 ledgers
        expect(json.LastLedgerSequence).toBe(1150);
        expect(card.signedHashes).toStrictEqual([sha512Half(AccountLib.binary.encodeForSigning(json))]);
        expect(json.TxnSignature).toMatch(/^30/);
        expect(singleSignatureValid(json)).toBe(true);
        expect(signed).toMatchObject({
            signMethod: AuthMethods.TANGEM, signerPubKey: card.publicKey, signatureVerifies: true,
            id: AccountLib.utils.computeBinaryTransactionHash(signed.signedTransaction),
        });
        expect(RNTangemSdk.stopSession).toHaveBeenCalledTimes(1);
    });

    it('ed25519: the card gets the signing data itself, the blob has a valid signature', async () => {
        const card = mockTangemCard('ed', { curve: 'ed25519' });
        const account = cardAccount(card);
        const { json } = await signWithCard({
            account, accounts: [account], cards: [card], transaction: accountSet(card.address),
        });

        expect(json).toMatchObject({ Account: card.address, SigningPubKey: card.publicKey });
        expect(card.publicKey).toMatch(/^ED/);
        expect(card.signedHashes).toStrictEqual([AccountLib.binary.encodeForSigning(json)]);
        expect(json.TxnSignature).toHaveLength(128);
        expect(singleSignatureValid(json)).toBe(true);
    });

    it.each(['ios', 'android'] as const)(
        'a card with HD wallets (%s card data): the derived key signs, the sign call names the path',
        async (platform) => {
            const card = mockTangemCard(`hd-${platform}`, { hdWallet: platform });
            const account = cardAccount(card);
            const { json } = await signWithCard({
                account, accounts: [account], cards: [card], transaction: accountSet(card.address),
            });

            expect(card.signCalls[0]).toMatchObject({
                walletPublicKey: card.card.wallets[0].publicKey, derivationPath: TANGEM_DERIVATION_PATH,
            });
            expect(card.card.wallets[0].publicKey).not.toBe(card.publicKey);
            expect(json).toMatchObject({ Account: card.address, SigningPubKey: card.publicKey });
            expect(singleSignatureValid(json)).toBe(true);
        },
    );

    it('secp256k1: a signature with s in the high half is made fully canonical', async () => {
        const card = mockTangemCard('high-s', { highS: true });
        const account = cardAccount(card);
        const { json } = await signWithCard({
            account, accounts: [account], cards: [card], transaction: accountSet(card.address),
        });

        // what the card gave is not canonical
        const [raw] = await card.sign({
            cardId: card.cardId, walletPublicKey: card.card.wallets[0].publicKey, hashes: [card.signedHashes[0]],
        }).then((response) => response.signatures);
        expect(BigInt(`0x${raw.slice(64)}`) > BigInt(`0x${'7F'.padEnd(64, 'F')}`)).toBe(true);

        expect(hasLowS(json.TxnSignature)).toBe(true);
        expect(singleSignatureValid(json)).toBe(true);
    });

    it('the card is the regular key of a read-only account: the Account stays, the card key signs', async () => {
        const card = mockTangemCard('regular-key');
        const account = readonlyAccount(OTHER, card);
        const { json, preferredSigner } = await signWithCard({
            account, accounts: [account, cardAccount(card)], cards: [card], transaction: accountSet(OTHER),
        });

        expect(preferredSigner?.address).toBe(card.address);
        expect(json).toMatchObject({ Account: OTHER, SigningPubKey: card.publicKey });
        expect(singleSignatureValid(json)).toBe(true);
    });

    it('with a service fee the card signs two hashes in one tap: the transaction and the fee payment', async () => {
        const card = mockTangemCard('service-fee');
        const account = cardAccount(card);
        const transaction = accountSet(card.address);
        transaction.ServiceFee = 8;
        const { json, fee } = await signWithCard({ account, accounts: [account], cards: [card], transaction });

        expect(card.signCalls).toHaveLength(1);
        expect(card.signCalls[0].hashes).toHaveLength(2);
        expect(singleSignatureValid(json)).toBe(true);

        const feeJson: any = AccountLib.binary.decode(fee.signedTransaction);
        expect(feeJson).toMatchObject({
            TransactionType: 'Payment', Account: card.address, Destination: AppConfig.feeAccount, Amount: '8',
            Sequence: 8, SigningPubKey: card.publicKey,
        });
        expect(singleSignatureValid(feeJson)).toBe(true);
        expect(fee).toMatchObject({ signMethod: AuthMethods.TANGEM, signerPubKey: card.publicKey });
    });
});

describe('a multi sign request signed with a card', () => {
    it.each(['secp256k1', 'ed25519'] as const)('%s: the card account signs as itself', async (curve) => {
        const card = mockTangemCard(`multi-${curve}`, { curve });
        const account = cardAccount(card);
        const { json, signed } = await signWithCard({
            account, accounts: [account], cards: [card], transaction: accountSet(OTHER), multiSign: true,
        });

        expect(json).toMatchObject({ Account: OTHER, SigningPubKey: '', Sequence: 7, Fee: '12' });
        expect(json.LastLedgerSequence).toBeUndefined();
        expect(json.Signers).toHaveLength(1);
        const { Signer } = json.Signers[0];
        expect(Signer).toMatchObject({ Account: card.address, SigningPubKey: card.publicKey });

        const data = AccountLib.binary.encodeForMultisigning(json, card.address);
        expect(card.signedHashes).toStrictEqual([curve === 'ed25519' ? data : sha512Half(data)]);
        expect(verify(data, Signer.TxnSignature, Signer.SigningPubKey)).toBe(true);
        expect(signed).toMatchObject({ signMethod: AuthMethods.TANGEM, signerPubKey: card.publicKey });
    });
});

describe('a Batch signed with a card', () => {
    const inner = (Account: string, Sequence: number) => ({
        RawTransaction: {
            TransactionType: 'AccountSet', Account, Fee: '0', Flags: 1073741824, SigningPubKey: '', Sequence,
        },
    });
    const batch = (innerAccount: string) =>
        new MixedBatch({
            TransactionType: 'Batch', Account: OTHER, Sequence: 7, Flags: 65536, Fee: '40',
            RawTransactions: [inner(OTHER, 8), inner(innerAccount, 3)],
        } as any);

    it.each(['secp256k1', 'ed25519'] as const)(
        '%s: an inner account adds its BatchSigner, and no signature of the Batch itself',
        async (curve) => {
            const card = mockTangemCard(`batch-${curve}`, { curve });
            const account = cardAccount(card);
            const transaction = batch(card.address);
            const { json } = await signWithCard({ account, accounts: [account], cards: [card], transaction });

            expect(json.Account).toBe(OTHER);
            expect(json.TxnSignature).toBeUndefined();
            expect(json.SigningPubKey).toBeUndefined();
            expect(json.BatchSigners).toHaveLength(1);
            const { BatchSigner } = json.BatchSigners[0];
            expect(BatchSigner).toMatchObject({ Account: card.address, SigningPubKey: card.publicKey });

            const data = AccountLib.utils.batchSignerSigningData(transaction.JsonForSigning as any, card.address);
            expect(card.signedHashes).toStrictEqual([curve === 'ed25519' ? data : sha512Half(data)]);
            expect(verify(data, BatchSigner.TxnSignature, BatchSigner.SigningPubKey)).toBe(true);
        },
    );

    it('an inner read-only account with the card as regular key: BatchSigner of that account, card key', async () => {
        const card = mockTangemCard('batch-regular-key');
        const innerAccount = String(AccountLib.derive.passphrase('xaman-test-tangem-inner-account').address);
        const account = readonlyAccount(innerAccount, card);
        const transaction = batch(innerAccount);
        const { json } = await signWithCard({
            account, accounts: [account, cardAccount(card)], cards: [card], transaction,
        });

        const { BatchSigner } = json.BatchSigners[0];
        expect(BatchSigner).toMatchObject({ Account: innerAccount, SigningPubKey: card.publicKey });
        const data = AccountLib.utils.batchSignerSigningData(transaction.JsonForSigning as any, innerAccount);
        expect(verify(data, BatchSigner.TxnSignature, BatchSigner.SigningPubKey)).toBe(true);
    });
});

describe('when the card does not give a usable signature', () => {
    it('a signature of another key: no signed transaction comes out', async () => {
        const card = mockTangemCard('expected');
        const other = mockTangemCard('held-to-the-phone');
        const account = cardAccount(card);
        // the answer has the right card id, but the signature is of another key
        jest.mocked(RNTangemSdk.sign).mockImplementation((async (options: any) => ({
            ...(await other.sign({ ...options, walletPublicKey: other.card.wallets[0].publicKey })),
            cardId: card.cardId,
        })) as any);
        const { signed, json } = await signWithCard({
            account, accounts: [account], cards: [card], transaction: accountSet(card.address),
        });

        expect(json).toBeUndefined();
        expect(signed).toMatchObject({ signedTransaction: '', id: '', signatureVerifies: false });
    });

    // issue 564: another card ends the card session. The app says which card it must be, with its own alert
    it('another card is held to the phone: no signature, the overlay closes, the right card is named', async () => {
        const card = mockTangemCard('expected-card');
        const other = mockTangemCard('another-card');
        const account = cardAccount(card);
        jest.mocked(RNTangemSdk.sign).mockImplementation(mockTangemSdkSign([card, other], other) as any);
        const { onSign, onDismissed } = await signWithCard({
            account, accounts: [account], cards: [card, other], transaction: accountSet(card.address),
        });

        // the SDK got no card id, so it did not start its own "wrong card" wait
        expect(other.signCalls).toHaveLength(1);
        expect(other.signCalls[0]).not.toHaveProperty('cardId');
        expect(other.signedHashes).toHaveLength(0);
        expect(onSign).not.toHaveBeenCalled();
        expect(onDismissed).toHaveBeenCalledTimes(1);
        expect(showTangemWrongCard).toHaveBeenCalledTimes(1);
        expect(showTangemWrongCard).toHaveBeenCalledWith(card.name);
        expect(LoggerService.recordError).not.toHaveBeenCalled();
    });

    it('a card with the same wallet key but another card id: its signature is not used', async () => {
        const card = mockTangemCard('expected-twin');
        const account = cardAccount(card);
        jest.mocked(RNTangemSdk.sign).mockImplementation((async (options: any) => ({
            ...(await card.sign(options)),
            cardId: 'CB0000000000000000',
        })) as any);
        const { onSign, onDismissed } = await signWithCard({
            account, accounts: [account], cards: [card], transaction: accountSet(card.address),
        });

        expect(onSign).not.toHaveBeenCalled();
        expect(onDismissed).toHaveBeenCalledTimes(1);
        expect(showTangemWrongCard).toHaveBeenCalledWith(card.name);
    });

    it('the native check of the card id answers "wrong card number": the same alert', async () => {
        const card = mockTangemCard('expected-native');
        const account = cardAccount(card);
        jest.mocked(RNTangemSdk.sign).mockRejectedValue(
            mockTangemSdkError(TANGEM_WRONG_CARD_NUMBER, 'wrong card'),
        );
        const { onSign } = await signWithCard({
            account, accounts: [account], cards: [card], transaction: accountSet(card.address),
        });

        expect(onSign).not.toHaveBeenCalled();
        expect(showTangemWrongCard).toHaveBeenCalledWith(card.name);
        expect(LoggerService.recordError).not.toHaveBeenCalled();
    });

    it('the user cancels at the card: the overlay closes without a result and without an error report', async () => {
        const card = mockTangemCard('cancelled');
        const account = cardAccount(card);
        jest.mocked(RNTangemSdk.sign).mockRejectedValue(new Error('The user cancelled the operation'));
        const { onSign, onDismissed } = await signWithCard({
            account, accounts: [account], cards: [card], transaction: accountSet(card.address),
        });

        expect(onSign).not.toHaveBeenCalled();
        expect(onDismissed).toHaveBeenCalledTimes(1);
        expect(LoggerService.recordError).not.toHaveBeenCalled();
    });

    it('the card fails: the error is recorded and nothing is signed', async () => {
        const card = mockTangemCard('failing');
        const account = cardAccount(card);
        jest.mocked(RNTangemSdk.sign).mockRejectedValue(new Error('Tag was lost'));
        const { onSign } = await signWithCard({
            account, accounts: [account], cards: [card], transaction: accountSet(card.address),
        });

        expect(onSign).not.toHaveBeenCalled();
        expect(LoggerService.recordError).toHaveBeenCalledWith(
            'Unexpected error in sign process [TANGEM]', expect.any(Error),
        );
    });
});
