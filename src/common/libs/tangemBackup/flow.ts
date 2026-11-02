import { Card } from 'tangem-sdk-react-native';
import BigNumber from 'bignumber.js';
import { AccessLevels, AccountTypes } from '@store/types';

import {
    backupCardSerial,
    inspectBackupCard,
    TangemBackupAccount,
    TangemBackupError,
    TangemBackupErrorCode,
} from '@common/utils/tangemBackup';

export type BackupNetwork = { id: string; key: string; networkId: number; definitionsHash: string };
export type BackupRoot = {
    Account: string;
    Balance: string;
    Sequence: number;
    Flags: number;
    LedgerIndex: number;
    RegularKey?: string;
};
export type BackupTransaction = {
    TransactionType: 'SetRegularKey';
    Account: string;
    RegularKey: string;
    Fee: string;
    Sequence: number;
    LastLedgerSequence: number;
    NetworkID?: number;
};
export type BackupSigned = { id: string; signedTransaction: string };
export type BackupState = {
    step: 'intro' | 'source' | 'backup' | 'ready' | 'review' | 'checking' | 'done';
    busy: boolean;
    sourceVerified: boolean;
    backup?: { account: TangemBackupAccount; card: Card; newlyAdded: boolean; createdWallet: boolean };
    transaction?: BackupTransaction;
    existingKey?: string;
    scannedSerial?: string;
    error?: TangemBackupErrorCode;
};
export interface BackupDependencies {
    network: () => BackupNetwork;
    valid: () => boolean;
    root: (address: string) => Promise<BackupRoot>;
    fee: (transaction: BackupTransaction) => Promise<string>;
    ledger: () => { Fee: number; LastLedger: number };
    accounts: () => TangemBackupAccount[];
    save: (card: Card, address: string, publicKey: string) => Promise<TangemBackupAccount>;
    start: () => Promise<void>;
    stop: () => Promise<void>;
    scan: () => Promise<Card>;
    confirmImport: (card: Card, empty: boolean) => Promise<boolean>;
    create: (card: Card) => Promise<Card>;
    sign: (card: Card, transaction: BackupTransaction) => Promise<BackupSigned>;
    submit: (blob: string, hash: string) => Promise<unknown>;
    lookup: (hash: string) => Promise<{
        validated?: boolean;
        ledger_index?: number;
        meta?: { TransactionResult?: string };
    }>;
    refresh: (root: BackupRoot) => Promise<unknown>;
}

/** Owns NFC operations and the single ledger change; the screen only renders its state. */
export class TangemBackupFlow {
    state: BackupState = { step: 'intro', busy: false, sourceVerified: false };
    private readonly network: BackupNetwork;
    private closed = false;
    private initialKey?: string;
    private initialized = false;
    private pending?: BackupSigned & { transaction: BackupTransaction };
    private cardOperation: Promise<void> = Promise.resolve();

    constructor(
        readonly source: { address: string; label?: string; card: Card },
        private readonly deps: BackupDependencies,
        private readonly changed: (state: BackupState) => void,
    ) {
        this.network = { ...deps.network() };
    }

    private check = () => {
        if (
            this.closed ||
            !this.deps.valid() ||
            JSON.stringify(this.network) !== JSON.stringify(this.deps.network())
        ) {
            throw new TangemBackupError('contextChanged');
        }
    };

    private update = (state: Partial<BackupState>) => {
        if (!this.closed) {
            this.state = { ...this.state, ...state };
            this.changed(this.state);
        }
    };

    private run = async (operation: () => Promise<void>) => {
        if (this.state.busy || this.closed) return;
        this.update({ busy: true, error: undefined });
        try {
            this.check();
            await operation();
        } catch (error: any) {
            const cancelled =
                String(error?.code) === '50002' || error?.message === 'The user cancelled the operation';
            this.update({
                error: cancelled
                    ? 'cancelled'
                    : error instanceof TangemBackupError
                      ? error.code
                      : 'unavailable',
            });
        } finally {
            this.update({ busy: false });
        }
    };

    private withCard = async <T>(operation: () => Promise<T>): Promise<T> => {
        let finish: () => void = () => undefined;
        this.cardOperation = new Promise<void>((resolve) => {
            finish = resolve;
        });
        let started = false;
        try {
            await this.deps.start();
            started = true;
            this.check();
            const result = await operation();
            this.check();
            return result;
        } finally {
            try {
                if (started) await this.deps.stop();
            } finally {
                finish();
            }
        }
    };

