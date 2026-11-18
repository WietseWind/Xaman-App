/**
 * Which account signs a sign request, and "as" which account a multi signature is made.
 *
 * Runs the real account selection of the review (PreflightStep.loadSingingAccount) and the real signing
 * of the vault overlay (setSigners + signWithPrivateKey, or signWithTangemCard with a mock card) with real
 * keys, then reads the signed blob.
 *
 * Ledger rule behind it (checked on XRPL Testnet and Xahau Testnet): a multi signature is made by a member
 * of the signer list of the transaction Account. The Account can not sign for itself: such a transaction is
 * refused ("fails local checks: Invalid multisigner."), with its master key and with its regular key alike.
 *
 * The review asks the ledger for that signer list (LedgerService.getAccountSignerList, mocked here).
 */
import * as AccountLib from 'xrpl-accountlib';
import { verify } from 'ripple-keypairs';
import RNTangemSdk from 'tangem-sdk-react-native';

import NetworkService from '@services/NetworkService';
import LedgerService from '@services/LedgerService';
import { AccountRepository, CoreRepository } from '@store/repositories';
import { AccessLevels, EncryptionLevels } from '@store/types';

import Vault from '@common/libs/vault';
import { SignMixin } from '@common/libs/ledger/mixin/Sign.mixin';
import { AccountSet } from '@common/libs/ledger/transactions/genuine/AccountSet';
import { Batch } from '@common/libs/ledger/transactions/genuine/Batch';
import mockTangemCard, { mockTangemSdkSign } from '@common/utils/__tests__/helpers/mockTangemCard';

import VaultOverlay from '@screens/Overlay/Vault/VaultOverlay';
import { AuthMethods } from '@screens/Overlay/Vault/types';

import PreflightStep from '../Steps/Preflight/PreflightStep';

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
    AccountRepository: { getSignableAccounts: jest.fn(), getFullAccessAccounts: jest.fn(), findOne: jest.fn() },
    CoreRepository: { getDefaultAccount: jest.fn(), getSettings: jest.fn(() => ({})) },
    NetworkRepository: { findOne: jest.fn() },
}));
jest.mock('@common/libs/vault', () => ({ __esModule: true, default: { open: jest.fn() } }));
jest.mock('@common/libs/crash', () => ({ __esModule: true, default: { breadcrumb: jest.fn() } }));
jest.mock('@common/helpers/interface', () => ({ Prompt: jest.fn(), VibrateHapticFeedback: jest.fn() }));
jest.mock('@common/helpers/keyboard', () => ({ __esModule: true, default: { dismiss: jest.fn() } }));
jest.mock('@common/helpers/navigator', () => ({
    Navigator: { dismissModal: jest.fn(), dismissOverlay: jest.fn(), push: jest.fn(), showOverlay: jest.fn() },
}));
jest.mock('@components/General', () => ({
    Button: 'Button', Icon: 'Icon', Spacer: 'Spacer', InfoMessage: 'InfoMessage',
}));
jest.mock('@screens/Modal/ReviewTransaction/Shared', () => ({ ReviewHeader: 'ReviewHeader' }));
jest.mock('@screens/Overlay/Vault/Methods', () => ({
    PasscodeMethod: 'PasscodeMethod', PassphraseMethod: 'PassphraseMethod', TangemMethod: 'TangemMethod',
}));
jest.mock('@screens/Overlay/Vault/SelectSinger', () => ({ SelectSigner: 'SelectSigner' }));
jest.mock('@screens/Overlay/Vault/ServiceFee', () => ({ getServiceFeeTx: jest.fn(async () => undefined) }));
jest.mock('@theme', () => ({ AppStyles: {} }));
jest.mock('../Steps/Preflight/styles', () => ({}));

/* Accounts ==================================================================== */
// A = transaction Account, S = member of the signer list of A, K = regular key of S,
// M = another member of the signer list of A, X = an account that has nothing to do with A
// C and D = accounts of a Tangem card (secp256k1 and ed25519): the key is on the card, see mockTangemCard
const cards = {
    C: mockTangemCard('multisign-C'),
    D: mockTangemCard('multisign-D', { curve: 'ed25519' }),
    H: mockTangemCard('multisign-H', { hdWallet: 'ios' }), // a card with HD wallets: a derived key signs
};
const keys = {
    A: AccountLib.derive.passphrase('xaman-test-multisign-A'),
    S: AccountLib.derive.passphrase('xaman-test-multisign-S'),
    K: AccountLib.derive.passphrase('xaman-test-multisign-K'),
    M: AccountLib.derive.passphrase('xaman-test-multisign-M'),
    X: AccountLib.derive.passphrase('xaman-test-multisign-X'),
};
type Name = keyof typeof keys | keyof typeof cards;
const names = [...Object.keys(keys), ...Object.keys(cards)] as Name[];
const isCard = (name: Name): name is keyof typeof cards => name in cards;
const address = (name: Name) => (isCard(name) ? cards[name].address : String(keys[name].address));
const publicKey = (name: Name) => (isCard(name) ? cards[name].publicKey : String(keys[name].keypair.publicKey));
const nameOf = (value?: string) =>
    names.find((name) => address(name) === value || publicKey(name) === value) ?? `unknown ${value}`;

