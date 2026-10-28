import { omit } from 'lodash';
import React from 'react';
import { InteractionManager, Text } from 'react-native';
import renderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { binary, XrplDefinitions } from 'xrpl-accountlib';

import NetworkService from '@services/NetworkService';
import ResolverService from '@services/ResolverService';
import DataStorage from '@store/storage';

import { AMMClawback, Batch, FallbackTransaction, LedgerStateFix } from '@common/libs/ledger/transactions';

import { AmountText, JsonTree } from '@components/General';
import { AccountElement, CurrencyElement, FeePicker } from '@components/Modules';
import UniversalTransactionWarning from '@components/Modules/TransactionData/UniversalTransactionWarning';

import AMMClawbackTemplate from '../AMMClawback';
import LedgerStateFixTemplate from '../LedgerStateFix';
import BatchTemplate from '../Batch';
import { FallbackTemplate } from '../../fallback';

jest.mock('@services/NetworkService');
jest.mock('@services/LedgerService');

const Issuer = 'rhpHaFggC92ELty3n3yDEtuFgWxXWkUFET';
const Holder = 'rUwaiErsYE5kibUUtaPczXZVVd73VNy4R9';
const BookDirectory = '7E7B4A4BA5F2A0C3D7A9C0E2D0D7C6B5A4F3E2D1C0B0A0905038D7EA4C68000';

const ammClawback = {
    TransactionType: 'AMMClawback',
    Account: Issuer,
    Holder,
    Asset: { currency: 'USD', issuer: Issuer },
    Asset2: { currency: 'XRP' },
    Amount: { currency: 'USD', issuer: Issuer, value: '1000' },
    Fee: '12',
    Sequence: 5,
};

const ledgerStateFix = {
    TransactionType: 'LedgerStateFix',
    Account: Holder,
    LedgerFixType: 1,
    Owner: Issuer,
    Fee: '200000',
    Sequence: 13,
};

const xChainCommit = {
    TransactionType: 'XChainCommit',
    Account: Holder,
    XChainBridge: {
        LockingChainDoor: Issuer,
        LockingChainIssue: { currency: 'XRP' },
        IssuingChainDoor: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
        IssuingChainIssue: { currency: 'XRP' },
    },
    XChainClaimID: '13F',
    Amount: '10000',
    OtherChainDestination: Issuer,
    Fee: '0',
    Sequence: 6,
    SigningPubKey: '',
    Flags: 0x40000000,
};

const batchOf = (inner: Record<string, any>): Batch =>
    new Batch({
        TransactionType: 'Batch',
        Account: Issuer,
        Fee: '40',
        Sequence: 5,
        Flags: 0x00010000,
        RawTransactions: [{ RawTransaction: inner }],
    } as any);

const render = (Template: any, transaction: any): ReactTestRenderer => {
    let tree: ReactTestRenderer;
    act(() => {
        tree = renderer.create(
            <Template
                transaction={transaction}
                source={{ address: transaction.Account }}
                payload={{ isMultiSign: () => false, isPathFinding: () => false }}
                setLoading={() => {}}
                setReady={() => {}}
                forceRender={() => {}}
            />,
        );
    });
    return tree!;
};

const texts = (tree: ReactTestRenderer): string[] =>
    tree.root.findAllByType(Text).map((node) => ([] as any[]).concat(node.props.children).join(''));

