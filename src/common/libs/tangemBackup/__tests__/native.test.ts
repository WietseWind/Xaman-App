import { binary, derive, XrplDefinitions } from 'xrpl-accountlib';
import { sign as signBytes } from 'ripple-keypairs';
import RNTangemSdk, { EllipticCurve } from 'tangem-sdk-react-native';
import NetworkService from '@services/NetworkService';
import LedgerService from '@services/LedgerService';
import { AccountRepository } from '@store/repositories';
import { AccessLevels, AccountTypes } from '@store/types';
import fixtures from '@common/utils/__tests__/fixtures/tangem.cards.json';
import { DefaultDerivationPaths } from '@common/utils/tangem';
import { nativeBackupDependencies } from '../native';
import { Navigator } from '@common/helpers/navigator';
import Localize from '@locale';

jest.mock('@common/helpers/navigator', () => ({ Navigator: { showAlertModal: jest.fn(async () => 'alert') } }));

jest.mock('tangem-sdk-react-native', () => ({
    __esModule: true,
    EllipticCurve: { Secp256k1: 'secp256k1', Ed25519: 'ed25519' },
    default: {
        startSession: jest.fn(async () => undefined),
        stopSession: jest.fn(async () => undefined),
        scanCard: jest.fn(),
        createWallet: jest.fn(),
        sign: jest.fn(),
    },
}));
jest.mock('@services/NetworkService', () => ({
    __esModule: true,
    default: {
        getNetwork: () => ({ id: 'network', key: 'MAINNET', networkId: 0 }),
        getRawNetworkDefinitions: jest.fn(() => ({})),
        getNetworkDefinitions: jest.fn(),
        send: jest.fn(),
    },
}));
jest.mock('@services/LedgerService', () => ({
    __esModule: true,
    default: {
        getAccountInfo: jest.fn(),
        getLedgerStatus: jest.fn(),
        submitTransaction: jest.fn(),
        getTransaction: jest.fn(),
    },
}));
jest.mock('@services/AccountService', () => ({
    __esModule: true,
    default: { updateAccountInfo: jest.fn() },
}));
jest.mock('@store/repositories', () => ({
    AccountRepository: {
        updateDetails: jest.fn(async () => ({})),
        getAccounts: jest.fn(() => []),
        safeWrite: jest.fn(),
        emit: jest.fn(),
        realm: { create: jest.fn() },
    },
}));
jest.mock('@store/models', () => ({ AccountModel: class Account {} }));

const signer = derive.passphrase('Xaman Tangem backup public unit test fixture, never fund');
const card = {
    cardId: 'ORIGINAL',
    settings: { isHDWalletAllowed: false },
    wallets: [{ publicKey: signer.keypair.publicKey, curve: EllipticCurve.Secp256k1 }],
};
const source: any = {
    isValid: () => true,
    address: signer.address,
    type: AccountTypes.Tangem,
    accessLevel: AccessLevels.Full,
    additionalInfo: card,
};
const tx = {
    TransactionType: 'SetRegularKey' as const,
    Account: signer.address,
    Fee: '12',
    Sequence: 10,
    LastLedgerSequence: 1150,
    RegularKey: 'rQHGELnuopj4fWjsrbMA53ViqRLt5bS8Hb',
};
const signatureFor = (json: any) => {
    const der = Buffer.from(
        signBytes(
            binary.encodeForSigning({ ...json, SigningPubKey: signer.keypair.publicKey }),
            signer.keypair.privateKey,
        ),
        'hex',
    );
    const rLength = der[3];
    const sLength = der[5 + rLength];
    return [der.subarray(4, 4 + rLength), der.subarray(6 + rLength, 6 + rLength + sLength)]
        .map((part) => part.subarray(-32).toString('hex').padStart(64, '0'))
        .join('');
};
beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(AccountRepository.getAccounts).mockReturnValue([] as any);
    jest.mocked(AccountRepository.safeWrite).mockImplementation((callback) => callback());
    jest.mocked(AccountRepository.realm.create).mockImplementation((_model, values) => values as any);
    jest.mocked(NetworkService.getNetworkDefinitions).mockReturnValue(new XrplDefinitions(binary.DEFAULT_DEFINITIONS));
});