type AccountOptions = { regularKey?: Name; readonly?: boolean; masterDisabled?: boolean; hidden?: boolean };
const model = (name: Name, options: AccountOptions = {}) => ({
    address: address(name),
    publicKey: publicKey(name),
    label: name,
    accessLevel: options.readonly ? AccessLevels.Readonly : AccessLevels.Full,
    encryptionLevel: isCard(name) ? EncryptionLevels.Physical : EncryptionLevels.Passcode,
    additionalInfo: isCard(name) ? cards[name].card : undefined,
    regularKey: options.regularKey ? address(options.regularKey) : undefined,
    flags: { disableMasterKey: !!options.masterDisabled },
    hidden: !!options.hidden,
});
type Model = ReturnType<typeof model>;

/* The sign request ==================================================================== */
type Request = {
    accounts: Model[]; // the accounts in the app, in the order of the Accounts list
    defaultAccount?: Name; // default: the first account
    multisign: boolean;
    signers?: Name[]; // forced signers of the payload
    transaction?: any; // default: an AccountSet of A
    signerList?: Name[]; // the signer list of the transaction Account on the ledger; not given: not known
    signerListFails?: boolean; // the ledger can not be asked
    pickSource?: Name; // the user picks another account in the review
    giveVault?: Name; // skip the review: hand this account to the vault overlay
    pickKey?: Name; // the user picks another key in the vault overlay ("Sign with")
};

// LedgerService.getAccountSignerList: what the ledger says about the signer list of the transaction Account
const signerListLookup = jest.fn();

const MixedAccountSet = SignMixin(AccountSet);
const MixedBatch = SignMixin(Batch);

const accountSet = () =>
    new MixedAccountSet({
        TransactionType: 'AccountSet', Account: address('A'), Sequence: 7, Fee: '200',
    } as any);

