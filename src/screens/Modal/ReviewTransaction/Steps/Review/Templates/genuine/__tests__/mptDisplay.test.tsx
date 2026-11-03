import React from 'react';
import { AmountText } from '@components/General';
import MPTWidget from '@components/Modules/MutationWidgets/MPTWidget';
import { MPToken, MPTokenInfo, MPTokenIssuance, MPTokenIssuanceInfo } from '@common/libs/ledger/objects';
import PaymentTemplate from '../Payment';

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
jest.mock('@screens/Send/Steps/Summary/styles', () => ({}));
jest.mock('../../styles', () => ({}));
jest.mock('@components/Modules/MutationWidgets/styles', () => ({}));
jest.mock('@theme', () => ({ AppStyles: {} }));

const ID = 'A'.repeat(48);
const OWNER = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY';
const elements = (node: any): any[] =>
    React.Children.toArray(node).flatMap((child: any) =>
        React.isValidElement(child) ? [child, ...elements((child.props as any).children)] : [],
    );
const text = (node: any): string =>
    React.Children.toArray(node)
        .map((child: any) =>
            React.isValidElement(child) ? text((child.props as any).children) : String(child),
        )
        .join('');

it.each([
    [1, '100', '10'],
    [2, '9007199254740993', '90071992547409.93'],
])('renders the exact review amount and balance at scale %s', (scale, raw, display) => {
    const view = new PaymentTemplate({
        source: { address: OWNER, lines: [] },
        transaction: { Amount: { mpt_issuance_id: ID, value: raw } },
        payload: { isPathFinding: () => false },
    } as any);
    Object.assign(view.state, {
        account: OWNER,
        mptDetails: { MPTAmount: raw },
        mptIssuanceDetails: { AssetScale: scale },
    });
    const tree = view.render();
    expect(elements(tree).find((el) => el.type === AmountText).props.value).toBe(display);
    expect(text(tree)).toContain(display);
});

it('subtracts issuer supply without losing integer precision', () => {
    const view = new PaymentTemplate({
        source: { address: OWNER, lines: [] },
        transaction: { Amount: { mpt_issuance_id: ID, value: '1' } },
        payload: { isPathFinding: () => false },
    } as any);
    Object.assign(view.state, {
        account: OWNER,
        mptIssuanceDetails: {
            Issuer: OWNER,
            AssetScale: 2,
            MaximumAmount: '9007199254740993',
            OutstandingAmount: '1',
        },
    });
    expect(text(view.render())).toContain('90071992547409.92');
});

it.each([
    [1, '100', '10'],
    [2, '9007199254740993', '90071992547409.93'],
])('keeps object summaries and issuance widgets exact at scale %s', (scale, raw, display) => {
    const issuance = new MPTokenIssuance({
        mpt_issuance_id: ID,
        Issuer: OWNER,
        AssetScale: scale,
        MaximumAmount: raw,
        OutstandingAmount: raw,
    } as any);
    const holding = new MPToken({
        MPTokenIssuanceID: ID,
        Account: OWNER,
        MPTAmount: raw,
        _MPTokenIssuanceID: { AssetScale: scale },
    } as any);
    expect(new MPTokenInfo(holding, {} as any).getMonetaryDetails().factor[0].value).toBe(display);
    expect(new MPTokenIssuanceInfo(issuance, {} as any).getMonetaryDetails().factor[0].value).toBe(
        `-${display}`,
    );
    const widget = new MPTWidget({ item: issuance } as any);
    expect(text(widget.render())).toContain(`${display} (${raw})`);
});

it('does not crash or enable acceptance for malformed wire amounts', () => {
    const ready = jest.fn();
    const view = new PaymentTemplate({
        source: { address: OWNER, lines: [] },
        transaction: { Amount: { mpt_issuance_id: ID, value: '0.29' } },
        payload: { isPathFinding: () => false }, setReady: ready,
    } as any);
    Object.assign(view.state, { account: OWNER, mptLoading: false, mptIssuanceDetails: { AssetScale: 2 } });
    expect(() => view.render()).not.toThrow();
    view.setIsReady();
    expect(ready).toHaveBeenLastCalledWith(false);
});
