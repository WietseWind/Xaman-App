/**
 * Issue 491: the details screen rebuilds the explainer of a Batch once its inner transactions are looked up, and
 * hands the callback for that to the widgets.
 */
import fs from 'fs';
import path from 'path';

import { TransactionFactory } from '@common/libs/ledger/factory';
import { MixingTypes } from '@common/libs/ledger/mixin/types';
import { BatchInfo } from '@common/libs/ledger/transactions/genuine/Batch';

import fixture from '@components/Modules/MutationWidgets/__tests__/fixtures/batchThirdPartyRecipient.json';

import TransactionDetailsView from '../DetailsView';

jest.mock('@services/NetworkService');
jest.mock('@services/BackendService', () => ({ __esModule: true, default: { getAccountAdvisory: jest.fn() } }));
jest.mock('@services/LedgerService');
jest.mock('@services/LoggerService', () => ({
    __esModule: true,
    default: { recordError: jest.fn(), createLogger: () => ({ error: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('@services/StyleService', () => ({
    __esModule: true,
    default: { create: (styles: any) => styles, isDarkMode: () => false },
}));
jest.mock('@services/NavigationService', () => ({ ComponentTypes: { Modal: 'Modal', Screen: 'Screen' } }));
jest.mock('@common/helpers/interface', () => ({ ActionSheet: jest.fn() }));
jest.mock('@common/helpers/navigator', () => ({ Navigator: { dismissModal: jest.fn(), pop: jest.fn() } }));
jest.mock('@components/General', () => ({ Header: () => null }));
jest.mock('@components/Modules/MutationWidgets', () => ({}));
jest.mock('@components/Modules/TransactionData', () => ({ __esModule: true, default: () => null }));
jest.mock('@components/Modules/TransactionData/UniversalTransactionWarning', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('@components/Modules/EventsList/EventListItems', () => ({ Transaction: () => null }));
jest.mock('@theme', () => ({ AppStyles: {} }));

const RECIPIENT = 'rwietsevLFg8XSmG3bEZzFein1g8RBqWDZ';
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const fromLedger = (tx: any, meta: any) =>
    TransactionFactory.fromLedger({ tx: clone(tx), meta: clone(meta) } as any, [MixingTypes.Mutation]);

const innerTransactions = () =>
    fixture.innerResponses.map((response, index) => ({
        transaction: fromLedger(response, response.meta),
        hash: response.hash,
        index,
        found: true,
        parentBatchId: response.meta.ParentBatchID,
    }));

const viewFor = (item: any) => {
    const view = new TransactionDetailsView({ item, account: { address: RECIPIENT }, componentType: 'Modal' } as any);
    jest.spyOn(view, 'setState').mockImplementation((update: any) => {
        Object.assign(view.state, update);
    });
    return view;
};

describe('TransactionDetailsView.onBatchInnerLoaded', () => {
    it('starts with a Batch explainer that does not know the outcome yet', () => {
        const view = viewFor(fromLedger(fixture.parent, fixture.parentMeta));
        expect(view.state.explainer).toBeInstanceOf(BatchInfo);
        expect(view.state.explainer!.isBalanceEffectKnown()).toBe(false);
    });

    it('rebuilds the explainer with the inner transactions, so the header includes them', () => {
        const view = viewFor(fromLedger(fixture.parent, fixture.parentMeta));
        const before = view.state.explainer;
        (view as any).mounted = true;
        view.onBatchInnerLoaded(innerTransactions());
        const after = view.state.explainer!;
        // a new object, so the widgets render again
        expect(after).not.toBe(before);
        expect(after).toBeInstanceOf(BatchInfo);
        expect(after.isBalanceEffectKnown()).toBe(true);
        expect(after.getMonetaryDetails()!.mutate).toEqual({
            INC: [{ action: 'INC', currency: 'XRP', value: '0.009675' }],
            DEC: [],
        });
    });

    it('does nothing after the screen is closed', () => {
        const view = viewFor(fromLedger(fixture.parent, fixture.parentMeta));
        const before = view.state.explainer;
        view.onBatchInnerLoaded(innerTransactions());
        expect(view.setState).not.toHaveBeenCalled();
        expect(view.state.explainer).toBe(before);
    });

    it('does nothing for a transaction that is not a Batch', () => {
        const payment = fixture.innerResponses[2];
        const view = viewFor(fromLedger(payment, payment.meta));
        const before = view.state.explainer;
        (view as any).mounted = true;
        view.onBatchInnerLoaded(innerTransactions());
        expect(view.setState).not.toHaveBeenCalled();
        expect(view.state.explainer).toBe(before);
    });

    it('is handed to the widgets, as one stable function', () => {
        const source = fs.readFileSync(path.join(__dirname, '../DetailsView.tsx'), 'utf8');
        expect(source).toContain('onBatchInnerLoaded: this.onBatchInnerLoaded,');
        const view = viewFor(fromLedger(fixture.parent, fixture.parentMeta));
        expect(view.onBatchInnerLoaded).toBe(view.onBatchInnerLoaded);
    });
});