const signRequest = async (request: Request) => {
    const { accounts, multisign } = request;
    const transaction = request.transaction ?? accountSet();
    const txAccountBefore = transaction.Account;

    // what the account repository gives (see AccountRepository.getSignableAccounts)
    const fullAccess = accounts.filter((account) => account.accessLevel === AccessLevels.Full);
    const signable = accounts.filter(
        (account) =>
            (account.accessLevel === AccessLevels.Full && !account.flags.disableMasterKey) ||
            (!!account.regularKey && fullAccess.some((other) => other.address === account.regularKey)),
    );
    jest.mocked(AccountRepository.getSignableAccounts).mockReturnValue(signable as any);
    jest.mocked(AccountRepository.getFullAccessAccounts).mockReturnValue(fullAccess as any);
    jest.mocked(AccountRepository.findOne).mockImplementation(
        ((query: any) => accounts.find((account) => account.address === query.address)) as any,
    );
    jest.mocked(CoreRepository.getDefaultAccount).mockReturnValue(
        (accounts.find((account) => account.label === request.defaultAccount) ?? accounts[0]) as any,
    );

    // 1) the review picks the account to sign with
    const payload = {
        isMultiSign: () => multisign,
        getSigners: () => (request.signers ?? []).map(address),
    };
    signerListLookup.mockImplementation(async () => {
        if (request.signerListFails) throw new Error('not connected');
        return request.signerList?.map(address);
    });
    const context = { transaction, payload, setAccounts: jest.fn(), setSource: jest.fn() };
    const step = new PreflightStep({});
    (step as any).context = context;
    await step.loadSingingAccount();

    const offered: Model[] = context.setAccounts.mock.calls[0][0];
    let source: Model = context.setSource.mock.calls[0][0];
    if (request.giveVault) {
        source = accounts.find((account) => account.label === request.giveVault)!;
    }
    if (request.pickSource) {
        const picked = offered.find((account) => account.label === request.pickSource);
        if (!picked) throw new Error(`${request.pickSource} is not offered in the review`);
        source = picked;
    }
    // the review modal (setSource): the picked account becomes the Account of a normal transaction
    if (!multisign && transaction.TransactionType !== 'Batch') {
        transaction.Account = source.address;
    }

    // 2) the vault overlay picks the key and signs
    const onSign = jest.fn();
    const overlay = new VaultOverlay({
        account: source, transaction, multiSign: multisign, onSign, onDismissed: jest.fn(),
    } as any);
    jest.spyOn(overlay, 'setState').mockImplementation((value: any, done?: any) => {
        Object.assign(overlay.state, value);
        if (typeof done === 'function') done();
    });
    overlay.setSigners();
    if (request.pickKey) {
        const { signer, signerDelegate } = overlay.state;
        const picked = [signer, signerDelegate].find((account) => account?.label === request.pickKey);
        if (!picked) throw new Error(`the key of ${request.pickKey} is not offered in the vault overlay`);
        overlay.onPreferredSignerSelect(picked);
    }
    const { preferredSigner } = overlay.state;
    if (preferredSigner?.encryptionLevel === EncryptionLevels.Physical) {
        // the key is on a card: the Tangem method asks the card of that key (TangemMethod)
        overlay.sign(AuthMethods.TANGEM, { tangemCard: preferredSigner.additionalInfo as any });
        // the overlay hands the result over after 2 seconds and stops the card session after 10
        await jest.advanceTimersByTimeAsync(12000);
    } else {
        jest.mocked(Vault.open).mockImplementation(
            (async (key: string) => (keys as any)[nameOf(key)].keypair.privateKey) as any,
        );
        await (overlay as any).signWithPrivateKey(AuthMethods.PIN, { encryptionKey: 'passcode' });
    }
    expect(onSign).toHaveBeenCalledTimes(1);

    // 3) read the signed blob
    const signed = onSign.mock.calls[0][0];
    const json: any = AccountLib.binary.decode(signed.signedTransaction);
    const signer = json.Signers?.[0]?.Signer;
    let signatureValid: boolean | undefined;
    if (signer) {
        const data = AccountLib.binary.encodeForMultisigning(json, signer.Account);
        signatureValid = verify(data, signer.TxnSignature, signer.SigningPubKey);
    } else if (json.TxnSignature) {
        signatureValid = verify(AccountLib.binary.encodeForSigning(json), json.TxnSignature, json.SigningPubKey);
    }

    return {
        source: source.label,
        offered: offered.map((account) => account.label),
        blob: signed.signedTransaction as string,
        json,
        signedObject: signed,
        transactionAccount: nameOf(json.Account),
        transactionAccountUnchanged: json.Account === txAccountBefore,
        signerAccount: signer ? nameOf(signer.Account) : undefined, // Signers[0].Signer.Account
        signers: (json.Signers ?? []).length,
        key: nameOf(signer ? signer.SigningPubKey : json.SigningPubKey),
        topLevelSigningPubKey: json.SigningPubKey,
        signatureValid,
    };
};

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    signerListLookup.mockReset();
    (LedgerService as any).getAccountSignerList = signerListLookup;
    jest.mocked(RNTangemSdk.sign).mockImplementation(mockTangemSdkSign(Object.values(cards)) as any);
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
describe('multi sign request: the signer is a member of the signer list, never the transaction Account', () => {
    it('case 1: forced signer S signs as itself with its own key', async () => {
        const result = await signRequest({ accounts: [model('S')], multisign: true, signers: ['S'] });

        expect(result).toMatchObject({ source: 'S', signerAccount: 'S', key: 'S', signatureValid: true });
        expect(result).toMatchObject({ transactionAccount: 'A', signers: 1, topLevelSigningPubKey: '' });
    });

    it('case 2: forced signer S with regular key K signs as S with the key of K', async () => {
        const accounts = [model('S', { regularKey: 'K', masterDisabled: true }), model('K')];
        const result = await signRequest({ accounts, multisign: true, signers: ['S'] });

        expect(result).toMatchObject({ source: 'S', signerAccount: 'S', key: 'K', signatureValid: true });
    });

    it('case 2: the user can pick the key of S or of its regular key K, both sign as S', async () => {
        const accounts = [model('S', { regularKey: 'K' }), model('K')];

        const own = await signRequest({ accounts, multisign: true, signers: ['S'] });
        expect(own).toMatchObject({ source: 'S', signerAccount: 'S', key: 'S', signatureValid: true });

        const regular = await signRequest({ accounts, multisign: true, signers: ['S'], pickKey: 'K' });
        expect(regular).toMatchObject({ source: 'S', signerAccount: 'S', key: 'K', signatureValid: true });
    });

    it('case 2: read-only S with regular key K in the app signs as S with the key of K', async () => {
        const accounts = [model('S', { regularKey: 'K', readonly: true }), model('K')];
        const result = await signRequest({ accounts, multisign: true, signers: ['S'] });

        expect(result).toMatchObject({ source: 'S', signerAccount: 'S', key: 'K', signatureValid: true });
    });

    it.each([
        ['A first in the Accounts list', ['A', 'S'] as Name[], false],
        ['S first in the Accounts list', ['S', 'A'] as Name[], false],
        ['master key of A disabled', ['A', 'S'] as Name[], true],
    ])(
        'case 3: forced signer S is also the regular key of the transaction Account A (%s): S signs as itself',
        async (_, order, masterDisabled) => {
            const accounts = order.map((name) =>
                name === 'A' ? model('A', { regularKey: 'S', masterDisabled }) : model(name),
            );
            const result = await signRequest({ accounts, multisign: true, signers: ['S'] });

            expect(result).toMatchObject({ source: 'S', signerAccount: 'S', key: 'S', signatureValid: true });
            expect(result.offered).toStrictEqual(['S']);
            expect(result).toMatchObject({ transactionAccount: 'A', transactionAccountUnchanged: true });
        },
    );

    it('case 3: with the other forced signer M in the app too, A is not offered', async () => {
        const accounts = [model('A', { regularKey: 'S' }), model('M'), model('S')];
        const result = await signRequest({ accounts, multisign: true, signers: ['S', 'M'], defaultAccount: 'A' });

        expect(result.offered).toStrictEqual(['M', 'S']);
        expect(result).toMatchObject({ source: 'M', signerAccount: 'M', key: 'M', signatureValid: true });
    });

    it('case 4: no forced signers, A is the default account: the review does not start with A', async () => {
        const accounts = [model('A'), model('S')];
        const result = await signRequest({ accounts, multisign: true, defaultAccount: 'A' });

        expect(result).toMatchObject({ source: 'S', signerAccount: 'S', key: 'S', signatureValid: true });
    });

    it('case 4: no forced signers: the default account is used when it is not A', async () => {
        const accounts = [model('A'), model('X'), model('S')];
        const result = await signRequest({ accounts, multisign: true, defaultAccount: 'S' });

        expect(result).toMatchObject({ source: 'S', signerAccount: 'S', key: 'S', signatureValid: true });
    });

    it('case 4: A has regular key S, no forced signers: S signs as itself', async () => {
        const accounts = [model('A', { regularKey: 'S', masterDisabled: true }), model('S')];
        const result = await signRequest({ accounts, multisign: true, defaultAccount: 'A' });

        expect(result).toMatchObject({ source: 'S', signerAccount: 'S', key: 'S', signatureValid: true });
    });

    it('case 4: A is not offered, also not as the last account of the list', async () => {
        const accounts = [model('X'), model('S'), model('A', { regularKey: 'S' })];
        const result = await signRequest({ accounts, multisign: true, defaultAccount: 'A' });

        expect(result.offered).toStrictEqual(['X', 'S']);
        expect(result.source).toBe('X');
    });

    it('vault overlay, given A anyway: the key of its regular key S signs as S, not as A', async () => {
        const accounts = [model('A', { regularKey: 'S' }), model('S')];
        const result = await signRequest({ accounts, multisign: true, giveVault: 'A', pickKey: 'S' });

        expect(result).toMatchObject({ signerAccount: 'S', key: 'S', signatureValid: true });
    });

    it('case 7: two forced signers in the app: the account the user selects signs as itself', async () => {
        const accounts = [model('S'), model('M'), model('X')];

        const first = await signRequest({ accounts, multisign: true, signers: ['S', 'M'], defaultAccount: 'X' });
        expect(first.offered).toStrictEqual(['S', 'M']);
        expect(first).toMatchObject({ source: 'S', signerAccount: 'S', key: 'S', signatureValid: true });

        const other = await signRequest({ accounts, multisign: true, signers: ['S', 'M'], pickSource: 'M' });
        expect(other).toMatchObject({ source: 'M', signerAccount: 'M', key: 'M', signatureValid: true });
    });

    it('a multi sign request keeps Account, Sequence and Fee, and gets no LastLedgerSequence', async () => {
        const result = await signRequest({ accounts: [model('S')], multisign: true, signers: ['S'] });

        expect(result.json).toMatchObject({ Account: address('A'), Sequence: 7, Fee: '200', SigningPubKey: '' });
        expect(result.json.LastLedgerSequence).toBeUndefined();
        expect(result.signedObject.signers).toStrictEqual([address('S')]);
    });
});

