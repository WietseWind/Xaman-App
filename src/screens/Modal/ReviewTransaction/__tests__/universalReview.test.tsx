import React from 'react';
import renderer from 'react-test-renderer';
import { binary, XrplDefinitions } from 'xrpl-accountlib';
import NetworkService from '@services/NetworkService';
import { TransactionFactory } from '@common/libs/ledger/factory';
import { MixingTypes } from '@common/libs/ledger/mixin/types';
import ReviewStep from '../Steps/Review/ReviewStep';
import PreflightStep from '../Steps/Preflight/PreflightStep';
import { FallbackTemplate } from '../Steps/Review/Templates/fallback';
import * as NativeTemplates from '../Steps/Review/Templates/genuine';
import DetailsView from '@screens/Events/Details/DetailsView';
import TransactionData from '@components/Modules/TransactionData';
import UniversalTransactionWarning from '@components/Modules/TransactionData/UniversalTransactionWarning';

jest.mock('@services/NetworkService');
jest.mock('@components/General', () => ({ Header: () => null }));
jest.mock('@components/Modules', () => ({}));
jest.mock('@components/Modules/ReviewTransaction', () => ({}));
jest.mock('@screens/Modal/ReviewTransaction/Shared', () => ({}));
jest.mock('../Steps/Review/Templates/genuine', () => ({ Payment: () => null, Global: () => null }));
jest.mock('../Steps/Review/Templates/pseudo', () => ({}));
jest.mock('../Steps/Review/Templates/fallback', () => ({ FallbackTemplate: () => null }));
jest.mock('@components/Modules/EventsList/EventListItems', () => ({ Transaction: () => null }));
jest.mock('@components/Modules/MutationWidgets', () => Object.fromEntries([
    'AdvisoryAlertWidget', 'LabelWidget', 'AssetsMutationsWidget', 'VaultAssetWidget', 'MemoWidget',
    'ReserveChangeWidget', 'ParticipantsWidget', 'ActionButtonsWidget', 'WarningsWidget', 'IdentifierWidget',
    'ExplainWidget', 'BatchTransactions', 'RemitOutputs', 'MPTWidget', 'ActorArrayWidget', 'FlagsWidget',
    'InvoiceIdWidget', 'HookDetailsWidget', 'FeeWidget', 'TransferRateWidget', 'ValidatedLedgerWidget',
].map((name) => [name, () => null])));

const account = { address: 'rQQQrUdN1cLdNmxH4dHfKgmX5P4kf3ZrM' } as any;
const common = { Account: account.address, Fee: '12', Sequence: 1 };
const definitions = (includeFuture = true) => new XrplDefinitions({
    ...binary.DEFAULT_DEFINITIONS,
    TRANSACTION_TYPES: { ...binary.DEFAULT_DEFINITIONS.TRANSACTION_TYPES,
        ...(includeFuture ? { DefinitionOnly: 4094 } : {}) },
} as any);

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(NetworkService, 'getNetworkDefinitions').mockReturnValue(definitions());
});
afterEach(() => jest.restoreAllMocks());

describe('universal transaction routing', () => {
    it('uses the universal review without developer mode', () => {
        const step = new ReviewStep({});
        const transaction = TransactionFactory.fromJson({ ...common, TransactionType: 'DefinitionOnly' } as any);
        (step as any).context = { transaction, source: account, coreSettings: { developerMode: false } };
        const content = (step as any).renderDetails();
        expect(content.map((element: React.ReactElement) => element.type)).toEqual([FallbackTemplate]);
        expect(content[0].props.transaction).toBe(transaction);
    });

    it('retains native Payment and Global templates in their original order', () => {
        const step = new ReviewStep({});
        const transaction = TransactionFactory.fromJson({ ...common, TransactionType: 'Payment',
            Destination: account.address, Amount: '1' } as any);
        (step as any).context = { transaction, source: account, coreSettings: { developerMode: false } };
        const content = (step as any).renderDetails();
        expect(content.map((element: React.ReactElement) => element.type))
            .toEqual([NativeTemplates.Payment, NativeTemplates.Global]);
    });

    it('uses a safe universal template when a registered native model has no review component', () => {
        const step = new ReviewStep({});
        const transaction = TransactionFactory.fromJson({ ...common, TransactionType: 'OfferCancel',
            OfferSequence: 1 } as any);
        (step as any).context = { transaction, source: account };
        const content = (step as any).renderDetails();
        expect(content.map((element: React.ReactElement) => element.type)).toEqual([FallbackTemplate]);
    });

    it('shows full historical data on the details page for unmapped types', () => {
        const history = { ...common, TransactionType: 'DefinitionOnly', HistoricalField: { nested: null } };
        const item = TransactionFactory.fromLedger({ tx: history, meta: { AffectedNodes: [] } } as any,
            [MixingTypes.Mutation]);
        const details = new DetailsView({ item, account, componentType: 'Screen' } as any);
        const tree = renderer.create(details.render());
        expect(tree.root.findByType(TransactionData).props.history).toBe(true);
        expect(tree.root.findByType(TransactionData).props.transaction.JsonRaw).toEqual(history);
        expect(tree.root.findByType(TransactionData).findAllByType(UniversalTransactionWarning)).toHaveLength(0);
        expect(tree.root.findAllByType(UniversalTransactionWarning)).toHaveLength(1);
    });

    it('does not add universal warnings or JSON to the native transaction details page', () => {
        const item = TransactionFactory.fromLedger({ tx: { ...common, TransactionType: 'Payment',
            Destination: account.address, Amount: '1' }, meta: { AffectedNodes: [] } } as any,
            [MixingTypes.Mutation]);
        const details = new DetailsView({ item, account, componentType: 'Screen' } as any);
        expect(renderer.create(details.render()).root.findAllByType(TransactionData)).toHaveLength(0);
    });
});

describe('definitions before universal review', () => {
    it.each([['DefinitionOnly', false, true], ['Payment', false, false], ['SignIn', true, false]])(
        'refreshes once more only for a new ledger type: %s', async (type, pseudo, force) => {
            let defs = definitions(false);
            jest.mocked(NetworkService.getNetworkDefinitions).mockImplementation(() => defs);
            const refresh = jest.spyOn(NetworkService, 'updateNetworkDefinitions')
                .mockImplementation(async (forced) => {
                    if (forced) defs = definitions();
                });
            const checkContext = jest.fn();
            const transaction = { assertSigningContext: checkContext };
            const getTransaction = jest.fn(() => transaction);
            const setTransaction = jest.fn();
            const payload = { getTransaction, isPseudoTransaction: () => pseudo, getTransactionType: () => type };
            const step = new PreflightStep({});
            (step as any).context = { payload, setTransaction };
            jest.spyOn(step as any, 'checkForcedNetwork').mockResolvedValue(undefined);
            await (step as any).setTransaction();
            expect(refresh.mock.calls).toEqual(force ? [[], [true]] : [[]]);
            expect(getTransaction).toHaveBeenCalledTimes(1);
            expect(checkContext).toHaveBeenCalledTimes(1);
            expect(setTransaction).toHaveBeenCalledWith(transaction);
        },
    );
});
