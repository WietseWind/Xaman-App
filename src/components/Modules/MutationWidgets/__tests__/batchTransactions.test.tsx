import React from 'react';
import renderer from 'react-test-renderer';

import { AmountText } from '@components/General';
import { Navigator } from '@common/helpers/navigator';
import { ExplainerFactory, TransactionFactory } from '@common/libs/ledger/factory';
import { MixingTypes } from '@common/libs/ledger/mixin/types';
import LedgerService from '@services/LedgerService';
import Localize from '@locale';

import Monetary from '../../EventsList/EventListItems/Blocks/Monetary';
import BatchTransactions from '../BatchTransactions';
import fixture from './fixtures/batchSelfSwaps.json';

jest.mock('@services/NetworkService');
jest.mock('@services/LedgerService', () => ({
    __esModule: true,
    default: { getTransaction: jest.fn() },
}));
jest.mock('@common/helpers/navigator', () => ({
    Navigator: { dismissModal: jest.fn(async () => undefined), showModal: jest.fn() },
}));
jest.mock('@components/General', () => ({ AmountText: () => null }));
jest.mock('@theme', () => ({ AppStyles: {} }));
jest.mock('../styles', () => ({}));
jest.mock('../../EventsList/EventListItems/Blocks/styles', () => ({}));

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const account = { address: fixture.parent.Account };
const TransactionRow = () => null;
const getTransaction = LedgerService.getTransaction as jest.Mock;

const elements = (node: React.ReactNode): React.ReactElement<any>[] =>
    React.Children.toArray(node).flatMap(child => React.isValidElement(child)
        ? [child, ...elements((child.props as any).children)] : []);

const widgetFor = (parent = fixture.parent, responses = fixture.innerResponses) => {
    const replies = clone(responses);
    getTransaction.mockImplementation(async (hash: string) =>
        replies.find(response => response.hash === hash) || { error: 'txnNotFound' });
    const item = TransactionFactory.fromJson(clone(parent) as any, [MixingTypes.Mutation]);
    const widget = new BatchTransactions({
        item, account, TransactionComponent: TransactionRow,
    } as any);
    jest.spyOn(widget, 'setState').mockImplementation(update => {
        Object.assign(widget.state, typeof update === 'function' ? update(widget.state, widget.props) : update);
    });
    return widget;
};

const rowsOf = (widget: BatchTransactions) => elements(widget.render())
    .filter(element => element.type === TransactionRow).map(element => element.props);

const amountsFor = (row: ReturnType<typeof rowsOf>[number]) => {
    const explainer = ExplainerFactory.fromTransaction(row.item, row.account);
    const tree = renderer.create(<Monetary explainer={explainer} />);
    const amounts = tree.root.findAllByType(AmountText).map(element => ({
        value: element.props.value, currency: element.props.currency, prefix: element.props.prefix,
    }));
    tree.unmount();
    return { amounts, explainer };
};

beforeEach(() => {
    jest.clearAllMocks();
});

it('shows the actual received and spent amounts for both reported self-swaps', async () => {
    const widget = widgetFor();
    await widget.fetchInnerTransactions();
    const rows = rowsOf(widget);
    expect(rows).toHaveLength(2);

    rows.forEach((row, index) => {
        const { amounts, explainer } = amountsFor(row);
        expect(amounts).toEqual([
            { value: '1.28660781', currency: fixture.innerResponses[index].Amount.currency, prefix: undefined },
            { value: '1', currency: 'XRP', prefix: '-' },
        ]);
        expect(explainer.getEventsLabel()).toBe(Localize.t('events.exchangedAssets'));
        expect(row.item.MetaData).toEqual(fixture.innerResponses[index].meta);
        expect(row.notFound).toBe(false);
        expect(row.isReplayed).toBe(false);
    });
});

it('matches the Events monetary display without changing either original payment', async () => {
    const parent = clone(fixture.parent);
    const before = JSON.stringify(parent);
    const widget = widgetFor(parent);
    await widget.fetchInnerTransactions();

    rowsOf(widget).forEach((row, index) => {
        const response = fixture.innerResponses[index];
        const eventItem = TransactionFactory.fromLedger({ tx: response, meta: response.meta } as any,
            [MixingTypes.Mutation]);
        expect(amountsFor(row).amounts).toEqual(amountsFor({ item: eventItem, account }).amounts);
        expect(row.item.JsonForSigning).toEqual({
            ...TransactionFactory.fromJson(parent.RawTransactions[index].RawTransaction as any).JsonForSigning,
            hash: response.hash,
        });
        expect(row.item.Amount.value).toBe('994673548.8615462');
        expect(row.item.DeliverMin.value).toBe('1.27604561');
        expect(row.item.hash).toBe(response.hash);
    });
    expect(JSON.stringify(parent)).toBe(before);
});

