import { utils } from 'xrpl-accountlib';
import { Card, EllipticCurve } from 'tangem-sdk-react-native';

import { AccessLevels, AccountTypes } from '@store/types';
import { GetCardId, GetWalletDerivedPublicKey } from './tangem';

export type TangemBackupAccount = {
    address: string;
    label?: string;
    type?: string;
    publicKey?: string;
    accessLevel?: string;
    additionalInfo?: Card;
    additionalInfoString?: string;
    order?: number;
};

export type TangemBackupErrorCode =
    | 'cancelled'
    | 'contextChanged'
    | 'sourceUnavailable'
    | 'notActivated'
    | 'masterDisabled'
    | 'wrongSource'
    | 'sameCard'
    | 'invalidCard'
    | 'cardChanged'
    | 'softwareAccount'
    | 'accountChanged'
    | 'unavailable'
    | 'insufficientFee'
    | 'feeChanged'
    | 'failed'
    | 'expired';

export class TangemBackupError extends Error {
    constructor(public code: TangemBackupErrorCode) {
        super(code);
        this.name = 'TangemBackupError';
    }
}

export const backupCardSerial = (card?: Card): string => {
    try {
        return GetCardId(card!).trim().toUpperCase();
    } catch {
        return '';
    }
};

export const savedBackupCard = (account: TangemBackupAccount): Card | undefined => {
    try {
        return account.additionalInfo ?? JSON.parse(account.additionalInfoString || 'null') ?? undefined;
    } catch {
        return undefined;
    }
};

export const showTangemBackupWarning = (
    account: TangemBackupAccount & {
        balance?: number;
        sequence?: number;
        regularKey?: string;
        flags?: { disableMasterKey?: boolean };
    },
    networkKey?: string,
): boolean =>
    networkKey === 'MAINNET' &&
    account.type === AccountTypes.Tangem &&
    !!backupCardSerial(savedBackupCard(account)) &&
    ((account.sequence ?? 0) > 0 || (account.balance ?? 0) > 0) &&
    !account.flags?.disableMasterKey &&
    !account.regularKey;

export type BackupCandidate = {
    card: Card;
    address: string;
    publicKey: string;
    existing?: TangemBackupAccount;
};

/** A backup is a scanned card, never an address supplied by navigation or a text field. */
export const inspectBackupCard = (
    card: Card,
    source: { address: string; card: Card },
    accounts: TangemBackupAccount[],
): BackupCandidate => {
    const serial = backupCardSerial(card);
    if (!serial) throw new TangemBackupError('invalidCard');
    if (serial === backupCardSerial(source.card)) throw new TangemBackupError('sameCard');
    const curve = card.wallets?.[0]?.curve;
    if (curve && curve !== EllipticCurve.Secp256k1 && curve !== EllipticCurve.Ed25519) {
        throw new TangemBackupError('invalidCard');
    }
    let publicKey: string;
    let address: string;
    try {
        publicKey = GetWalletDerivedPublicKey(card);
        address = utils.deriveAddress(publicKey);
        if (!utils.isValidAddress(address)) throw new Error('Invalid card address');
    } catch {
        throw new TangemBackupError('invalidCard');
    }
    if (address === source.address) throw new TangemBackupError('sameCard');
    const serialAccount = accounts.find(
        (account) =>
            account.type === AccountTypes.Tangem && backupCardSerial(savedBackupCard(account)) === serial,
    );
    if (serialAccount && serialAccount.address !== address) throw new TangemBackupError('cardChanged');
    const existing = serialAccount ?? accounts.find((account) => account.address === address);
    if (existing?.accessLevel === AccessLevels.Full && existing.type !== AccountTypes.Tangem) {
        throw new TangemBackupError('softwareAccount');
    }
    if (existing?.type === AccountTypes.Tangem && backupCardSerial(savedBackupCard(existing)) !== serial) {
        throw new TangemBackupError('cardChanged');
    }
    return { card, address, publicKey, existing };
};