describe('multi sign request signed with a Tangem card', () => {
    it.each(['C', 'D'] as const)('case 1: forced signer %s is a card account: it signs as itself', async (name) => {
        const result = await signRequest({ accounts: [model(name)], multisign: true, signers: [name] });

        expect(result).toMatchObject({ source: name, signerAccount: name, key: name, signatureValid: true });
        expect(result).toMatchObject({ transactionAccount: 'A', signers: 1, topLevelSigningPubKey: '' });
        expect(result.signedObject).toMatchObject({ signMethod: AuthMethods.TANGEM, signers: [address(name)] });
    });

    it.each(['C', 'D'] as const)(
        'case 2: read-only signer S with the card %s as regular key signs as S with the card key',
        async (name) => {
            const accounts = [model('S', { regularKey: name, readonly: true }), model(name)];
            const result = await signRequest({ accounts, multisign: true, signers: ['S'] });

            expect(result).toMatchObject({ source: 'S', signerAccount: 'S', key: name, signatureValid: true });
            expect(result.signedObject).toMatchObject({ signMethod: AuthMethods.TANGEM, signers: [address('S')] });
        },
    );

    it('case 2: signer S with a card as regular key: its own key and the card key both sign as S', async () => {
        const accounts = [model('S', { regularKey: 'C' }), model('C')];

        const own = await signRequest({ accounts, multisign: true, signers: ['S'] });
        expect(own).toMatchObject({ source: 'S', signerAccount: 'S', key: 'S', signatureValid: true });

        const card = await signRequest({ accounts, multisign: true, signers: ['S'], pickKey: 'C' });
        expect(card).toMatchObject({ source: 'S', signerAccount: 'S', key: 'C', signatureValid: true });
    });

    it('case 2: signer C is a card account with regular key K: the key of K signs as C', async () => {
        const accounts = [model('C', { regularKey: 'K' }), model('K')];
        const result = await signRequest({ accounts, multisign: true, signers: ['C'], pickKey: 'K' });

        expect(result).toMatchObject({ source: 'C', signerAccount: 'C', key: 'K', signatureValid: true });
    });

    it('case 2: signer C is a card account with another card D as regular key: D signs as C', async () => {
        const accounts = [model('C', { regularKey: 'D' }), model('D')];
        const result = await signRequest({ accounts, multisign: true, signers: ['C'], pickKey: 'D' });

        expect(result).toMatchObject({ source: 'C', signerAccount: 'C', key: 'D', signatureValid: true });
    });

    it('case 3: forced signer C (a card) is also the regular key of A: C signs as itself', async () => {
        const accounts = [model('A', { regularKey: 'C', masterDisabled: true }), model('C')];
        const result = await signRequest({ accounts, multisign: true, signers: ['C'] });

        expect(result.offered).toStrictEqual(['C']);
        expect(result).toMatchObject({ source: 'C', signerAccount: 'C', key: 'C', signatureValid: true });
    });

    it('vault overlay, given A anyway, its regular key is a card: the card account signs as itself', async () => {
        const accounts = [model('A', { regularKey: 'C', masterDisabled: true }), model('C')];
        const result = await signRequest({ accounts, multisign: true, giveVault: 'A' });

        expect(result).toMatchObject({ signerAccount: 'C', key: 'C', signatureValid: true });
    });

    it('case 2: read-only signer S with a card with HD wallets as regular key signs as S, derived key', async () => {
        const accounts = [model('S', { regularKey: 'H', readonly: true }), model('H')];
        const result = await signRequest({ accounts, multisign: true, signers: ['S'], signerList: ['S'] });

        expect(result).toMatchObject({ source: 'S', signerAccount: 'S', key: 'H', signatureValid: true });
        expect(cards.H.signCalls[cards.H.signCalls.length - 1]).toMatchObject({
            walletPublicKey: cards.H.card.wallets[0].publicKey, derivationPath: 'm/44\'/144\'/0\'/0/0',
        });
    });

    it('the card gets the signing data for the account it signs as', async () => {
        const accounts = [model('S', { regularKey: 'C', readonly: true }), model('C')];
        const before = cards.C.signedHashes.length;
        const result = await signRequest({ accounts, multisign: true, signers: ['S'] });

        const data = AccountLib.binary.encodeForMultisigning(result.json, address('S'));
        expect(cards.C.signedHashes.slice(before)).toStrictEqual([
            AccountLib.utils.bytesToHex(AccountLib.utils.hash(data)).toUpperCase(),
        ]);
        expect(result.json).toMatchObject({ Account: address('A'), Sequence: 7, Fee: '200', SigningPubKey: '' });
        expect(result.json.LastLedgerSequence).toBeUndefined();
    });

    it('unchanged, not multi sign: A with a card as regular key: normal signature for A, card key', async () => {
        const accounts = [model('A', { regularKey: 'C', masterDisabled: true }), model('C')];
        const result = await signRequest({ accounts, multisign: false });

        expect(result).toMatchObject({ source: 'A', transactionAccount: 'A', key: 'C', signatureValid: true });
        expect(result).toMatchObject({ signers: 0, signerAccount: undefined });
    });
});