describe('native Tangem back-up adapter', () => {
    it.each([true, false])('uses the formatted import/create alert for an empty=%s card', async (empty) => {
        const operation = nativeBackupDependencies(source, () => true).confirmImport(card as any, empty);
        const alert = jest.mocked(Navigator.showAlertModal).mock.calls[0][0];
        expect(alert.testID).toBe('backup-import-alert');
        expect(alert.type).toBe(empty ? 'info' : 'warning');
        if (empty) {
            expect(alert.title).toBe(Localize.t('tangemImportMsgs.newTitle'));
            expect(alert.text).toBe(Localize.t('tangemBackup.enableNewCard'));
        }
        expect(alert.buttons.map((button) => button.text)).toEqual([
            Localize.t('global.cancel'),
            Localize.t('global.continue'),
        ]);
        alert.onDismissed?.();
        alert.buttons[1].onPress?.();
        expect(await operation).toBe(true);
    });
    it('declines import when its alert is dismissed without choosing Continue', async () => {
        const operation = nativeBackupDependencies(source, () => true).confirmImport(card as any, true);
        const alert = jest.mocked(Navigator.showAlertModal).mock.calls[0][0];
        alert.onDismissed?.();
        expect(await operation).toBe(false);
        expect(RNTangemSdk.createWallet).not.toHaveBeenCalled();
    });
    it('opts out of online attestation and provides the XRP HD path for every session', async () => {
        const deps = nativeBackupDependencies(source, () => true);
        await deps.start();
        await deps.stop();
        expect(RNTangemSdk.startSession).toHaveBeenCalledWith({
            attestationMode: 'offline',
            defaultDerivationPaths: DefaultDerivationPaths,
        });
        expect(RNTangemSdk.stopSession).toHaveBeenCalledTimes(1);
    });
    it('verifies the actual card signature and encodes precisely the reviewed transaction', async () => {
        const deps = nativeBackupDependencies(source, () => true);
        jest.mocked(RNTangemSdk.sign).mockResolvedValue({
            cardId: 'original',
            signatures: [signatureFor(tx)],
        });
        const signed = await deps.sign(card as any, tx);
        expect(binary.decode(signed.signedTransaction)).toEqual({
            ...tx,
            SigningPubKey: signer.keypair.publicKey,
            TxnSignature: expect.any(String),
        });
        expect(signed.id).toMatch(/^[A-F0-9]{64}$/);
        expect(RNTangemSdk.sign).toHaveBeenCalledWith(
            expect.objectContaining({ cardId: 'ORIGINAL', hashes: [expect.any(String)] }),
        );
    });
    it('signs an Ed25519 original card using the complete signing message', async () => {
        const ed = derive.privatekey(`ED${'01'.repeat(32)}`);
        const edCard = {
            ...card,
            cardId: 'ED-ORIGINAL',
            wallets: [{ publicKey: ed.keypair.publicKey.slice(2), curve: EllipticCurve.Ed25519 }],
        };
        const edTx = { ...tx, Account: ed.address };
        const message = binary.encodeForSigning({ ...edTx, SigningPubKey: ed.keypair.publicKey });
        jest.mocked(RNTangemSdk.sign).mockResolvedValue({
            cardId: edCard.cardId,
            signatures: [signBytes(message, ed.keypair.privateKey)],
        });
        const signed = await nativeBackupDependencies(
            { ...source, address: ed.address, additionalInfo: edCard },
            () => true,
        ).sign(edCard as any, edTx);
        expect(binary.decode(signed.signedTransaction)).toMatchObject({
            Account: ed.address,
            RegularKey: tx.RegularKey,
            SigningPubKey: ed.keypair.publicKey,
        });
        expect(RNTangemSdk.sign).toHaveBeenCalledWith(
            expect.objectContaining({ hashes: [message], cardId: edCard.cardId }),
        );
    });

    it.each(['wrong serial', 'invalid signature', 'zero scalar'])(
        'rejects a %s before returning any blob',
        async (reason) => {
            const deps = nativeBackupDependencies(source, () => true);
            jest.mocked(RNTangemSdk.sign).mockResolvedValue({
                cardId: reason === 'wrong serial' ? 'BACKUP' : 'ORIGINAL',
                signatures: [
                    reason === 'zero scalar'
                        ? '00'.repeat(64)
                        : reason === 'invalid signature'
                          ? '01'.repeat(64)
                          : signatureFor(tx),
                ],
            });
            await expect(deps.sign(card as any, tx)).rejects.toThrow();
        },
    );
    it('rejects an unvalidated account response', async () => {
        jest.mocked(LedgerService.getAccountInfo).mockResolvedValue({
            validated: false,
            account_data: { Account: signer.address },
        } as any);
        await expect(nativeBackupDependencies(source, () => true).root(signer.address)).rejects.toThrow('unavailable');
    });
    it('uses the selected-network hook-inclusive fee without a silent fee fallback', async () => {
        jest.mocked(NetworkService.send).mockResolvedValue({
            drops: { base_fee: '12' },
            fee_hooks_feeunits: '120',
        } as any);
        expect(await nativeBackupDependencies(source, () => true).fee(tx)).toBe('120');
        jest.mocked(NetworkService.send).mockResolvedValue({ error: 'offline' } as any);
        await expect(nativeBackupDependencies(source, () => true).fee(tx)).rejects.toThrow('unavailable');
    });
    it('adds public Tangem metadata at the end of the custom account order', async () => {
        const backup = { ...fixtures.normalED.android, cardId: 'BACKUP' } as any;
        const { utils } = require('xrpl-accountlib');
        const { GetWalletDerivedPublicKey } = require('@common/utils/tangem');
        const publicKey = GetWalletDerivedPublicKey(backup);
        const address = utils.deriveAddress(publicKey);
        jest.mocked(AccountRepository.getAccounts).mockReturnValue([{ address: 'rOther', order: 9 }] as any);
        await nativeBackupDependencies(source, () => true).save(backup, address, publicKey);
        expect(AccountRepository.realm.create).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                address,
                publicKey,
                type: AccountTypes.Tangem,
                accessLevel: AccessLevels.Full,
                encryptionLevel: 'Physical',
                order: 10,
                additionalInfoString: JSON.stringify(backup),
            }),
            expect.anything(),
        );
        expect(AccountRepository.emit).toHaveBeenCalledWith('accountCreate', expect.objectContaining({ address }));
    });
    it('preserves a read-only account label, hidden state and order during a proven-card upgrade', async () => {
        const backup = { ...fixtures.normalED.android, cardId: 'BACKUP' } as any;
        const { utils } = require('xrpl-accountlib');
        const { GetWalletDerivedPublicKey } = require('@common/utils/tangem');
        const publicKey = GetWalletDerivedPublicKey(backup);
        const address = utils.deriveAddress(publicKey);
        jest.mocked(AccountRepository.getAccounts).mockReturnValue([
            {
                address,
                label: 'Keep my label',
                hidden: true,
                order: 7,
                type: AccountTypes.Regular,
                accessLevel: AccessLevels.Readonly,
            },
        ] as any);
        await nativeBackupDependencies(source, () => true).save(backup, address, publicKey);
        const fields = jest.mocked(AccountRepository.realm.create).mock.calls[0][1];
        expect(fields).not.toHaveProperty('label');
        expect(fields).not.toHaveProperty('hidden');
        expect(fields).not.toHaveProperty('order');
        expect(fields).toHaveProperty('type', AccountTypes.Tangem);
    });
    it('updates the cached link from the already validated root without another RPC', async () => {
        const deps = nativeBackupDependencies(source, () => true);
        await deps.refresh({
            Account: signer.address,
            RegularKey: tx.RegularKey,
            Sequence: 11,
            Balance: '99999988',
            Flags: 0,
            LedgerIndex: 1001,
        });
        expect(AccountRepository.updateDetails).toHaveBeenCalledWith(
            signer.address,
            expect.objectContaining({
                id: `${signer.address}.network.network`,
                regularKey: tx.RegularKey,
                sequence: 11,
                balance: 99.999988,
            }),
            expect.any(Function),
        );
        expect(LedgerService.getAccountInfo).not.toHaveBeenCalled();
    });
    it('rechecks the context at the actual deferred Realm write boundary', async () => {
        let valid = true;
        let write!: () => void;
        jest.mocked(AccountRepository.safeWrite).mockImplementation((callback) => {
            write = callback;
        });
        const deps = nativeBackupDependencies(source, () => valid);
        const save = deps.save({ ...card, cardId: 'BACKUP' } as any, tx.RegularKey, signer.keypair.publicKey);
        valid = false;
        write();
        await expect(save).rejects.toThrow('contextChanged');
        expect(AccountRepository.realm.create).not.toHaveBeenCalled();
    });
});


it('encodes and verifies a real removal signature with no RegularKey field', async () => {
    const removal: Omit<typeof tx, 'RegularKey'> & { RegularKey?: string } = { ...tx };
    delete removal.RegularKey;
    jest.mocked(RNTangemSdk.sign).mockResolvedValue({ cardId: card.cardId, signatures: [signatureFor(removal)] });
    const result = await nativeBackupDependencies(source, () => true).sign(card as any, removal);
    const decoded = binary.decode(result.signedTransaction);
    expect(decoded.TransactionType).toBe('SetRegularKey');
    expect(decoded.Account).toBe(source.address);
    expect(decoded).not.toHaveProperty('RegularKey');
});