it('keeps separate metadata for inner transactions with different execution results', async () => {
    const responses = clone(fixture.innerResponses);
    responses[1].meta.AffectedNodes = [];
    responses[1].meta.TransactionResult = 'tecPATH_DRY';
    const widget = widgetFor(fixture.parent, responses);
    await widget.fetchInnerTransactions();
    const [success, failed] = rowsOf(widget);
    expect(amountsFor(success).amounts).toHaveLength(2);
    expect(failed.item.MetaData.TransactionResult).toBe('tecPATH_DRY');
    expect(failed.item.BalanceChange(account.address)).toEqual({ INC: [], DEC: [] });
    expect(amountsFor(failed).explainer.getEventsLabel()).toBe(Localize.t('global.payment'));
    expect(failed.notFound).toBe(false);
});

it('keeps unavailable inner transactions marked as not found and untappable', async () => {
    const widget = widgetFor(fixture.parent, fixture.innerResponses.slice(0, 1));
    await widget.fetchInnerTransactions();
    const [found, missing] = rowsOf(widget);
    expect(found.notFound).toBe(false);
    expect(missing.notFound).toBe(true);
    expect(missing.item.BalanceChange(account.address)).toEqual({ INC: [], DEC: [] });
    missing.onPress();
    expect(Navigator.dismissModal).not.toHaveBeenCalled();
    expect(Navigator.showModal).not.toHaveBeenCalled();
    expect(widget.state.loadingInner).toBe(false);
});

it('retains replay detection when an inner transaction belongs to a different Batch', async () => {
    const responses = clone(fixture.innerResponses);
    responses[0].meta.ParentBatchID = 'F'.repeat(64);
    const widget = widgetFor(fixture.parent, responses);
    await widget.fetchInnerTransactions();
    expect(rowsOf(widget).map(row => row.isReplayed)).toEqual([true, false]);
});

it('retains the template fallback when an inner lookup has no execution metadata yet', async () => {
    const widget = widgetFor();
    getTransaction.mockImplementation(async (hash: string) => hash === fixture.innerResponses[1].hash
        ? { ...clone(fixture.innerResponses[1]), meta: undefined, validated: false }
        : clone(fixture.innerResponses[0]));
    await widget.fetchInnerTransactions();
    const [executed, pending] = rowsOf(widget);
    expect(amountsFor(executed).amounts).toHaveLength(2);
    expect(pending.item.MetaData).toEqual({});
    expect(pending.item.Amount.value).toBe('994673548.8615462');
    expect(pending.isReplayed).toBe(true);
    expect(widget.state.loadingInner).toBe(false);
});

it('preserves ordinary outgoing-payment amounts from metadata', async () => {
    const response = clone(fixture.innerResponses[0]);
    const tx = {
        ...fixture.parent.RawTransactions[0].RawTransaction,
        Amount: '2500000',
        Destination: fixture.innerResponses[0].Amount.issuer,
        SendMax: undefined,
        DeliverMin: undefined,
    };
    const root = response.meta.AffectedNodes.find(node => node.ModifiedNode.LedgerEntryType === 'AccountRoot')!;
    root.ModifiedNode.PreviousFields = { Balance: '10000000', Sequence: 2412 } as any;
    root.ModifiedNode.FinalFields = { Account: account.address, Balance: '7500000', Sequence: 2413 } as any;
    const reply = { ...response, ...tx, meta: { ...response.meta, AffectedNodes: [root] } };
    const widget = widgetFor();
    jest.spyOn(widget, 'encodeInnerTransaction').mockImplementation(() => ({
        transaction: TransactionFactory.fromJson(tx as any, [MixingTypes.Mutation]), hash: reply.hash,
    }));
    getTransaction.mockResolvedValue(reply);
    await widget.fetchInnerTransactions();
    expect(amountsFor(rowsOf(widget)[0]).amounts).toEqual([
        { value: '2.5', currency: 'XRP', prefix: '-' },
    ]);
});

it('still opens the selected inner transaction with its ledger metadata', async () => {
    jest.useFakeTimers();
    try {
        const widget = widgetFor();
        await widget.fetchInnerTransactions();
        const row = rowsOf(widget)[1];
        row.onPress();
        await Promise.resolve();
        await Promise.resolve();
        jest.runOnlyPendingTimers();
        expect(Navigator.dismissModal).toHaveBeenCalledTimes(1);
        expect(Navigator.showModal).toHaveBeenCalledTimes(1);
        const [, details] = (Navigator.showModal as jest.Mock).mock.calls[0];
        expect(details.item.hash).toBe(fixture.innerResponses[1].hash);
        expect(details.item.MetaData).toEqual(fixture.innerResponses[1].meta);
        expect(details.account.address).toBe(account.address);
        expect(amountsFor({ item: details.item, account: details.account }).amounts).toEqual(amountsFor(row).amounts);
    } finally {
        jest.useRealTimers();
    }
});
