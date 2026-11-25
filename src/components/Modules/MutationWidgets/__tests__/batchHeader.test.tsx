/**
 * Issue 491: the header of the Batch details. "Third party transaction" and "did not affect your account balance"
 * are judged on the inner transactions too, and are not claimed while those still have to be loaded.
 */
import React from 'react';

import { AmountText } from '@components/General';
import { ExplainerFactory, TransactionFactory } from '@common/libs/ledger/factory';
import { MixingTypes } from '@common/libs/ledger/mixin/types';
import { BatchInfo } from '@common/libs/ledger/transactions/genuine/Batch';
import { BatchInnerTransaction } from '@common/libs/ledger/utils/batchInner';
import Localize from '@locale';

import AssetsMutations from '../AssetsMutations';
import Label from '../Label';
import fixture from './fixtures/batchThirdPartyRecipient.json';

jest.mock('@services/NetworkService');
jest.mock('@components/General', () => ({
    AmountText: () => null,
    Icon: () => null,
    Badge: () => null,
    BadgeType: {},
}));
jest.mock('@components/Modules/NFTokenElement', () => ({ NFTokenElement: () => null }));
jest.mock('@components/Modules/URITokenElement', () => ({ URITokenElement: () => null }));
jest.mock('@theme', () => ({ AppStyles: {} }));
// every style the widgets ask for
jest.mock('../styles', () => ({ __esModule: true, default: new Proxy({}, { get: () => ({}) }) }));

const SENDER = fixture.parent.Account;
const RECIPIENT = 'rwietsevLFg8XSmG3bEZzFein1g8RBqWDZ';
const STRANGER = 'rrrrrrrrrrrrrrrrrrrrBZbvji';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const batchItem = () =>
    TransactionFactory.fromLedger({ tx: clone(fixture.parent), meta: clone(fixture.parentMeta) } as any, [
        MixingTypes.Mutation,
    ]);

// the inner transactions as the BatchTransactions widget reports them
const innerTransactions = (): BatchInnerTransaction[] =>
    fixture.innerResponses.map((response, index) => ({
        transaction: TransactionFactory.fromLedger({ tx: clone(response), meta: clone(response.meta) } as any, [
            MixingTypes.Mutation,
        ]),
        hash: response.hash,
        index,
        found: true,
        parentBatchId: response.meta.ParentBatchID,
    }));

const propsFor = (address: string, loaded: boolean) => {
    const item = batchItem();
    const account = { address };
    const explainer = ExplainerFactory.fromTransaction(item, account as any) as unknown as BatchInfo;
    if (loaded) {
        explainer.setInnerTransactions(innerTransactions());
    }
    return { item, account, explainer } as any;
};

const elements = (node: React.ReactNode): React.ReactElement<any>[] =>
    React.Children.toArray(node).flatMap((child) =>
        React.isValidElement(child) ? [child, ...elements((child.props as any).children)] : [],
    );

const texts = (node: React.ReactNode): string[] =>
    elements(node)
        .map((element) => (element.props as any).children)
        .filter((children): children is string => typeof children === 'string');

const titleFor = (address: string, loaded: boolean) => {
    const props = propsFor(address, loaded);
    return { title: texts(new Label(props).renderItemLabel()), props };
};

const amountBoxFor = (address: string, loaded: boolean) => {
    const props = propsFor(address, loaded);
    const widget = new AssetsMutations(props);
    Object.assign(widget.state, AssetsMutations.getDerivedStateFromProps(props));
    const tree = widget.render();
    return {
        texts: texts(tree),
        amounts: elements(tree)
            .filter((element) => element.type === AmountText)
            .map((element) => ({
                value: element.props.value,
                currency: element.props.currency,
                prefix: element.props.prefix || undefined,
            })),
    };
};

const THIRD_PARTY = Localize.t('events.thirdPartyTx');
const NO_EFFECT = Localize.t('events.thirdPartyTxExplain');

describe('Batch details header, for the recipient of an inner transaction', () => {
    it('does not say "third party" or "did not affect your balance" while the inner transactions load', () => {
        expect(titleFor(RECIPIENT, false).title).not.toContain(THIRD_PARTY);
        const box = amountBoxFor(RECIPIENT, false);
        expect(box.texts).not.toContain(NO_EFFECT);
        expect(box.amounts).toEqual([]);
    });

    it('shows the amount received and no third party wording once they are loaded', () => {
        expect(titleFor(RECIPIENT, true).title).not.toContain(THIRD_PARTY);
        const box = amountBoxFor(RECIPIENT, true);
        expect(box.texts).not.toContain(NO_EFFECT);
        expect(box.amounts).toEqual([{ value: '0.009675', currency: 'XRP', prefix: undefined }]);
    });
});

describe('Batch details header, for an account that has no part in the Batch', () => {
    it('makes no claim while the inner transactions load', () => {
        expect(titleFor(STRANGER, false).title).not.toContain(THIRD_PARTY);
        expect(amountBoxFor(STRANGER, false).texts).not.toContain(NO_EFFECT);
    });

    it('says "third party" and "did not affect your balance" once it is known that nothing changed', () => {
        expect(titleFor(STRANGER, true).title).toEqual([THIRD_PARTY]);
        const box = amountBoxFor(STRANGER, true);
        expect(box.texts).toContain(NO_EFFECT);
        expect(box.amounts).toEqual([]);
    });
});

describe('Batch details header, for the account that sent the Batch', () => {
    it('never says "third party", loaded or not', () => {
        [false, true].forEach((loaded) => {
            expect(titleFor(SENDER, loaded).title).not.toContain(THIRD_PARTY);
            expect(amountBoxFor(SENDER, loaded).texts).not.toContain(NO_EFFECT);
        });
    });

    it('shows no amount before, and the net result of the inner transactions after loading', () => {
        expect(amountBoxFor(SENDER, false).amounts).toEqual([]);
        expect(amountBoxFor(SENDER, true).amounts).toEqual([
            { value: '10.03', currency: '524C555344000000000000000000000000000000', prefix: '-' },
            { value: '9.697088', currency: 'XRP', prefix: undefined },
        ]);
    });
});

describe('other transactions keep their wording', () => {
    it('a Payment between two other accounts is a third party transaction right away', () => {
        const response = fixture.innerResponses[1];
        const item = TransactionFactory.fromLedger({ tx: clone(response), meta: clone(response.meta) } as any, [
            MixingTypes.Mutation,
        ]);
        const account = { address: STRANGER };
        const explainer = ExplainerFactory.fromTransaction(item, account as any);
        const props = { item, account, explainer } as any;
        expect(explainer.isBalanceEffectKnown()).toBe(true);
        expect(texts(new Label(props).renderItemLabel())).toEqual([THIRD_PARTY]);
        const widget = new AssetsMutations(props);
        Object.assign(widget.state, AssetsMutations.getDerivedStateFromProps(props));
        expect(texts(widget.render())).toContain(NO_EFFECT);
    });

    it('an explainer without the new method (older shape) is treated as known', () => {
        const props = propsFor(STRANGER, true);
        const legacy = {
            getMonetaryDetails: () => props.explainer.getMonetaryDetails(),
            getAssetDetails: () => [],
            getEventsLabel: () => 'Batch',
        };
        expect(texts(new Label({ ...props, explainer: legacy }).renderItemLabel())).toEqual([THIRD_PARTY]);
    });
});
