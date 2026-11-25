/**
 * Issue 491: a Batch seen by an account that is only the recipient of one inner transaction.
 * Fixture: mainnet Batch D55CE005…24AB99 (an OfferCreate, a Payment to a third account, a Payment to the recipient).
 */
import React from 'react';
import renderer from 'react-test-renderer';

import { AmountText } from '@components/General';
import { Navigator } from '@common/helpers/navigator';
import { ExplainerFactory, TransactionFactory } from '@common/libs/ledger/factory';
import { MixingTypes } from '@common/libs/ledger/mixin/types';
import { BatchInfo } from '@common/libs/ledger/transactions/genuine/Batch';
import LedgerService from '@services/LedgerService';
import Localize from '@locale';

import { hasOwnEffect } from '../../EventsList/EventListItems/thirdParty';
import Monetary from '../../EventsList/EventListItems/Blocks/Monetary';
import BatchTransactions from '../BatchTransactions';
import fixture from './fixtures/batchThirdPartyRecipient.json';

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

const SENDER = fixture.parent.Account;
const RECIPIENT = 'rwietsevLFg8XSmG3bEZzFein1g8RBqWDZ';
const STRANGER = 'rrrrrrrrrrrrrrrrrrrrBZbvji';
const RLUSD = '524C555344000000000000000000000000000000';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const TransactionRow = () => null;
const getTransaction = LedgerService.getTransaction as jest.Mock;

const elements = (node: React.ReactNode): React.ReactElement<any>[] =>
    React.Children.toArray(node).flatMap((child) =>
        React.isValidElement(child) ? [child, ...elements((child.props as any).children)] : [],
    );

const batchItem = () =>
    TransactionFactory.fromLedger({ tx: clone(fixture.parent), meta: clone(fixture.parentMeta) } as any, [
        MixingTypes.Mutation,
    ]);

const widgetFor = (address: string, responses?: any[], onBatchInnerLoaded?: jest.Mock) => {
    const replies = clone(responses ?? fixture.innerResponses);
    getTransaction.mockImplementation(
        async (hash: string) => replies.find((response) => response.hash === hash) || { error: 'txnNotFound' },
    );
    const account = { address };
    const widget = new BatchTransactions({
        item: batchItem(),
        account,
        TransactionComponent: TransactionRow,
        onBatchInnerLoaded,
    } as any);
    jest.spyOn(widget, 'setState').mockImplementation((update) => {
        Object.assign(widget.state, typeof update === 'function' ? update(widget.state, widget.props) : update);
    });
    return { widget, account };
};

const rowsOf = (widget: BatchTransactions) =>
    elements(widget.render())
        .filter((element) => element.type === TransactionRow)
        .map((element) => element.props);

// what the Events row shows for this item and account: the amounts, or nothing for a third party row
const shownFor = (row: ReturnType<typeof rowsOf>[number]) => {
    const explainer = ExplainerFactory.fromTransaction(row.item, row.account);
    const thirdPartyRow = !hasOwnEffect(row.item, row.account.address, row.showDespiteThirdParty);
    const tree = renderer.create(<Monetary explainer={explainer} />);
    const amounts = tree.root.findAllByType(AmountText).map((element) => ({
        value: element.props.value,
        currency: element.props.currency,
        prefix: element.props.prefix,
    }));
    tree.unmount();
    return { thirdPartyRow, amounts: thirdPartyRow ? [] : amounts, label: explainer.getEventsLabel() };
};