describe('Review templates', () => {
    let storage: DataStorage;

    beforeAll(async () => {
        // the Batch template looks its inner accounts up in the store
        if (DataStorage.isDataStoreFileExist()) {
            DataStorage.wipe();
        }
        storage = new DataStorage();
        await storage.initialize();

        // run the templates' deferred work inside the test, and resolve names without the store or backend
        jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((task?: any) => {
            if (typeof task === 'function') task();
            return { then: jest.fn(), done: jest.fn(), cancel: jest.fn() } as any;
        });
        jest.spyOn(ResolverService, 'getAccountName').mockResolvedValue({} as any);
    });

    afterAll(() => {
        DataStorage.wipe();
        storage.close();
    });

    beforeEach(() => {
        jest.spyOn(NetworkService, 'getNetworkDefinitions').mockReturnValue(
            new XrplDefinitions(binary.DEFAULT_DEFINITIONS),
        );
    });
    afterEach(() => {
        (NetworkService.getNetworkDefinitions as jest.Mock).mockRestore();
        // the mocked NetworkService has no getAvailableNetworkFee; a test that needs it adds its own
        delete (NetworkService as any).getAvailableNetworkFee;
    });

    describe('AMMClawback', () => {
        it('shows the Holder, Asset, Asset2 and Amount it declares', () => {
            const tree = render(AMMClawbackTemplate, new AMMClawback(ammClawback as any));

            expect(Object.keys(AMMClawback.Fields).sort()).toEqual(['Amount', 'Asset', 'Asset2', 'Holder']);
            expect(texts(tree)).toEqual(expect.arrayContaining(['Holder', 'Asset', 'Asset 2', 'Amount']));
            expect(tree.root.findAllByType(AccountElement).map((node) => node.props.address)).toEqual([Holder]);
            expect(
                tree.root
                    .findAllByType(CurrencyElement)
                    .map((node) => ({ currency: node.props.currency, issuer: node.props.issuer })),
            ).toEqual([
                { currency: 'USD', issuer: Issuer },
                { currency: 'XRP', issuer: undefined },
            ]);
            expect(
                tree.root
                    .findAllByType(AmountText)
                    .map((node) => ({ value: node.props.value, currency: node.props.currency })),
            ).toEqual([{ value: '1000', currency: 'USD' }]);
        });

        it('shows no amount when Amount is not set', () => {
            const tree = render(AMMClawbackTemplate, new AMMClawback({ ...ammClawback, Amount: undefined } as any));

            expect(tree.root.findAllByType(AmountText)).toHaveLength(0);
            expect(texts(tree)).not.toContain('Amount');
        });
    });

    describe('LedgerStateFix', () => {
        it('shows the LedgerFixType and Owner of an NFToken page link fix', () => {
            const tree = render(LedgerStateFixTemplate, new LedgerStateFix(ledgerStateFix as any));

            expect(Object.keys(LedgerStateFix.Fields).sort()).toEqual(['BookDirectory', 'LedgerFixType', 'Owner']);
            expect(texts(tree)).toEqual(expect.arrayContaining(['Fix type', 'NFToken page links', 'Owner']));
            expect(texts(tree)).not.toContain('Book directory');
            expect(tree.root.findAllByType(AccountElement).map((node) => node.props.address)).toEqual([Issuer]);
        });

        it('shows the LedgerFixType and BookDirectory of a book exchange rate fix', () => {
            const tree = render(
                LedgerStateFixTemplate,
                new LedgerStateFix({ ...ledgerStateFix, LedgerFixType: 2, Owner: undefined, BookDirectory } as any),
            );

            expect(texts(tree)).toEqual(
                expect.arrayContaining(['Fix type', 'Order book exchange rate', 'Book directory', BookDirectory]),
            );
            expect(tree.root.findAllByType(AccountElement)).toHaveLength(0);
        });

        it('shows the number of a LedgerFixType it does not know', () => {
            const tree = render(
                LedgerStateFixTemplate,
                new LedgerStateFix({ ...ledgerStateFix, LedgerFixType: 9 } as any),
            );

            expect(texts(tree)).toEqual(expect.arrayContaining(['Fix type', '9']));
        });
    });

    describe('Batch', () => {
        it('reviews an AMMClawback inner transaction through the AMMClawback template', () => {
            const inner = { ...ammClawback, Fee: '0', Sequence: 6, SigningPubKey: '', Flags: 0x40000000 };

            const tree = render(BatchTemplate, batchOf(inner));

            const [template] = tree.root.findAllByType(AMMClawbackTemplate);
            expect(template.props.transaction).toBeInstanceOf(AMMClawback);
            expect(template.props.transaction.Holder).toBe(Holder);
        });

        it('reviews an inner transaction Xaman has no model for through the fallback template', () => {
            let tree: ReactTestRenderer;
            expect(() => {
                tree = render(BatchTemplate, batchOf(xChainCommit));
            }).not.toThrow();

            const [template] = tree!.root.findAllByType(FallbackTemplate);
            expect(template.props.transaction).toBeInstanceOf(FallbackTransaction);
            const [json] = template.findAllByType(JsonTree);
            expect(json.props.data).toEqual(xChainCommit);
            const jsonSection = template.findByProps({ testID: 'universal-transaction-json' });
            expect(jsonSection.findAllByType(UniversalTransactionWarning)).toHaveLength(0);
            expect(template.findAllByType(UniversalTransactionWarning)).toHaveLength(1);
            const shown = texts(tree!);
            expect(shown).toEqual(expect.arrayContaining([
                'XChainBridge.LockingChainDoor',
                'XChainBridge.IssuingChainDoor',
            ]));
            expect(shown.join(' ')).toContain('no specific screen');
            expect(shown.join(' ')).not.toContain('Extra fields');
            expect(shown.join(' ')).not.toContain('cannot fully decode');
        });

        it('shows no fee picker for an inner transaction without Fee under the fallback template', async () => {
            (NetworkService as any).getAvailableNetworkFee = jest.fn().mockResolvedValue({
                availableFees: [{ type: 'LOW', value: '12' }],
                feeHooks: 0,
                suggested: 'LOW',
            });

            const tree = render(BatchTemplate, batchOf(omit(xChainCommit, 'Fee')));
            // let a fee picker's fetched fee reach the template
            await act(async () => {});

            const [template] = tree.root.findAllByType(FallbackTemplate);
            expect(template.findAllByType(FeePicker)).toHaveLength(0);
            const [json] = template.findAllByType(JsonTree);
            expect(json.props.data).not.toHaveProperty('Fee');
        });
    });
});