describe('multi sign request: the signer list of the transaction Account decides who is offered', () => {
    it('no forced signers: only the accounts in the signer list are offered, the first one to start with', async () => {
        const accounts = [model('X'), model('A'), model('M'), model('K'), model('S')];
        const result = await signRequest({ accounts, multisign: true, defaultAccount: 'X', signerList: ['S', 'M'] });

        expect(signerListLookup).toHaveBeenCalledWith(address('A'));
        expect(result.offered).toStrictEqual(['M', 'S']);
        expect(result).toMatchObject({ source: 'M', signerAccount: 'M', key: 'M', signatureValid: true });
    });

    it('no forced signers: the default account starts when it is in the signer list', async () => {
        const accounts = [model('X'), model('M'), model('S')];
        const result = await signRequest({ accounts, multisign: true, defaultAccount: 'S', signerList: ['S', 'M'] });

        expect(result.offered).toStrictEqual(['M', 'S']);
        expect(result).toMatchObject({ source: 'S', signerAccount: 'S', key: 'S', signatureValid: true });
    });

    it('a hidden account that is in the signer list is offered, a hidden account that is not is left out', async () => {
        const accounts = [model('X', { hidden: true }), model('S', { hidden: true })];
        const result = await signRequest({ accounts, multisign: true, signerList: ['S', 'M'] });

        expect(result.offered).toStrictEqual(['S']);
        expect(result).toMatchObject({ source: 'S', signerAccount: 'S', key: 'S', signatureValid: true });
    });

    it('a read-only signer with its regular key in the app is offered and signs as itself', async () => {
        const accounts = [model('X'), model('S', { regularKey: 'K', readonly: true }), model('K')];
        const result = await signRequest({ accounts, multisign: true, signerList: ['S', 'M'] });

        expect(result.offered).toStrictEqual(['S']);
        expect(result).toMatchObject({ source: 'S', signerAccount: 'S', key: 'K', signatureValid: true });
    });

    it('A is never offered, also when its regular key is in the signer list', async () => {
        const accounts = [model('A', { regularKey: 'S' }), model('S')];
        const result = await signRequest({ accounts, multisign: true, defaultAccount: 'A', signerList: ['S'] });

        expect(result.offered).toStrictEqual(['S']);
        expect(result).toMatchObject({ source: 'S', signerAccount: 'S', key: 'S', signatureValid: true });
    });

    it('forced signers: the requester decides who is offered, a signer list member to start with', async () => {
        const accounts = [model('X'), model('S'), model('M')];
        const result = await signRequest({
            accounts, multisign: true, defaultAccount: 'X', signers: ['X', 'S', 'M'], signerList: ['M'],
        });

        expect(result.offered).toStrictEqual(['X', 'S', 'M']);
        expect(result).toMatchObject({ source: 'M', signerAccount: 'M', key: 'M', signatureValid: true });
    });

    it('forced signers, none of them in the signer list: they are still offered', async () => {
        const accounts = [model('X'), model('S')];
        const result = await signRequest({ accounts, multisign: true, signers: ['S'], signerList: ['M'] });

        expect(result.offered).toStrictEqual(['S']);
        expect(result).toMatchObject({ source: 'S', signerAccount: 'S', key: 'S', signatureValid: true });
    });

    it('the signer list is not known (no answer): every other account is offered, as before', async () => {
        const accounts = [model('A'), model('X'), model('S')];
        const result = await signRequest({ accounts, multisign: true, defaultAccount: 'A' });

        expect(result.offered).toStrictEqual(['X', 'S']);
        expect(result.source).toBe('X');
    });

    it('the lookup fails: every other account is offered, as before', async () => {
        const accounts = [model('A'), model('X'), model('S')];
        const result = await signRequest({ accounts, multisign: true, defaultAccount: 'S', signerListFails: true });

        expect(result.offered).toStrictEqual(['X', 'S']);
        expect(result.source).toBe('S');
    });

    it('the lookup does not answer: the review goes on after 5 seconds with every other account', async () => {
        const accounts = [model('A'), model('S')];
        signerListLookup.mockImplementation(
            () =>
                new Promise(() => {
                    // never answers
                }),
        );
        jest.mocked(AccountRepository.getSignableAccounts).mockReturnValue(accounts as any);
        jest.mocked(CoreRepository.getDefaultAccount).mockReturnValue(accounts[0] as any);
        const context = {
            transaction: accountSet(),
            payload: { isMultiSign: () => true, getSigners: () => [] },
            setAccounts: jest.fn(),
            setSource: jest.fn(),
        };
        const step = new PreflightStep({});
        (step as any).context = context;
        const loading = step.loadSingingAccount();

        await jest.advanceTimersByTimeAsync(4900);
        expect(context.setSource).not.toHaveBeenCalled();
        await jest.advanceTimersByTimeAsync(200);
        await loading;
        expect(context.setSource.mock.calls[0][0].label).toBe('S');
    });

    it('a signer with its master key disabled and no regular key in the app can not sign: not offered', async () => {
        const accounts = [model('X'), model('S', { masterDisabled: true }), model('M')];
        const result = await signRequest({ accounts, multisign: true, signerList: ['S', 'M'] });

        expect(result.offered).toStrictEqual(['M']);
        expect(result).toMatchObject({ source: 'M', signerAccount: 'M', key: 'M', signatureValid: true });
    });

    it('a signer with its master key disabled signs with its regular key from the app', async () => {
        const accounts = [model('S', { masterDisabled: true, regularKey: 'K' }), model('K')];
        const result = await signRequest({ accounts, multisign: true, signerList: ['S'] });

        expect(result.offered).toStrictEqual(['S']);
        expect(result).toMatchObject({ source: 'S', signerAccount: 'S', key: 'K', signatureValid: true });
    });

    it('the regular key of a signer is in the app but the signer is not: it can not sign as the signer', async () => {
        // K could sign for S, but only as S, and S is not an account in the app
        const request = signRequest({ accounts: [model('K')], multisign: true, signerList: ['S'] });

        await expect(request).rejects.toMatchObject({
            action: 'MULTI_SIGN_SIGNER', data: { signers: [address('S')] },
        });
    });

    it('a multi sign request for a Batch: the signer list member signs the Batch as itself', async () => {
        const batch = new MixedBatch({
            TransactionType: 'Batch', Account: address('A'), Sequence: 7, Flags: 65536, Fee: '40',
            RawTransactions: [
                { RawTransaction: {
                    TransactionType: 'AccountSet', Account: address('A'), Fee: '0', Flags: 1073741824,
                    SigningPubKey: '', Sequence: 8,
                } },
            ],
        } as any);
        const accounts = [model('A'), model('X'), model('S')];
        const result = await signRequest({ accounts, multisign: true, transaction: batch, signerList: ['S'] });

        expect(result.offered).toStrictEqual(['S']);
        expect(result).toMatchObject({ source: 'S', signerAccount: 'S', key: 'S', signatureValid: true });
        expect(result.json).toMatchObject({ TransactionType: 'Batch', Account: address('A'), SigningPubKey: '' });
        expect(result.json.BatchSigners).toBeUndefined();
    });

    it('a multi sign request without an Account in the transaction: no lookup, the accounts of before', async () => {
        const transaction = new MixedAccountSet({ TransactionType: 'AccountSet', Sequence: 7, Fee: '200' } as any);
        const accounts = [model('X'), model('S')];
        const result = await signRequest({ accounts, multisign: true, transaction, signerList: ['M'] });

        expect(signerListLookup).not.toHaveBeenCalled();
        expect(result.offered).toStrictEqual(['X', 'S']);
        expect(result.source).toBe('X');
    });

    it('the review is closed while the signer list is asked: nothing is set afterwards', async () => {
        const accounts = [model('A'), model('S')];
        let answer: (signers: string[]) => void = () => undefined;
        signerListLookup.mockImplementation(
            () =>
                new Promise((resolve) => {
                    answer = resolve;
                }),
        );
        jest.mocked(AccountRepository.getSignableAccounts).mockReturnValue(accounts as any);
        jest.mocked(CoreRepository.getDefaultAccount).mockReturnValue(accounts[0] as any);
        const context = {
            transaction: accountSet(),
            payload: { isMultiSign: () => true, getSigners: () => [] },
            setAccounts: jest.fn(),
            setSource: jest.fn(),
        };
        const step = new PreflightStep({});
        (step as any).context = context;
        let open = true;
        const loading = step.loadSingingAccount(() => open);

        open = false; // the user closes the review
        answer([address('S')]);
        await loading;

        expect(context.setSource).not.toHaveBeenCalled();
        expect(context.setAccounts).not.toHaveBeenCalled();
    });

    it('a request that is not multi sign does not ask for the signer list', async () => {
        await signRequest({ accounts: [model('A'), model('S')], multisign: false, signerList: ['S'] });

        expect(signerListLookup).not.toHaveBeenCalled();
    });
});

