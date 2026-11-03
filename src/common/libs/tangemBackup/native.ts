import Realm from 'realm';
import BigNumber from 'bignumber.js';
import RNTangemSdk, { Card, EllipticCurve } from 'tangem-sdk-react-native';
import { rawSigning, utils } from 'xrpl-accountlib';

import NetworkService from '@services/NetworkService';
import LedgerService from '@services/LedgerService';
import { accountDetailsId } from '@common/helpers/accountNetwork';
import { AccountModel } from '@store/models';
import { AccountRepository } from '@store/repositories';
import { AccessLevels, AccountTypes, EncryptionLevels } from '@store/types';
import { DefaultDerivationPaths, GetSignOptions, GetWalletDerivedPublicKey } from '@common/utils/tangem';
import { startTangemOfflineSession } from '@common/utils/tangemSession';
import { waitForTangemIdentifyCleanup } from '@common/utils/tangemIdentifyNavigation';
import { Navigator } from '@common/helpers/navigator';
import { NormalizeFeeDataSet, PrepareTxForHookFee } from '@common/utils/fee';
import {
    backupCardSerial,
    savedBackupCard,
    inspectBackupCard,
    TangemBackupError,
} from '@common/utils/tangemBackup';
import Localize from '@locale';

import { BackupDependencies, BackupNetwork } from './flow';

export const backupNetwork = (): BackupNetwork => {
    const network = NetworkService.getNetwork();
    return {
        id: network.id.toString(),
        key: network.key,
        networkId: network.networkId,
        definitionsHash: JSON.stringify(NetworkService.getRawNetworkDefinitions()),
    };
};

