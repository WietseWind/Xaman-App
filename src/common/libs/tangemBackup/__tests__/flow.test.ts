import { utils } from 'xrpl-accountlib';
import { Card } from 'tangem-sdk-react-native';
import { AccessLevels, AccountTypes } from '@store/types';
import { GetWalletDerivedPublicKey } from '@common/utils/tangem';
import { inspectBackupCard, showTangemBackupWarning } from '@common/utils/tangemBackup';
import fixtures from '@common/utils/__tests__/fixtures/tangem.cards.json';
import { BackupDependencies, BackupRoot, TangemBackupFlow } from '../flow';

const cards = [fixtures.multiCurrency.android, fixtures.multiCurrency.ios] as unknown as Card[];
// Public, synthetic card data only. A second supported public key gives a separate destination.
const sourceCard = { ...cards[0], cardId: 'SOURCE' };
const backupCard = {
    ...cards[0],
    cardId: 'BACKUP',
    settings: { ...cards[0].settings, isHDWalletAllowed: false },
    wallets: [
        {
            ...cards[0].wallets[0],
            publicKey: 'EDB4E6AC653A4D4B489466C478B7B3266C9D1D128B7EDCF7C0A453DAE68C931AB1',
        },
    ],
} as Card;
const source = {
    address: utils.deriveAddress(GetWalletDerivedPublicKey(sourceCard)),
    label: 'Original',
    card: sourceCard,
};
const address = utils.deriveAddress(GetWalletDerivedPublicKey(backupCard));
const account = {
    address,
    label: 'Existing name',
    type: AccountTypes.Tangem,
    accessLevel: AccessLevels.Full,
    additionalInfo: backupCard,
};
const defer = () => {
    let resolve!: (value?: any) => void;
    const promise = new Promise<any>((yes) => {
        resolve = yes;
    });
    return { promise, resolve };
};

const setup = (regularKey?: string) => {
    let root: BackupRoot = {
        Account: source.address,
        Balance: '100000000',
        Flags: 0,
        Sequence: 10,
        LedgerIndex: 1000,
        RegularKey: regularKey,
    };
    let network = { id: 'xrpl-main', key: 'MAINNET', networkId: 0, definitionsHash: 'definitions' };
    let valid = true;
    const deps: BackupDependencies = {
        network: () => network,
        valid: () => valid,
        root: jest.fn(async () => ({ ...root })),
        ledger: () => ({ Fee: 12, LastLedger: 1000 }),
        fee: jest.fn(async () => '12'),
        accounts: () => [],
        save: jest.fn(async () => account),
        start: jest.fn(async () => undefined),
        stop: jest.fn(async () => undefined),
        scan: jest.fn(async () => sourceCard),
        confirmImport: jest.fn(async () => true),
        create: jest.fn(async () => backupCard),
        sign: jest.fn(async () => ({ id: 'HASH', signedTransaction: 'BLOB' })),
        submit: jest.fn(async () => ({})),
        lookup: jest.fn(async () => ({})),
        refresh: jest.fn(async () => undefined),
    };
    const changed = jest.fn();
    const flow = new TangemBackupFlow(source, deps, changed);
    const ready = async () => {
        await flow.start();
        await flow.scanSource();
        deps.scan = jest.fn(async () => backupCard);
        await flow.scanBackup();
    };
    return {
        flow,
        deps,
        changed,
        ready,
        root: (changes: Partial<BackupRoot>) => {
            root = { ...root, ...changes };
        },
        network: (changes: Partial<typeof network>) => {
            network = { ...network, ...changes };
        },
        invalidate: () => {
            valid = false;
        },
    };
};