    private loadRoot = async (unchanged = true): Promise<BackupRoot> => {
        this.check();
        const root = await this.deps.root(this.source.address);
        this.check();
        if (
            !root ||
            root.Account !== this.source.address ||
            !Number.isInteger(root.Sequence) ||
            root.Sequence < 1 ||
            !Number.isSafeInteger(root.Flags) ||
            !Number.isSafeInteger(root.LedgerIndex) ||
            root.LedgerIndex < 1 ||
            !new BigNumber(root.Balance).isFinite() ||
            new BigNumber(root.Balance).isNegative()
        ) {
            throw new TangemBackupError('unavailable');
        }
        if (root.Flags & 0x00100000) throw new TangemBackupError('masterDisabled');
        if (unchanged && this.initialized && root.RegularKey !== this.initialKey) {
            throw new TangemBackupError('accountChanged');
        }
        return root;
    };

    start = () =>
        this.run(async () => {
            if (this.state.step !== 'intro') return;
            const root = await this.loadRoot();
            this.initialKey = root.RegularKey;
            this.initialized = true;
            this.update({ existingKey: root.RegularKey, step: 'source' });
        });

    scanSource = () =>
        this.run(async () => {
            if (this.state.step !== 'source' || !this.initialized) {
                throw new TangemBackupError('sourceUnavailable');
            }
            const card = await this.withCard(this.deps.scan);
            this.update({ scannedSerial: backupCardSerial(card) });
            // Step one deliberately checks only the serial, never an address/signature.
            if (!backupCardSerial(card) || backupCardSerial(card) !== backupCardSerial(this.source.card)) {
                throw new TangemBackupError('wrongSource');
            }
            this.update({ sourceVerified: true, step: 'backup' });
        });

    scanBackup = () =>
        this.run(async () => {
            if (this.state.step !== 'backup' || !this.state.sourceVerified) {
                throw new TangemBackupError('sourceUnavailable');
            }
            let createdWallet = false;
            let card = await this.withCard(this.deps.scan);
            this.check();
            const serial = backupCardSerial(card);
            if (!serial) throw new TangemBackupError('invalidCard');
            if (serial === backupCardSerial(this.source.card)) throw new TangemBackupError('sameCard');
            const empty = Array.isArray(card.wallets) && card.wallets.length === 0;
            // Finish the scan before showing the normal import/create confirmation.
            // Wallet creation is a separate, user-initiated NFC operation on the same card.
            const candidate = empty ? undefined : inspectBackupCard(card, this.source, this.deps.accounts());
            if (empty || !candidate?.existing || candidate.existing.accessLevel !== AccessLevels.Full) {
                const confirmed = await this.deps.confirmImport(card, empty);
                this.check();
                if (!confirmed) return;
            }
            if (empty) {
                const scanned = card;
                card = await this.withCard(() => this.deps.create(scanned));
                this.check();
                if (backupCardSerial(card) !== serial) throw new TangemBackupError('cardChanged');
                createdWallet = true;
            }
            // Re-read at the write boundary: another import may have completed during NFC.
            const current = inspectBackupCard(card, this.source, this.deps.accounts());
            const needsSave =
                !current.existing ||
                current.existing.type !== AccountTypes.Tangem ||
                current.existing.accessLevel !== AccessLevels.Full;
            const account = needsSave
                ? await this.deps.save(card, current.address, current.publicKey)
                : current.existing!;
            this.check();
            this.update({
                step: 'ready',
                backup: { card, account, newlyAdded: !current.existing, createdWallet },
            });
        });

    private prepare = async (): Promise<BackupTransaction | undefined> => {
        const { backup, sourceVerified } = this.state;
        if (!sourceVerified || !backup) throw new TangemBackupError('sourceUnavailable');
        // A confirmed link may be discovered after a retry; never charge for a no-op.
        const root = await this.loadRoot(false);
        if (root.RegularKey === backup.account.address) {
            await this.deps.refresh(root);
            this.check();
            this.update({ step: 'done' });
            return undefined;
        }
        if (root.RegularKey !== this.initialKey) throw new TangemBackupError('accountChanged');
        const { Fee, LastLedger } = this.deps.ledger();
        if (
            !Number.isSafeInteger(Math.ceil(Fee)) ||
            Fee <= 0 ||
            !Number.isInteger(LastLedger) ||
            LastLedger < 1
        ) {
            throw new TangemBackupError('unavailable');
        }
        const transaction: BackupTransaction = {
            TransactionType: 'SetRegularKey',
            Account: this.source.address,
            RegularKey: backup.account.address,
            Fee: String(Math.ceil(Fee)),
            Sequence: root.Sequence,
            LastLedgerSequence: LastLedger + 150,
            ...(this.network.networkId > 1024 ? { NetworkID: this.network.networkId } : {}),
        };
        const fee = await this.deps.fee(transaction);
        this.check();
        if (!/^\d+$/.test(fee) || new BigNumber(fee).isLessThan(1)) {
            throw new TangemBackupError('unavailable');
        }
        if (new BigNumber(root.Balance).isLessThan(fee)) throw new TangemBackupError('insufficientFee');
        return { ...transaction, Fee: fee };
    };

