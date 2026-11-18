/**
 * A Tangem card for tests: it holds a key and signs like the card does.
 *
 * What a card does (RNTangemSdk.sign): it gets hashes as hex and returns one raw signature per hash, as hex.
 * - secp256k1: the hash is the 32 byte SHA-512Half of the signing data. The signature is r + s (64 bytes),
 *   not DER, and s can be in the high half of the curve order (the app makes it canonical).
 * - ed25519: the "hash" is the signing data itself, the signature is the 64 byte EdDSA signature.
 *
 * What the card object looks like (the account's additionalInfo):
 * - secp256k1: wallet public key uncompressed (04 + x + y);
 * - ed25519: wallet public key without the ED prefix;
 * - a card with HD wallets: the wallet key is the master key, the key that signs is in derivedKeys under
 *   m/44'/144'/0'/0/0 (iOS and Android give a different shape) and the sign call names that path.
 *
 * Nothing in here is used by the app, only by tests.
 */
import * as AccountLib from 'xrpl-accountlib';

// xrpl-accountlib depends on elliptic; it has no type definitions here
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ec: EC } = require('elliptic');

const { rippleKeypairs } = AccountLib.libraries as any;
const secp256k1 = new EC('secp256k1');

export const TANGEM_DERIVATION_PATH = 'm/44\'/144\'/0\'/0/0';

const HD_PATH_NODES = [2147483692, 2147483792, 2147483648, 0, 0];

export type MockTangemCardOptions = {
    curve?: 'secp256k1' | 'ed25519';
    hdWallet?: 'ios' | 'android'; // a card with HD wallets, in the shape that platform gives
    highS?: boolean; // secp256k1: always answer with s in the high half (a card can do that)
};

export type MockTangemSignOptions = {
    cardId: string;
    walletPublicKey: string;
    hashes: string[];
    derivationPath?: string;
};

// SHA-512Half of a text, as hex: only to get fixed test values from a name
const digest = (text: string) => AccountLib.utils.bytesToHex(AccountLib.utils.hash(Buffer.from(text).toString('hex')));

const mockTangemCard = (name: string, options: MockTangemCardOptions = {}) => {
    const curve = options.curve ?? 'secp256k1';

    // the key on the card
    const seed = rippleKeypairs.generateSeed({
        entropy: Buffer.from(digest(`xaman-test-tangem-card-${name}`).slice(0, 32), 'hex'),
        algorithm: curve === 'ed25519' ? 'ed25519' : 'ecdsa-secp256k1',
    });
    const account = AccountLib.derive.familySeed(seed);
    const privateKey = String(account.keypair.privateKey); // 00 + 32 bytes (secp256k1), ED + 32 bytes (ed25519)
    const publicKey = String(account.keypair.publicKey); // as the app keeps it: compressed, or with the ED prefix
    const address = String(account.address);

    // the public key as the card gives it
    const cardPublicKey =
        curve === 'ed25519'
            ? publicKey.slice(2)
            : String(secp256k1.keyFromPrivate(privateKey.slice(2), 'hex').getPublic(false, 'hex')).toUpperCase();

    const cardId = `CB${digest(`card-id-${name}`).slice(0, 14)}`;
    // HD wallets: the wallet key is another key (the master key), the signing key is derived from it
    const masterPublicKey = String(AccountLib.derive.passphrase(`xaman-test-tangem-master-${name}`).keypair.publicKey);
    const derivedKey = { chainCode: digest(`chain-code-${name}`), publicKey };
    const derivedKeys =
        options.hdWallet === 'android'
            ? { [JSON.stringify({ rawPath: TANGEM_DERIVATION_PATH, nodes: HD_PATH_NODES })]: derivedKey }
            : [TANGEM_DERIVATION_PATH, derivedKey];

    const card: any = {
        cardId,
        supportedCurves: [curve],
        isAccessCodeSet: false,
        isPasscodeSet: false,
        settings: { isHDWalletAllowed: !!options.hdWallet, isSettingAccessCodeAllowed: false },
        wallets: [
            options.hdWallet
                ? { index: 0, curve, publicKey: masterPublicKey, derivedKeys, totalSignedHashes: 0 }
                : { index: 0, curve, publicKey: cardPublicKey, totalSignedHashes: 0 },
        ],
    };

    const signedHashes: string[] = [];
    const signCalls: MockTangemSignOptions[] = [];

    const signHash = (hash: string): string => {
        if (curve === 'ed25519') {
            // the card signs the bytes it gets
            return String(rippleKeypairs.sign(hash, privateKey)).toUpperCase();
        }

        if (!/^[0-9A-Fa-f]{64}$/.test(hash)) {
            throw new Error('A secp256k1 card signs a 32 byte hash');
        }
        const signature = secp256k1.keyFromPrivate(privateKey.slice(2), 'hex').sign(hash, { canonical: false });
        let { s } = signature;
        const half = secp256k1.n.shrn(1);
        if (options.highS && s.lte(half)) {
            s = secp256k1.n.sub(s);
        }
        return `${signature.r.toString(16, 64)}${s.toString(16, 64)}`.toUpperCase();
    };

    /** What RNTangemSdk.sign does with this card */
    const sign = async (signOptions: MockTangemSignOptions) => {
        signCalls.push(signOptions);

        if (signOptions.cardId !== cardId) {
            throw new Error('This is not the card the app asked for');
        }
        if (signOptions.walletPublicKey !== card.wallets[0].publicKey) {
            throw new Error('The card has no wallet with this public key');
        }
        if (!!options.hdWallet !== (signOptions.derivationPath === TANGEM_DERIVATION_PATH)) {
            throw new Error('The derivation path does not fit this card');
        }

        const signatures = signOptions.hashes.map((hash) => {
            signedHashes.push(hash);
            return signHash(hash);
        });
        card.wallets[0].totalSignedHashes += signatures.length;

        return { cardId, signatures, totalSignedHashes: card.wallets[0].totalSignedHashes };
    };

    return { name, curve, card, cardId, address, publicKey, cardPublicKey, signedHashes, signCalls, sign };
};

export type MockTangemCard = ReturnType<typeof mockTangemCard>;

/**
 * RNTangemSdk.sign for a set of mock cards: the card with the asked card id signs.
 * Use: jest.mocked(RNTangemSdk.sign).mockImplementation(mockTangemSdkSign([card]) as any)
 */
export const mockTangemSdkSign = (cards: MockTangemCard[]) => async (signOptions: MockTangemSignOptions) => {
    const found = cards.find((card) => card.cardId === signOptions.cardId);
    if (!found) {
        throw new Error('No card with this card id was held to the phone');
    }
    return found.sign(signOptions);
};

export default mockTangemCard;