describe('Tangem back-up card security and lifecycle', () => {
    it('finishes scanning before the empty-card prompt and creates in a fresh NFC operation', async () => {
        const { flow, deps } = setup();
        await flow.start();
        await flow.scanSource();
        const empty = { ...backupCard, wallets: [] };
        const events: string[] = [];
        deps.scan = jest.fn(async () => {
            events.push('scan');
            return empty;
        });
        deps.start = jest.fn(async () => {
            events.push('start');
        });
        deps.stop = jest.fn(async () => {
            events.push('stop');
        });
        deps.confirmImport = jest.fn(async (card, isEmpty) => {
            expect(card).toBe(empty);
            expect(isEmpty).toBe(true);
            events.push('confirm');
            return true;
        });
        deps.create = jest.fn(async () => {
            events.push('create');
            return backupCard;
        });
        await flow.scanBackup();
        expect(events).toEqual(['start', 'scan', 'stop', 'confirm', 'start', 'create', 'stop']);
        expect(flow.state).toMatchObject({ step: 'ready', backup: { createdWallet: true, newlyAdded: true } });
        expect(deps.save).toHaveBeenCalledTimes(1);
    });
    it('lets an empty-card import be declined without a false scan-cancelled error or wallet creation', async () => {
        const { flow, deps } = setup();
        await flow.start();
        await flow.scanSource();
        deps.scan = jest.fn(async () => ({ ...backupCard, wallets: [] }));
        deps.confirmImport = jest.fn(async () => false);
        await flow.scanBackup();
        expect(flow.state).toMatchObject({ step: 'backup', busy: false, error: undefined });
        expect(deps.create).not.toHaveBeenCalled();
        expect(deps.save).not.toHaveBeenCalled();
    });
    it('imports a populated card missing from Xaman after confirmation without creating another wallet', async () => {
        const { flow, deps, ready } = setup();
        await ready();
        expect(deps.confirmImport).toHaveBeenCalledWith(backupCard, false);
        expect(deps.create).not.toHaveBeenCalled();
        expect(deps.save).toHaveBeenCalledTimes(1);
        expect(flow.state.step).toBe('ready');
    });
    it('does not create or import after the context changes while the import prompt is open', async () => {
        const { flow, deps, invalidate } = setup();
        await flow.start();
        await flow.scanSource();
        const prompt = defer();
        deps.scan = jest.fn(async () => ({ ...backupCard, wallets: [] }));
        deps.confirmImport = jest.fn(() => prompt.promise);
        const operation = flow.scanBackup();
        for (let i = 0; i < 12; i++) await Promise.resolve();
        expect(deps.confirmImport).toHaveBeenCalledTimes(1);
        invalidate();
        prompt.resolve(true);
        await operation;
        expect(flow.state.error).toBe('contextChanged');
        expect(deps.create).not.toHaveBeenCalled();
        expect(deps.save).not.toHaveBeenCalled();
    });
    it('rescans a card with a wallet after cancelled creation without creating it again', async () => {
        const { flow, deps } = setup();
        await flow.start();
        await flow.scanSource();
        deps.scan = jest.fn(async () => ({ ...backupCard, wallets: [] }));
        deps.create = jest.fn(async () => {
            throw Object.assign(new Error('The user cancelled the operation'), { code: '50002' });
        });
        await flow.scanBackup();
        expect(flow.state.error).toBe('cancelled');
        deps.scan = jest.fn(async () => backupCard);
        await flow.scanBackup();
        expect(flow.state).toMatchObject({ step: 'ready', error: undefined });
        expect(deps.create).toHaveBeenCalledTimes(1);
        expect(deps.save).toHaveBeenCalledTimes(1);
    });
    it('matches the source serial only, without deriving an address or signing', async () => {
        const { flow, deps } = setup();
        await flow.start();
        deps.scan = jest.fn(async () => ({ cardId: 'source', wallets: [] }) as unknown as Card);
        await flow.scanSource();
        expect(flow.state).toMatchObject({ step: 'backup', sourceVerified: true });
        expect(deps.sign).not.toHaveBeenCalled();
    });
    it('rejects the wrong original, retaining its serial for the result', async () => {
        const { flow, deps } = setup();
        await flow.start();
        deps.scan = jest.fn(async () => backupCard);
        await flow.scanSource();
        expect(flow.state).toMatchObject({ step: 'source', error: 'wrongSource', scannedSerial: 'BACKUP' });
    });
    it('blocks the same serial before creating a wallet', async () => {
        const { flow, deps } = setup();
        await flow.start();
        await flow.scanSource();
        await flow.scanBackup();
        expect(flow.state.error).toBe('sameCard');
        expect(deps.create).not.toHaveBeenCalled();
        expect(deps.save).not.toHaveBeenCalled();
    });
    it('blocks a different serial with the same address', () => {
        expect(() => inspectBackupCard({ ...sourceCard, cardId: 'OTHER' }, source, [])).toThrow('sameCard');
    });
    it('creates only on an empty card and imports silently', async () => {
        const { flow, deps } = setup();
        await flow.start();
        await flow.scanSource();
        deps.scan = jest.fn(async () => ({ ...backupCard, wallets: [] }));
        await flow.scanBackup();
        expect(flow.state.backup).toMatchObject({ newlyAdded: true, createdWallet: true });
        expect(deps.create).toHaveBeenCalledTimes(1);
        expect(deps.save).toHaveBeenCalledTimes(1);
    });
    it('preserves an imported card and its existing name', async () => {
        const { flow, deps, ready } = setup();
        deps.accounts = () => [account];
        await ready();
        expect(flow.state.backup?.account.label).toBe('Existing name');
        expect(deps.save).not.toHaveBeenCalled();
        expect(deps.create).not.toHaveBeenCalled();
    });
    it('rejects software accounts and changed imported cards', () => {
        expect(() => inspectBackupCard(backupCard, source, [{ ...account, type: AccountTypes.Regular }])).toThrow(
            'softwareAccount',
        );
        expect(() => inspectBackupCard(backupCard, source, [{ ...account, address: source.address }])).toThrow(
            'cardChanged',
        );
    });
    it('rejects a changed serial returned by wallet creation', async () => {
        const { flow, deps } = setup();
        await flow.start();
        await flow.scanSource();
        deps.scan = jest.fn(async () => ({ ...backupCard, wallets: [] }));
        deps.create = jest.fn(async () => ({ ...backupCard, cardId: 'CHANGED' }));
        await flow.scanBackup();
        expect(flow.state.error).toBe('cardChanged');
        expect(deps.save).not.toHaveBeenCalled();
    });
    it.each(['network', 'lock', 'remove'])(
        'stops late NFC results after a %s interruption and always cleans up',
        async (reason) => {
            const { flow, deps, network, invalidate } = setup();
            await flow.start();
            const scan = defer();
            deps.scan = jest.fn(() => scan.promise);
            const operation = flow.scanSource();
            await Promise.resolve();
            await Promise.resolve();
            if (reason === 'network') network({ id: 'xahau' });
            else invalidate();
            scan.resolve(sourceCard);
            await operation;
            expect(flow.state.error).toBe('contextChanged');
            expect(flow.state.sourceVerified).toBe(false);
            expect(deps.stop).toHaveBeenCalledTimes(1);
        },
    );
    it('waits for native NFC and stop before exiting; no late state update', async () => {
        const { flow, deps, changed } = setup();
        await flow.start();
        const scan = defer();
        const stop = defer();
        deps.scan = jest.fn(() => scan.promise);
        deps.stop = jest.fn(() => stop.promise);
        const operation = flow.scanSource();
        await Promise.resolve();
        await Promise.resolve();
        const exit = flow.exit();
        let closed = false;
        exit.then(() => {
            closed = true;
        });
        const count = changed.mock.calls.length;
        await Promise.resolve();
        expect(closed).toBe(false);
        scan.resolve(sourceCard);
        await Promise.resolve();
        await Promise.resolve();
        expect(closed).toBe(false);
        stop.resolve();
        await operation;
        await exit;
        expect(changed).toHaveBeenCalledTimes(count);
        expect(deps.stop).toHaveBeenCalledTimes(1);
    });
    it('retries cancelled scans with no import or submission', async () => {
        const { flow, deps } = setup();
        await flow.start();
        deps.scan = jest.fn(async () => {
            throw Object.assign(new Error('Cancelled'), { code: 50002 });
        });
        await flow.scanSource();
        expect(flow.state.error).toBe('cancelled');
        deps.scan = jest.fn(async () => sourceCard);
        await flow.scanSource();
        expect(flow.state.step).toBe('backup');
    });
    it('signs SetRegularKey with the original card even when replacing', async () => {
        const { flow, deps, ready, root } = setup('rOldKey');
        await ready();
        await flow.review();
        const tx = flow.state.transaction!;
        expect(tx).toEqual({
            TransactionType: 'SetRegularKey',
            Account: source.address,
            RegularKey: address,
            Fee: '12',
            Sequence: 10,
            LastLedgerSequence: 1150,
        });
        await flow.sign();
        expect(deps.sign).toHaveBeenCalledWith(sourceCard, tx);
        expect(flow.state.step).toBe('checking');
        root({ RegularKey: address });
        await flow.checkStatus();
        expect(flow.state.step).toBe('done');
        expect(deps.refresh).toHaveBeenCalledTimes(1);
    });
    it('supports selected Xahau with NetworkID and the quoted hook fee', async () => {
        const { flow, deps, network } = setup();
        network({ id: 'xahau', key: 'XAHAU', networkId: 21337 });
        // Context is captured by the flow constructor, so create a new flow after selecting the network.
        const selected = new TangemBackupFlow(source, deps, jest.fn());
        await selected.start();
        await selected.scanSource();
        deps.scan = jest.fn(async () => backupCard);
        await selected.scanBackup();
        deps.fee = jest.fn(async () => '120');
        await selected.review();
        expect(selected.state.transaction).toMatchObject({ NetworkID: 21337, Fee: '120' });
        expect(flow.state.step).toBe('intro');
    });
    it.each([{ Flags: 0x00100000 }, { RegularKey: 'rChanged' }, { Sequence: 11 }])(
        'rejects changed source after the signing scan: %j',
        async (changes) => {
            const { flow, deps, ready, root } = setup();
            await ready();
            await flow.review();
            deps.sign = jest.fn(async () => {
                root(changes);
                return { id: 'HASH', signedTransaction: 'BLOB' };
            });
            await flow.sign();
            expect(deps.submit).not.toHaveBeenCalled();
            expect(flow.state.error).toBeDefined();
        },
    );
    it('requires another explicit sign tap when the quoted fee changes', async () => {
        const { flow, deps, ready } = setup();
        await ready();
        await flow.review();
        deps.fee = jest.fn(async () => '15');
        await flow.sign();
        expect(flow.state.error).toBe('feeChanged');
        expect(flow.state.transaction?.Fee).toBe('15');
        expect(deps.sign).not.toHaveBeenCalled();
        await flow.sign();
        expect(deps.sign).toHaveBeenCalledTimes(1);
    });
    it('does not submit a signed transaction if the required fee rose during NFC', async () => {
        const { flow, deps, ready } = setup();
        await ready();
        await flow.review();
        deps.sign = jest.fn(async () => {
            deps.fee = jest.fn(async () => '20');
            return { id: 'HASH', signedTransaction: 'BLOB' };
        });
        await flow.sign();
        expect(deps.submit).not.toHaveBeenCalled();
        expect(flow.state).toMatchObject({ step: 'review', transaction: { Fee: '20' }, error: 'feeChanged' });
    });
    it('does not charge or sign when the scanned card is already the validated backup', async () => {
        const { flow, deps, ready } = setup(address);
        await ready();
        await flow.review();
        expect(flow.state.step).toBe('done');
        expect(deps.sign).not.toHaveBeenCalled();
        expect(deps.submit).not.toHaveBeenCalled();
        expect(deps.fee).not.toHaveBeenCalled();
    });
    it('never signs again while a timed-out submission may still validate', async () => {
        const { flow, deps, ready, root } = setup();
        await ready();
        await flow.review();
        deps.submit = jest.fn(async () => {
            throw new Error('timeout');
        });
        await flow.sign();
        await flow.sign();
        expect(deps.sign).toHaveBeenCalledTimes(1);
        expect(deps.submit).toHaveBeenCalledTimes(1);
        expect(flow.state.step).toBe('checking');
        root({ LedgerIndex: 1151 });
        await flow.checkStatus();
        expect(flow.state).toMatchObject({ step: 'ready', error: 'expired' });
    });
    it('does not call an unvalidated submission success done', async () => {
        const { flow, deps, ready } = setup();
        await ready();
        await flow.review();
        deps.lookup = jest.fn(async () => ({ validated: false, meta: { TransactionResult: 'tesSUCCESS' } }));
        await flow.sign();
        expect(flow.state.step).toBe('checking');
        expect(deps.refresh).not.toHaveBeenCalled();
    });
    it('handles validated failure without getting stuck on an empty review', async () => {
        const { flow, deps, ready } = setup();
        await ready();
        await flow.review();
        deps.lookup = jest.fn(async () => ({ validated: true, meta: { TransactionResult: 'tecFAILED' } }));
        await flow.sign();
        expect(flow.state).toMatchObject({ step: 'ready', error: 'failed' });
    });
    it('shows the Home warning only for eligible Mainnet Tangem accounts', () => {
        const eligible = { ...account, balance: 1, regularKey: undefined, flags: {} };
        expect(showTangemBackupWarning(eligible, 'MAINNET')).toBe(true);
        expect(showTangemBackupWarning({ ...eligible, balance: 0, sequence: 10 }, 'MAINNET')).toBe(true);
        for (const variation of [
            { balance: 0 },
            { regularKey: 'rKey' },
            { flags: { disableMasterKey: true } },
            { type: AccountTypes.Regular },
        ]) {
            expect(showTangemBackupWarning({ ...eligible, ...variation }, 'MAINNET')).toBe(false);
        }
        expect(showTangemBackupWarning(eligible, 'XAHAU')).toBe(false);
    });
});