    review = () =>
        this.run(async () => {
            if (this.state.step !== 'ready') return;
            const transaction = await this.prepare();
            if (transaction) this.update({ step: 'review', transaction });
        });

    sign = () =>
        this.run(async () => {
            if (this.pending) {
                await this.checkPending();
                return;
            }
            const reviewed = this.state.transaction;
            if (this.state.step !== 'review' || !reviewed) throw new TangemBackupError('sourceUnavailable');
            const transaction = await this.prepare();
            if (!transaction) return;
            if (transaction.Fee !== reviewed.Fee) {
                this.update({ transaction, error: 'feeChanged' });
                return;
            }
            const signed = await this.withCard(() => this.deps.sign(this.source.card, transaction));
            this.check();
            const signingFee = await this.deps.fee(transaction);
            this.check();
            if (!/^\d+$/.test(signingFee) || new BigNumber(signingFee).isLessThan(1)) {
                throw new TangemBackupError('unavailable');
            }
            const root = await this.loadRoot();
            if (new BigNumber(root.Balance).isLessThan(transaction.Fee)) {
                throw new TangemBackupError('insufficientFee');
            }
            if (new BigNumber(signingFee).isGreaterThan(transaction.Fee)) {
                this.update({ transaction: { ...transaction, Fee: signingFee }, error: 'feeChanged' });
                return;
            }
            if (root.Sequence !== transaction.Sequence) throw new TangemBackupError('accountChanged');
            if (root.LedgerIndex > transaction.LastLedgerSequence) throw new TangemBackupError('expired');
            if (!signed.id || !signed.signedTransaction) throw new TangemBackupError('failed');
            this.pending = { ...signed, transaction };
            this.update({ step: 'checking', transaction });
            // A transport failure can happen after acceptance. Keep the same hash for status checks.
            try {
                await this.deps.submit(signed.signedTransaction, signed.id);
            } catch {
                /* Check validated state below. */
            }
            this.check();
            await this.checkPending();
        });

    checkStatus = () => this.run(this.checkPending);

    private checkPending = async () => {
        const { pending } = this;
        if (!pending) return;
        this.check();
        let receipt: Awaited<ReturnType<BackupDependencies['lookup']>> | undefined;
        try {
            receipt = await this.deps.lookup(pending.id);
        } catch {
            /* Validated account state remains authoritative. */
        }
        this.check();
        const root = await this.loadRoot(false);
        if (root.RegularKey === pending.transaction.RegularKey) {
            await this.deps.refresh(root);
            this.check();
            this.pending = undefined;
            this.update({ step: 'done', error: undefined });
            return;
        }
        if (receipt?.validated && receipt.meta?.TransactionResult !== 'tesSUCCESS') {
            this.pending = undefined;
            this.update({ step: 'ready', transaction: undefined, error: 'failed' });
            return;
        }
        if (
            receipt?.validated &&
            receipt.meta?.TransactionResult === 'tesSUCCESS' &&
            root.LedgerIndex >= (receipt.ledger_index ?? 0)
        ) {
            throw new TangemBackupError('accountChanged');
        }
        if (!receipt?.validated && root.LedgerIndex > pending.transaction.LastLedgerSequence) {
            this.pending = undefined;
            this.update({ step: 'ready', transaction: undefined, error: 'expired' });
            return;
        }
        this.update({ step: 'checking' });
    };

    back = () => {
        if (this.state.busy || this.pending || this.closed) return;
        if (this.state.step === 'done') return;
        const step = this.state.step === 'review' ? 'ready' : this.state.sourceVerified ? 'backup' : 'intro';
        this.update({ step, error: undefined, transaction: undefined });
    };

    exit = async () => {
        this.closed = true;
        await this.cardOperation;
    };
}
