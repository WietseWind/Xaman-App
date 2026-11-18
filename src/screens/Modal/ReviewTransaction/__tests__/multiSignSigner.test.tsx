/**
 * Which account signs a sign request, and "as" which account a multi signature is made.
 *
 * Runs the real account selection of the review (PreflightStep.loadSingingAccount) and the real signing
 * of the vault overlay (setSigners + signWithPrivateKey) with real keys, then reads the signed blob.
 *
 * Ledger rule behind it (checked on XRPL Testnet): a multi signature is made by a member of the signer
 * list of the transaction Account. The Account can not sign for itself: such a transaction is refused
 * ("fails local checks: Invalid multisigner."), with its master key and with its regular key alike.
 */
import * as AccountLib from 'xrpl-accountlib';
import { verify } from 'ripple-keypairs';

import NetworkService from '@services/NetworkService';
import LedgerService from '@services/LedgerService';
import { AccountRepository, CoreRepository } from '@store/repositories';
import { AccessLevels, EncryptionLevels } from '@store/types';

import Vault from '@common/libs/vault';
import { SignMixin } from '@common/libs/ledger/mixin/Sign.mixin';
import { AccountSet } from '@common/libs/ledger/transactions/genuine/AccountSet';
import { Batch } from '@common/libs/ledger/transactions/genuine/Batch';

import VaultOverlay from '@screens/Overlay/Vault/VaultOverlay';
import { AuthMethods } from '@screens/Overlay/Vault/types';

import PreflightStep from '../Steps/Preflight/PreflightStep';

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
jest.mock('@common/utils/tangem', () => ({ GetSignOptions: jest.fn(), GetWalletDerivedPublicKey: jest.fn() }));
jest.mock('@common/utils/tangemSession', () => ({ startTangemOfflineSession: jest.fn() }));
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
const keys = {
    A: AccountLib.derive.passphrase('xaman-test-multisign-A'),
    S: AccountLib.derive.passphrase('xaman-test-multisign-S'),
    K: AccountLib.derive.passphrase('xaman-test-multisign-K'),
    M: AccountLib.derive.passphrase('xaman-test-multisign-M'),
    X: AccountLib.derive.passphrase('xaman-test-multisign-X'),
};
type Name = keyof typeof keys;
const names = Object.keys(keys) as Name[];
const address = (name: Name) => String(keys[name].address);
const publicKey = (name: Name) => String(keys[name].keypair.publicKey);
const nameOf = (value?: string) =>
    names.find((name) => address(name) === value || publicKey(name) === value) ?? `unknown ${value}`;

type AccountOptions = { regularKey?: Name; readonly?: boolean; masterDisabled?: boolean; hidden?: boolean };
const model = (name: Name, options: AccountOptions = {}) => ({
    address: address(name),
    publicKey: publicKey(name),
    label: name,
    accessLevel: options.readonly ? AccessLevels.Readonly : AccessLevels.Full,
    encryptionLevel: EncryptionLevels.Passcode,
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
    pickSource?: Name; // the user picks another account in the review
    pickKey?: Name; // the user picks another key in the vault overlay ("Sign with")
};

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
    const context = { transaction, payload, setAccounts: jest.fn(), setSource: jest.fn() };
    const step = new PreflightStep({});
    (step as any).context = context;
    await step.loadSingingAccount();

    const offered: Model[] = context.setAccounts.mock.calls[0][0];
    let source: Model = context.setSource.mock.calls[0][0];
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
    jest.mocked(Vault.open).mockImplementation(
        (async (key: string) => keys[nameOf(key) as Name].keypair.privateKey) as any,
    );
    await (overlay as any).signWithPrivateKey(AuthMethods.PIN, { encryptionKey: 'passcode' });
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
    jest.clearAllMocks();
    jest.spyOn(NetworkService, 'getNetworkDefinitions').mockReturnValue(undefined as any);
    jest.spyOn(NetworkService, 'getNetworkId').mockReturnValue(0);
    (NetworkService as any).getNetwork = jest.fn(() => ({ id: 'network', key: 'TESTNET' }));
    (LedgerService as any).getLedgerStatus = jest.fn(() => ({ LastLedger: 1000 }));
});
afterEach(() => jest.restoreAllMocks());

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

    it('case 4: the user picks A and then the key of its regular key S: S signs as itself, not as A', async () => {
        const accounts = [model('A', { regularKey: 'S' }), model('S')];
        const result = await signRequest({ accounts, multisign: true, pickSource: 'A', pickKey: 'S' });

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

describe('unchanged: a multi sign request with only the transaction Account in the app', () => {
    // nothing better can be offered; the ledger does not accept this signature (as before)
    it('no forced signers, only A in the app: A is still offered and signs as A', async () => {
        const result = await signRequest({ accounts: [model('A')], multisign: true });

        expect(result).toMatchObject({ source: 'A', signerAccount: 'A', key: 'A', signatureValid: true });
    });

    it('A is the forced signer of its own transaction: A signs as A', async () => {
        const result = await signRequest({ accounts: [model('A'), model('S')], multisign: true, signers: ['A'] });

        expect(result).toMatchObject({ source: 'A', signerAccount: 'A', key: 'A', signatureValid: true });
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
