import React from 'react';
import { Text, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { AmountInput as EditableAmountInput } from '@components/General/AmountInput';
import { AmountInputEditingContext } from '@components/General/AmountInput/EditingContext';
import { AmountInput, AmountText } from '@components/General';
import { AccountElement } from '@components/Modules';
import { Payment } from '@common/libs/ledger/transactions';
import Localize from '@locale';
import PaymentTemplate from '../Payment';
import styles from '../../styles';

jest.mock('@services', () => ({
    NetworkService: { getNativeAsset: () => 'XRP' },
    LedgerService: {},
    BackendService: {},
    StyleService: {},
}));
jest.mock('@services/NetworkService');
jest.mock('@components/General', () => ({
    AmountText: () => null,
    AmountInput: () => null,
    Button: () => null,
    InfoMessage: () => null,
}));
jest.mock('@components/Modules', () => ({
    AccountElement: () => null,
    MPTWidget: () => null,
    PaymentOptionsPicker: () => null,
}));
jest.mock('@store/repositories', () => ({}));
jest.mock('@common/utils/balance', () => ({ CalculateAvailableBalance: () => 100 }));
jest.mock('@screens/Send/Steps/Summary/styles', () => ({}));
jest.mock('../../styles', () => ({
    label: { role: 'label' },
    contentBox: { role: 'content' },
    amountInput: { role: 'primary' },
    amount: { role: 'amount' },
    value: { role: 'secondary' },
}));
jest.mock('@theme', () => ({ AppStyles: {} }));

const OWNER = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY';
const OTHER = 'rUwaiErsYE5kibUUtaPczXZVVd73VNy4R9';
const ISSUER = 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De';
const CURRENCY = '524C555344'.padEnd(40, '0');
const MAXIMUM = '994673548.861546';
const MINIMUM = '1.27890052';
const wire = {
    TransactionType: 'Payment', Account: OWNER, Destination: OWNER,
    Amount: { currency: CURRENCY, issuer: ISSUER, value: MAXIMUM },
    DeliverMin: { currency: CURRENCY, issuer: ISSUER, value: MINIMUM },
    SendMax: '1000000', Flags: 131072, Fee: '12', Sequence: 2411,
};

const elements = (node: any): any[] =>
    React.Children.toArray(node).flatMap((child: any) =>
        React.isValidElement(child) ? [child, ...elements((child.props as any).children)] : [],
    );
const text = (node: any): string =>
    React.Children.toArray(node)
        .map((child: any) => React.isValidElement(child) ? text((child.props as any).children) : String(child))
        .join('');

const render = (changes: Record<string, unknown> = {}, state: Record<string, unknown> = {}) => {
    const transaction = new Payment({ ...wire, ...changes } as any);
    const before = JSON.stringify(transaction.JsonForSigning);
    const view = new PaymentTemplate({
        source: { address: OWNER, balance: 100, lines: [] },
        transaction, payload: { isPathFinding: () => false },
    } as any);
    Object.assign(view.state, { account: OWNER }, state);
    const tree = view.render();
    expect(JSON.stringify(transaction.JsonForSigning)).toBe(before);
    const fields = elements(tree).filter(el => el.type === AmountText &&
        [styles.amountInput, styles.amount, styles.value].includes(el.props.style));
    const labels = elements(tree).filter(el => el.type === Text && el.props.style === styles.label)
        .map(el => text(el.props.children));
    return { fields, labels, tree, transaction, view };
};

it.each([OWNER, OTHER])('promotes the minimum for %s without changing the signed payment', (destination) => {
    const { fields, labels, tree, transaction } = render({ Destination: destination });
    expect(transaction.Flags.tfPartialPayment).toBe(true);
    expect(labels).toEqual([
        Localize.t('global.deliverMin'), Localize.t('global.sendMax'), Localize.t('global.maximumReceiveLimit'),
    ]);
    expect(fields.map(el => el.props.value)).toEqual([MINIMUM, '1', MAXIMUM]);
    expect(fields[0].props.style).toBe(styles.amountInput);
    expect(fields[2].props.style).toBe(styles.value);
    expect(fields.every(el => el.props.immutable)).toBe(true);
    expect(elements(tree).find(el => el.type === AccountElement).props.address).toBe(destination);
});

it('keeps the receive cap as the headline at the exact two-times boundary', () => {
    const { fields, labels } = render({ Amount: { ...wire.Amount, value: '2.55780104' } });
    expect(labels).toEqual([
        Localize.t('global.amountToReceive'), Localize.t('global.sendMax'), Localize.t('global.deliverMin'),
    ]);
    expect(fields.map(el => el.props.value)).toEqual(['2.55780104', '1', MINIMUM]);
});

it.each([
    ['not partial', { Flags: 0 }],
    ['different issuer', { DeliverMin: { ...wire.DeliverMin, issuer: OTHER } }],
    ['different currency', { DeliverMin: { ...wire.DeliverMin, currency: 'USD' } }],
])('preserves normal review layout when %s', (_label, changes) => {
    const { fields, labels } = render(changes as Record<string, unknown>);
    expect(labels[0]).toBe(Localize.t('global.amountToReceive'));
    expect(labels).not.toContain(Localize.t('global.maximumReceiveLimit'));
    expect(fields[0].props.value).toBe(MAXIMUM);
});

it('keeps normal payments without SendMax or DeliverMin unchanged', () => {
    const { fields, labels } = render({ SendMax: undefined, DeliverMin: undefined, Flags: 0 });
    expect(labels).toEqual([Localize.t('global.amount')]);
    expect(fields.map(el => el.props.value)).toEqual([MAXIMUM]);
});

it('retains SendMax as the second field when a path has already been selected', () => {
    const { fields, labels } = render({}, { selectedPath: { source_amount: '1000000', paths_computed: [] } });
    expect(labels.slice(0, 3)).toEqual([
        Localize.t('global.deliverMin'), Localize.t('global.sendMax'), Localize.t('global.maximumReceiveLimit'),
    ]);
    expect(fields.map(el => el.props.value)).toEqual([MINIMUM, '1', MAXIMUM]);
});

it('computes the native fiat equivalent from the displayed minimum, not the inflated cap', () => {
    const { fields, tree } = render({
        Amount: '994673548861546', DeliverMin: '1278900',
        SendMax: { currency: 'USD', issuer: ISSUER, value: '1' },
    }, { currencyRate: { code: 'USD', rate: 2 } });
    expect(fields[0].props.value).toBe('1.2789');
    expect(text(tree)).toContain('~USD 2.55');
});

it('leaves both partial and canonical-signature flag bits intact', () => {
    const flags = 0x80020000;
    const { labels, transaction } = render({ Flags: flags });
    expect(labels[0]).toBe(Localize.t('global.deliverMin'));
    expect(transaction.JsonForSigning.Flags).toBe(flags);
});

it('reacts to a changed transaction without reusing the earlier minimum', () => {
    const { view } = render();
    const transaction = new Payment({
        ...wire,
        Amount: { ...wire.Amount, value: '2000' },
        DeliverMin: { ...wire.DeliverMin, value: '2' },
    } as any);
    view.props = { ...view.props, transaction };
    const before = JSON.stringify(transaction.JsonForSigning);
    const tree = view.render();
    const primary = elements(tree).find(el => el.type === AmountText && el.props.style === styles.amountInput);
    expect(primary.props.value).toBe('2');
    expect(JSON.stringify(transaction.JsonForSigning)).toBe(before);
});

it('preserves the existing editable-amount workflow', () => {
    const { tree, labels } = render({}, { editableAmount: true });
    expect(labels[0]).toBe(Localize.t('global.amountToReceive'));
    expect(labels).not.toContain(Localize.t('global.maximumReceiveLimit'));
    const input = elements(tree).find(el => el.type === AmountInput);
    expect(input.props.value).toBe(MAXIMUM);
    expect(input.props.editable).toBe(true);
});

it('keeps the real payment unchanged when password-manager text reaches the background amount input', () => {
    const { transaction, view } = render({ Amount: '0', DeliverMin: undefined, SendMax: undefined, Flags: 0 });
    view.setState = jest.fn((next: any) => { Object.assign(view.state, next); }) as any;
    let editable = true;
    const tree = renderer.create(
        <AmountInputEditingContext.Provider value={() => editable}>
            <EditableAmountInput value="0" onChange={view.onAmountChange} />
        </AmountInputEditingContext.Provider>,
    );
    const input = tree.root.findByType(TextInput);
    const before = JSON.stringify(transaction.JsonForSigning);
    act(() => input.props.onFocus());
    act(() => input.props.onChangeText('test123'));
    expect(JSON.stringify(transaction.JsonForSigning)).toBe(before);
    editable = false;
    act(() => input.props.onChangeText('123'));
    expect(JSON.stringify(transaction.JsonForSigning)).toBe(before);
    editable = true;
    act(() => input.props.onFocus());
    act(() => input.props.onChangeText('1.25'));
    expect(transaction.JsonForSigning.Amount).toBe('1250000');
});