/** Uses the normal codec and native signing primitives, with the original card as the only signer. */
export const nativeBackupDependencies = (source: AccountModel, valid: () => boolean): BackupDependencies => {
    const card = JSON.parse(JSON.stringify(savedBackupCard(source) || {})) as Card;
    const definitions = NetworkService.getNetworkDefinitions();
    const network = backupNetwork();
    const current = () => {
        try {
            return (
                valid() &&
                JSON.stringify(network) === JSON.stringify(backupNetwork()) &&
                source.isValid() &&
                source.type === AccountTypes.Tangem &&
                source.accessLevel === AccessLevels.Full &&
                backupCardSerial(source.additionalInfo) === backupCardSerial(card) &&
                GetWalletDerivedPublicKey(source.additionalInfo!) === GetWalletDerivedPublicKey(card)
            );
        } catch {
            return false;
        }
    };
    const check = () => {
        if (!current()) throw new TangemBackupError('contextChanged');
    };
    return {
        network: backupNetwork,
        valid: current,
        accounts: () => Array.from(AccountRepository.getAccounts()),
        root: async (address) => {
            check();
            const response = await LedgerService.getAccountInfo(address);
            check();
            if ('error' in response) {
                throw new TangemBackupError(
                    response.error === 'actNotFound' ? 'notActivated' : 'unavailable',
                );
            }
            if (!response.validated) throw new TangemBackupError('unavailable');
            return { ...response.account_data, LedgerIndex: response.ledger_index } as any;
        },
        ledger: LedgerService.getLedgerStatus,
        fee: async (transaction) => {
            check();
            const response = await NetworkService.send<any, any>({
                command: 'fee',
                tx_blob: PrepareTxForHookFee(transaction, definitions, network.networkId),
            });
            check();
            if (response.error || !response.drops?.base_fee) throw new TangemBackupError('unavailable');
            const normalized = NormalizeFeeDataSet(response);
            return new BigNumber(normalized.availableFees[0].value).plus(normalized.feeHooks).toFixed(0);
        },
        start: async () => {
            await waitForTangemIdentifyCleanup();
            check();
            await startTangemOfflineSession({ defaultDerivationPaths: DefaultDerivationPaths });
        },
        stop: RNTangemSdk.stopSession,
        scan: () => RNTangemSdk.scanCard({ initialMessage: { body: Localize.t('account.tangemScanHint') } }),
        confirmImport: (_scanned, empty) =>
            new Promise<boolean>((resolve, reject) => {
                const finish = (confirmed: boolean) => resolve(confirmed && current());
                Navigator.showAlertModal({
                    testID: 'backup-import-alert',
                    type: empty ? 'info' : 'warning',
                    title: Localize.t(empty ? 'tangemImportMsgs.newTitle' : 'tangemImportMsgs.existingTitle'),
                    text: empty
                        ? Localize.t('tangemBackup.enableNewCard')
                        : `${Localize.t('tangemImportMsgs.existingDescription')}\n\n${Localize.t('tangemImportMsgs.existingDescriptionAfter')}`,
                    buttons: [
                        {
                            text: Localize.t('global.cancel'),
                            testID: 'backup-import-cancel',
                            onPress: () => finish(false),
                            type: 'dismiss',
                            light: true,
                        },
                        {
                            text: Localize.t('global.continue'),
                            testID: 'backup-import-continue',
                            onPress: () => finish(true),
                            type: 'continue',
                        },
                    ],
                    // AlertOverlay calls this immediately before its button callback.
                    onDismissed: () => {
                        Promise.resolve().then(() => finish(false));
                    },
                }).catch(reject);
            }),
        create: async (scanned) => {
            check();
            const supported = scanned.supportedCurves || [];
            const curve = supported.includes(EllipticCurve.Secp256k1)
                ? EllipticCurve.Secp256k1
                : supported.includes(EllipticCurve.Ed25519)
                  ? EllipticCurve.Ed25519
                  : undefined;
            if (!curve) throw new TangemBackupError('invalidCard');
            const result = await RNTangemSdk.createWallet({
                cardId: backupCardSerial(scanned),
                curve,
                initialMessage: { body: Localize.t('tangemBackup.backupTitle') },
            });
            check();
            if (String(result.cardId).toUpperCase() !== backupCardSerial(scanned)) {
                throw new TangemBackupError('cardChanged');
            }
            return { ...scanned, wallets: [result.wallet] };
        },
        save: async (scanned, address, publicKey) => {
            // Keep the selected account and all existing labels/preferences. No secret is imported.
            const saved = await new Promise<AccountModel>((resolve, reject) => {
                AccountRepository.safeWrite(() => {
                    try {
                        check();
                        const accounts = Array.from(AccountRepository.getAccounts());
                        const candidate = inspectBackupCard(
                            scanned,
                            { address: source.address, card },
                            accounts,
                        );
                        if (candidate.address !== address || candidate.publicKey !== publicKey) {
                            throw new TangemBackupError('cardChanged');
                        }
                        const { existing } = candidate;
                        resolve(
                            AccountRepository.realm.create(
                                AccountModel,
                                {
                                    address,
                                    publicKey,
                                    type: AccountTypes.Tangem,
                                    accessLevel: AccessLevels.Full,
                                    encryptionLevel: EncryptionLevels.Physical,
                                    additionalInfoString: JSON.stringify(scanned),
                                    ...(!existing
                                        ? {
                                              label: Localize.t('tangemBackup.title'),
                                              order:
                                                  Math.max(-1, ...accounts.map((item) => item.order ?? -1)) +
                                                  1,
                                          }
                                        : {}),
                                },
                                existing ? Realm.UpdateMode.Modified : Realm.UpdateMode.Never,
                            ),
                        );
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            AccountRepository.emit('accountCreate', saved);
            return saved;
        },
        sign: async (original, transaction) => {
            check();
            const publicKey = GetWalletDerivedPublicKey(original);
            if (utils.deriveAddress(publicKey) !== source.address) throw new TangemBackupError('cardChanged');
            const prepared = rawSigning.prepare(transaction, publicKey, false, definitions);
            const result = await RNTangemSdk.sign({
                ...GetSignOptions(original, prepared.hashToSign),
                hashes: [prepared.hashToSign],
                initialMessage: { body: Localize.t('tangemBackup.sourceTitle') },
            });
            check();
            if (String(result.cardId).toUpperCase() !== backupCardSerial(original)) {
                throw new TangemBackupError('wrongSource');
            }
            const signature =
                typeof result.signatures === 'string' ? result.signatures : result.signatures?.[0];
            // Reject malformed/zero scalars before the codec's DER conversion (zero R can loop there).
            const hex = String(signature || '')
                .trim()
                .replace(/^0x/i, '');
            const normalized = hex.includes(',')
                ? hex
                      .split(',')
                      .map((byte) => {
                          if (!/^\d{1,3}$/.test(byte.trim()) || Number(byte) > 255) {
                              throw new TangemBackupError('failed');
                          }
                          return Number(byte).toString(16).padStart(2, '0');
                      })
                      .join('')
                : hex;
            if (!/^[a-f0-9]{128}$/i.test(normalized)) throw new TangemBackupError('failed');
            if (!publicKey.startsWith('ED')) {
                const order = new BigNumber(
                    'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141',
                    16,
                );
                for (const scalar of [normalized.slice(0, 64), normalized.slice(64)]) {
                    const value = new BigNumber(scalar, 16);
                    if (value.isZero() || value.isGreaterThanOrEqualTo(order)) {
                        throw new TangemBackupError('failed');
                    }
                }
            }
            const signed = rawSigning.complete(prepared, normalized, definitions);
            if (
                !signed.signatureVerifies ||
                signed.type !== 'SignedTx' ||
                !signed.id ||
                !signed.signedTransaction
            ) {
                throw new TangemBackupError('failed');
            }
            return signed;
        },
        submit: (blob, hash) => {
            check();
            return LedgerService.submitTransaction(blob, hash);
        },
        lookup: (hash) => {
            check();
            return LedgerService.getTransaction(hash) as any;
        },
        refresh: (root) => {
            check();
            // Apply the already validated root directly. A second RPC must not leave a stale warning
            // or prevent confirmation if connectivity drops immediately after ledger validation.
            const selected = NetworkService.getNetwork();
            return AccountRepository.updateDetails(
                source.address,
                {
                    id: accountDetailsId(source.address, selected),
                    network: selected,
                    regularKey: root.RegularKey ?? '',
                    sequence: root.Sequence,
                    balance: new BigNumber(root.Balance).dividedBy(1e6).toNumber(),
                },
                current,
            );
        },
    };
};