const headerFor = (address: string, innerTransactions?: any[]) => {
    const explainer = ExplainerFactory.fromTransaction(batchItem(), { address } as any) as unknown as BatchInfo;
    if (innerTransactions) {
        explainer.setInnerTransactions(innerTransactions);
    }
    return explainer;
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('the fixture', () => {
    it('is the Batch of the issue: the recipient is not its account and has no part in its own metadata', () => {
        const item = batchItem();
        expect(item.Account).toBe(SENDER);
        expect(item.hash).toBe('D55CE005E3E00679A4EFFE64F21D9F8C3A6C4AAE796F90F5B5DCD12C8524AB99');
        expect(item.RawTransactions).toHaveLength(3);
        expect(item.BalanceChange(RECIPIENT)).toEqual({ INC: [], DEC: [] });
        fixture.innerResponses.forEach((response) => expect(response.meta.ParentBatchID).toBe(item.hash));
    });
});

describe('inner transactions, seen by the recipient of one of them', () => {
    it('shows every inner row for the account we are looking with, not for its sender', async () => {
        const { widget, account } = widgetFor(RECIPIENT);
        await widget.fetchInnerTransactions();
        const rows = rowsOf(widget);
        expect(rows).toHaveLength(3);
        rows.forEach((row) => {
            expect(row.account).toBe(account);
            expect(row.showDespiteThirdParty).toBe(false);
            expect(row.notFound).toBe(false);
            expect(row.isReplayed).toBe(false);
        });
    });

    it('shows no amounts for the inner transactions that did not affect the account', async () => {
        const { widget } = widgetFor(RECIPIENT);
        await widget.fetchInnerTransactions();
        const [offer, paymentToOther] = rowsOf(widget).map(shownFor);
        expect(offer).toEqual(expect.objectContaining({ thirdPartyRow: true, amounts: [] }));
        expect(paymentToOther).toEqual(expect.objectContaining({ thirdPartyRow: true, amounts: [] }));
        // and no "sent" or "received" wording for a payment between two other accounts
        expect(paymentToOther.label).toBe(Localize.t('global.payment'));
    });

    it('shows the Payment to the account as received, with a positive amount', async () => {
        const { widget } = widgetFor(RECIPIENT);
        await widget.fetchInnerTransactions();
        const paymentToMe = shownFor(rowsOf(widget)[2]);
        expect(paymentToMe.thirdPartyRow).toBe(false);
        expect(paymentToMe.label).toBe(Localize.t('events.paymentReceived'));
        expect(paymentToMe.amounts).toEqual([{ value: '0.009675', currency: 'XRP', prefix: undefined }]);
    });

    it('opens an inner transaction for the account we are looking with', async () => {
        jest.useFakeTimers();
        try {
            const { widget, account } = widgetFor(RECIPIENT);
            await widget.fetchInnerTransactions();
            rowsOf(widget)[2].onPress();
            await Promise.resolve();
            await Promise.resolve();
            jest.runOnlyPendingTimers();
            expect(Navigator.showModal).toHaveBeenCalledTimes(1);
            const [, details] = (Navigator.showModal as jest.Mock).mock.calls[0];
            expect(details.account).toBe(account);
            expect(details.item.hash).toBe(fixture.innerResponses[2].hash);
            expect(details.item.BalanceChange(RECIPIENT)).toEqual({
                INC: [{ action: 'INC', currency: 'XRP', value: '0.009675' }],
                DEC: [],
            });
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('inner transactions, seen by the account that sent the Batch', () => {
    it('shows its own amounts on every row, as before', async () => {
        const { widget, account } = widgetFor(SENDER);
        await widget.fetchInnerTransactions();
        const rows = rowsOf(widget);
        rows.forEach((row) => expect(row.account).toBe(account));
        const [offer, paymentToOther, paymentToRecipient] = rows.map(shownFor);
        expect(offer.thirdPartyRow).toBe(false);
        expect(offer.amounts).toEqual([
            { value: '9.774495', currency: 'XRP', prefix: undefined },
            { value: '10.03', currency: RLUSD, prefix: '-' },
        ]);
        expect(paymentToOther).toEqual({
            thirdPartyRow: false,
            label: Localize.t('events.paymentSent'),
            amounts: [{ value: '0.067732', currency: 'XRP', prefix: '-' }],
        });
        expect(paymentToRecipient).toEqual({
            thirdPartyRow: false,
            label: Localize.t('events.paymentSent'),
            amounts: [{ value: '0.009675', currency: 'XRP', prefix: '-' }],
        });
    });
});

describe('inner transactions, seen by an account that has no part in the Batch', () => {
    it('shows no amounts at all', async () => {
        const { widget } = widgetFor(STRANGER);
        await widget.fetchInnerTransactions();
        rowsOf(widget)
            .map(shownFor)
            .forEach((shown) => expect(shown).toEqual(expect.objectContaining({ thirdPartyRow: true, amounts: [] })));
    });
});

describe('inner transactions that did not run in this Batch', () => {
    it('keep their full row for the failed marker, and stay untappable when not found', async () => {
        const responses = clone(fixture.innerResponses).slice(0, 2);
        responses[1].meta.ParentBatchID = 'F'.repeat(64);
        const { widget } = widgetFor(RECIPIENT, responses);
        await widget.fetchInnerTransactions();
        const [ran, replayed, missing] = rowsOf(widget);
        expect([ran.showDespiteThirdParty, ran.notFound, ran.isReplayed]).toEqual([false, false, false]);
        expect([replayed.showDespiteThirdParty, replayed.notFound, replayed.isReplayed]).toEqual([true, false, true]);
        expect([missing.showDespiteThirdParty, missing.notFound, missing.isReplayed]).toEqual([true, true, false]);
        missing.onPress();
        expect(Navigator.showModal).not.toHaveBeenCalled();
    });
});

describe('the Batch itself: what it did to the account includes its inner transactions', () => {
    it('reports the inner transactions once they are looked up', async () => {
        const onBatchInnerLoaded = jest.fn();
        const { widget } = widgetFor(RECIPIENT, fixture.innerResponses, onBatchInnerLoaded);
        expect(onBatchInnerLoaded).not.toHaveBeenCalled();
        const inner = await widget.fetchInnerTransactions();
        expect(onBatchInnerLoaded).toHaveBeenCalledTimes(1);
        expect(onBatchInnerLoaded).toHaveBeenCalledWith(inner);
        expect(inner).toHaveLength(3);
    });

    it('does not report anything when the lookup fails', async () => {
        const onBatchInnerLoaded = jest.fn();
        const { widget } = widgetFor(RECIPIENT, fixture.innerResponses, onBatchInnerLoaded);
        getTransaction.mockRejectedValue(new Error('timeout'));
        await widget.fetchInnerTransactions();
        expect(onBatchInnerLoaded).not.toHaveBeenCalled();
    });

    it('makes no claim about the balance until the inner transactions are loaded', () => {
        const header = headerFor(RECIPIENT);
        expect(header.isBalanceEffectKnown()).toBe(false);
        expect(header.getMonetaryDetails().mutate).toEqual({ INC: [], DEC: [] });
    });

    it('for the recipient: the amount received through the inner Payment', async () => {
        const { widget } = widgetFor(RECIPIENT);
        const header = headerFor(RECIPIENT, await widget.fetchInnerTransactions());
        expect(header.isBalanceEffectKnown()).toBe(true);
        expect(header.getMonetaryDetails().mutate).toEqual({
            INC: [{ action: 'INC', currency: 'XRP', value: '0.009675' }],
            DEC: [],
        });
    });

    it('for the sender: the net result of the inner transactions', async () => {
        const { widget } = widgetFor(SENDER);
        const header = headerFor(SENDER, await widget.fetchInnerTransactions());
        const { mutate } = header.getMonetaryDetails();
        // 9.774495 from the offer, minus the two payments of 0.067732 and 0.009675
        expect(mutate.INC).toEqual([{ action: 'INC', currency: 'XRP', value: '9.697088' }]);
        expect(mutate.DEC).toEqual([expect.objectContaining({ action: 'DEC', currency: RLUSD, value: '10.03' })]);
    });

    it('for an account that has no part in it: known, and no balance change', async () => {
        const { widget } = widgetFor(STRANGER);
        const header = headerFor(STRANGER, await widget.fetchInnerTransactions());
        expect(header.isBalanceEffectKnown()).toBe(true);
        expect(header.getMonetaryDetails().mutate).toEqual({ INC: [], DEC: [] });
    });

    it('leaves out an inner transaction that ran outside this Batch, or not at all', async () => {
        const responses = clone(fixture.innerResponses);
        responses[2].meta.ParentBatchID = 'F'.repeat(64);
        const replayed = widgetFor(RECIPIENT, responses);
        expect(
            headerFor(RECIPIENT, await replayed.widget.fetchInnerTransactions()).getMonetaryDetails().mutate,
        ).toEqual({ INC: [], DEC: [] });

        const missing = widgetFor(RECIPIENT, fixture.innerResponses.slice(0, 2));
        expect(headerFor(RECIPIENT, await missing.widget.fetchInnerTransactions()).getMonetaryDetails().mutate).toEqual(
            { INC: [], DEC: [] },
        );
    });

    it('keeps the label and the description of the Batch', async () => {
        const { widget } = widgetFor(RECIPIENT);
        const before = headerFor(RECIPIENT);
        const after = headerFor(RECIPIENT, await widget.fetchInnerTransactions());
        expect(after.getEventsLabel()).toBe(before.getEventsLabel());
        expect(after.generateDescription()).toBe(before.generateDescription());
        expect(after.getParticipants()).toEqual(before.getParticipants());
    });
});