describe('multi sign request that nobody in the app can sign: the review stops and says who can', () => {
    const stopped = async (request: Request) => {
        try {
            await signRequest(request);
        } catch (error: any) {
            return { action: error.action, ...error.data };
        }
        throw new Error('the review went on');
    };
    const screenText = (data: any) => {
        const step = new PreflightStep({});
        (step as any).context = { transaction: accountSet(), coreSettings: {} };
        step.state = { ...step.state, requiredAction: 'MULTI_SIGN_SIGNER' as any, requiredActionData: data };
        const find = (node: any): any => {
            if (Array.isArray(node)) return node.map(find).find(Boolean);
            if (!node || typeof node !== 'object') return undefined;
            if (node.type === 'InfoMessage') return node.props.label;
            return find(node.props?.children);
        };
        return find(step.render());
    };

    it('only A in the app, no forced signers, signer list known: names the signers', async () => {
        const data = await stopped({ accounts: [model('A')], multisign: true, signerList: ['S', 'M'] });

        expect(data).toStrictEqual({
            action: 'MULTI_SIGN_SIGNER', account: address('A'), signers: [address('S'), address('M')],
        });
        expect(screenText(data)).toBe(
            `This request can only be signed by \n\n${address('S')}\n${address('M')}\n\n` +
                'This accounts are not present with signing access.',
        );
    });

    it('accounts in the app, none of them in the signer list: names the signers', async () => {
        const accounts = [model('A'), model('X'), model('K')];
        const data = await stopped({ accounts, multisign: true, signerList: ['S'] });

        expect(data).toMatchObject({ action: 'MULTI_SIGN_SIGNER', signers: [address('S')] });
    });

    it('a signer that is in the app without signing access does not count', async () => {
        const accounts = [model('X'), model('S', { readonly: true })];
        const data = await stopped({ accounts, multisign: true, signerList: ['S'] });

        expect(data).toMatchObject({ action: 'MULTI_SIGN_SIGNER', signers: [address('S')] });
    });

    it('only A in the app and the signer list is not known: explains that A can not sign for itself', async () => {
        const data = await stopped({ accounts: [model('A')], multisign: true });

        expect(data).toStrictEqual({ action: 'MULTI_SIGN_SIGNER', account: address('A'), signers: [] });
        expect(screenText(data)).toBe(
            `This is a multi sign request for \n\n${address('A')}\n\n` +
                'Only the signers of this account can sign it, and none of them is present with signing access.',
        );
    });

    it('A has no signer list on the ledger: nobody can multi sign for it', async () => {
        const data = await stopped({ accounts: [model('A'), model('S')], multisign: true, signerList: [] });

        expect(data).toStrictEqual({ action: 'MULTI_SIGN_SIGNER', account: address('A'), signers: [] });
    });

    it('A is the forced signer of its own transaction: stops', async () => {
        const data = await stopped({ accounts: [model('A'), model('S')], multisign: true, signers: ['A'] });

        expect(data).toStrictEqual({ action: 'MULTI_SIGN_SIGNER', account: address('A'), signers: [] });
    });

    it('forced signers A and S, only A in the app: names S', async () => {
        const data = await stopped({ accounts: [model('A'), model('X')], multisign: true, signers: ['A', 'S'] });

        expect(data).toStrictEqual({ action: 'MULTI_SIGN_SIGNER', account: address('A'), signers: [address('S')] });
    });

    it('unchanged: forced signers that are not in the app at all give the forced signer screen', async () => {
        const data = await stopped({ accounts: [model('X')], multisign: true, signers: ['S'] });

        expect(data).toStrictEqual({ action: 'FORCED_SIGNER', forcedSigners: [address('S')] });
    });
});

describe('unchanged: a request that is not multi sign', () => {
    it('case 5 (issue 67): forced signer S = regular key of A: normal signature for A, key of S', async () => {
        const accounts = [model('A', { regularKey: 'S', masterDisabled: true }), model('S')];
        const result = await signRequest({ accounts, multisign: false, signers: ['S'] });

        expect(result).toMatchObject({ source: 'A', transactionAccount: 'A', key: 'S', signatureValid: true });
        expect(result).toMatchObject({ signers: 0, signerAccount: undefined });
        expect(result.offered).toStrictEqual(['A']);
    });

    it('case 5 (issue 67): with the master key of A enabled the user can pick the key of A or of S', async () => {
        const accounts = [model('A', { regularKey: 'S' }), model('S')];

        const own = await signRequest({ accounts, multisign: false, signers: ['S'] });
        expect(own).toMatchObject({ source: 'A', transactionAccount: 'A', key: 'A', signers: 0, signatureValid: true });

        const regular = await signRequest({ accounts, multisign: false, signers: ['S'], pickKey: 'S' });
        expect(regular).toMatchObject({
            source: 'A', transactionAccount: 'A', key: 'S', signers: 0, signatureValid: true,
        });
    });

    it('case 6: A with regular key K, master key disabled: normal signature for A, key of K', async () => {
        const accounts = [model('A', { regularKey: 'K', masterDisabled: true }), model('K')];
        const result = await signRequest({ accounts, multisign: false });

        expect(result).toMatchObject({ source: 'A', transactionAccount: 'A', key: 'K', signatureValid: true });
        expect(result).toMatchObject({ signers: 0, signerAccount: undefined });
    });

    it('case 6: read-only A with regular key K in the app: normal signature for A with the key of K', async () => {
        const accounts = [model('X'), model('A', { regularKey: 'K', readonly: true }), model('K')];
        const result = await signRequest({ accounts, multisign: false });

        expect(result).toMatchObject({
            source: 'A', transactionAccount: 'A', key: 'K', signers: 0, signatureValid: true,
        });
    });

    it('the transaction Account is preferred over the default account, and gets a LastLedgerSequence', async () => {
        const accounts = [model('X'), model('A')];
        const result = await signRequest({ accounts, multisign: false, defaultAccount: 'X' });

        expect(result).toMatchObject({
            source: 'A', transactionAccount: 'A', key: 'A', signers: 0, signatureValid: true,
        });
        expect(result.json.LastLedgerSequence).toBe(1020);
    });
});

describe('unchanged: case 8, Batch with an inner account of someone else', () => {
    const inner = (Account: string, Sequence: number) => ({
        RawTransaction: {
            TransactionType: 'AccountSet', Account, Fee: '0', Flags: 1073741824, SigningPubKey: '', Sequence,
        },
    });
    const batch = () =>
        new MixedBatch({
            TransactionType: 'Batch', Account: address('A'), Sequence: 7, Flags: 65536, Fee: '40',
            RawTransactions: [inner(address('A'), 8), inner(address('S'), 3)],
        } as any);

    it('the Batch Account signs the Batch itself', async () => {
        const accounts = [model('A'), model('S')];
        const result = await signRequest({ accounts, multisign: false, transaction: batch() });

        expect(result).toMatchObject({
            source: 'A', transactionAccount: 'A', key: 'A', signers: 0, signatureValid: true,
        });
        expect(result.json.BatchSigners).toBeUndefined();
    });

    it('the inner account adds its BatchSigner and no signature of the Batch', async () => {
        const accounts = [model('S')];
        const result = await signRequest({ accounts, multisign: false, transaction: batch() });

        expect(result.source).toBe('S');
        expect(result.json.Account).toBe(address('A'));
        expect(result.json.TxnSignature).toBeUndefined();
        expect(result.json.BatchSigners).toHaveLength(1);
        expect(result.json.BatchSigners[0].BatchSigner).toMatchObject({
            Account: address('S'), SigningPubKey: publicKey('S'),
        });
    });
});
