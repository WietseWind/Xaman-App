/**
 * The caution above the slide button of a Remit (issue 530): it lists what the Remit pays for at
 * the destination besides what it sends, and only what applies.
 */
import React from 'react';
import renderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import LedgerService from '@services/LedgerService';
import NetworkService from '@services/NetworkService';
import { Remit } from '@common/libs/ledger/transactions';
import { createNetworkDefinitions } from '@common/libs/ledger/utils/normalizeDefinitions';
import liveXahau from '@common/libs/ledger/utils/__tests__/fixtures/definitions/live-xahau.json';
import Localize from '@locale';

import RemitCostsCaution from '../RemitCostsCaution';
import { assumedRemitCosts, remitCostAmounts, remitCosts, remitCostsAny } from '../remitCosts';

jest.mock('@services/NetworkService', () => ({
    __esModule: true,
    default: {
        getNetworkDefinitions: jest.fn(),
        getNetworkId: () => 21337,
        getNetwork: () => ({ id: 'remit-costs-test' }),
        getNativeAsset: () => 'XAH',
        getNetworkReserve: () => ({ BaseReserve: 1, OwnerReserve: 0.2 }),
    },
}));
jest.mock('@services/LedgerService', () => ({
    __esModule: true,
    default: { getAccountInfo: jest.fn(), getLedgerEntry: jest.fn() },
}));
jest.mock('@components/General/InfoMessage', () => ({ InfoMessage: 'InfoMessage' }));
jest.mock('@components/General/Spacer', () => ({ Spacer: 'Spacer' }));
jest.mock('../styles', () => ({ __esModule: true, default: {} }));

const Account = 'rwietsevLFg8XSmG3bEZzFein1g8RBqWDZ';
const Destination = 'rtipboteEEZ6JkTNvcYgUZbiYyrV2W7DQ';
const Issuer = 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq';
const Token = (letter: string) => letter.repeat(64);

const native = { AmountEntry: { Amount: '1000000' } };
const eur = { AmountEntry: { Amount: { currency: 'EUR', issuer: Issuer, value: '12.5' } } };
const usd = { AmountEntry: { Amount: { currency: 'USD', issuer: Issuer, value: '3' } } };

const remit = (fields: Record<string, unknown>) =>
    new Remit({ TransactionType: 'Remit', Account, Destination, Fee: '12', Sequence: 1, ...fields } as any);

const accountInfo = jest.mocked(LedgerService.getAccountInfo);
const ledgerEntry = jest.mocked(LedgerService.getLedgerEntry);
const exists = () => accountInfo.mockResolvedValue({ account_data: { Account: Destination } } as any);
const doesNotExist = () => accountInfo.mockResolvedValue({ error: 'actNotFound' } as any);
// the destination has a trust line for these currencies only
const trustLines = (...currencies: string[]) =>
    ledgerEntry.mockImplementation((async (options: any) =>
        currencies.includes(options.ripple_state.currency) ? { node: {} } : { error: 'entryNotFound' }) as any);

beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(NetworkService.getNetworkDefinitions).mockReturnValue(createNetworkDefinitions(liveXahau) as any);
    Localize.setLocale('en');
});

describe('what a Remit pays for at the destination', () => {
    it('a destination that does not exist: its activation, and a trust line for every issued amount', async () => {
        doesNotExist();
        const costs = await remitCosts(remit({ Amounts: [native, eur, usd] }));
        expect(costs).toEqual({ activation: true, trustLines: 2, uriTokens: 0 });
        // an account that does not exist has no trust lines to ask for
        expect(ledgerEntry).not.toHaveBeenCalled();
    });

    it('a destination that exists, with only the native asset: nothing', async () => {
        exists();
        const costs = await remitCosts(remit({ Amounts: [native] }));
        expect(costs).toEqual({ activation: false, trustLines: 0, uriTokens: 0 });
        expect(remitCostsAny(costs)).toBe(false);
    });

    it('a destination that exists: a trust line only for the issued amounts it has no trust line for', async () => {
        exists();
        trustLines('EUR');
        const costs = await remitCosts(remit({ Amounts: [native, eur, usd] }));
        expect(costs).toEqual({ activation: false, trustLines: 1, uriTokens: 0 });
        expect(ledgerEntry).toHaveBeenCalledWith({
            ripple_state: { accounts: [Destination, Issuer], currency: 'USD' },
        });
    });

    it('every URIToken that is transferred or minted, also when the destination exists', async () => {
        exists();
        const costs = await remitCosts(
            remit({ URITokenIDs: [Token('A'), Token('B')], MintURIToken: { URI: '6170' } }),
        );
        expect(costs).toEqual({ activation: false, trustLines: 0, uriTokens: 3 });
    });

    it('the ledger does not say whether the destination exists: everything that can cost counts', async () => {
        accountInfo.mockRejectedValue(new Error('no connection'));
        expect(await remitCosts(remit({ Amounts: [native, eur] }))).toEqual({
            activation: true,
            trustLines: 1,
            uriTokens: 0,
        });
        accountInfo.mockResolvedValue({ error: 'slowDown' } as any);
        expect(await remitCosts(remit({ Amounts: [native, eur] }))).toEqual({
            activation: true,
            trustLines: 1,
            uriTokens: 0,
        });
    });

    it('the ledger does not say whether a trust line exists: it counts', async () => {
        exists();
        ledgerEntry.mockRejectedValue(new Error('no connection'));
        expect((await remitCosts(remit({ Amounts: [eur] }))).trustLines).toBe(1);
        ledgerEntry.mockResolvedValue({ error: 'slowDown' } as any);
        expect((await remitCosts(remit({ Amounts: [eur] }))).trustLines).toBe(1);
    });

    it('an issued amount that goes back to its issuer counts: the ledger takes the reserve for it', async () => {
        accountInfo.mockResolvedValue({ account_data: { Account: Issuer } } as any);
        const costs = await remitCosts(remit({ Destination: Issuer, Amounts: [eur] }));
        expect(costs).toEqual({ activation: false, trustLines: 1, uriTokens: 0 });
        expect(ledgerEntry).not.toHaveBeenCalled();
    });

    it('before the ledger is asked, everything that can cost counts', () => {
        expect(assumedRemitCosts(remit({ Amounts: [native, eur], URITokenIDs: [Token('A')] }))).toEqual({
            activation: true,
            trustLines: 1,
            uriTokens: 1,
        });
    });
});

describe('the reserve that is sent along, in the native asset', () => {
    const reserve = { BaseReserve: 1, OwnerReserve: 0.2 };

    it('the account reserve for the activation, one object reserve for every trust line and URIToken', () => {
        expect(remitCostAmounts({ activation: true, trustLines: 1, uriTokens: 2 }, reserve)).toEqual({
            total: '1.6',
            lines: [
                { kind: 'activation', count: 1, amount: '1.0' },
                { kind: 'trustLines', count: 1, amount: '0.2' },
                { kind: 'uriTokens', count: 2, amount: '0.4' },
            ],
        });
    });

    it('every amount has the decimals of the one with the most, so they line up ("1" is "1.0")', () => {
        expect(remitCostAmounts({ activation: true, trustLines: 0, uriTokens: 0 }, reserve)).toEqual({
            total: '1',
            lines: [{ kind: 'activation', count: 1, amount: '1' }],
        });
        // whole numbers only: no decimals to line up
        expect(
            remitCostAmounts({ activation: true, trustLines: 5, uriTokens: 0 }, reserve).lines.map((l) => l.amount),
        ).toEqual(['1', '1']);
        expect(
            remitCostAmounts({ activation: true, trustLines: 1, uriTokens: 0 }, { BaseReserve: 10, OwnerReserve: 0.25 }),
        ).toEqual({
            total: '10.25',
            lines: [
                { kind: 'activation', count: 1, amount: '10.00' },
                { kind: 'trustLines', count: 1, amount: '0.25' },
            ],
        });
    });

    it('only the parts that apply are lines; nothing applies: no lines and a total of 0', () => {
        expect(remitCostAmounts({ activation: false, trustLines: 0, uriTokens: 3 }, reserve)).toEqual({
            total: '0.6',
            lines: [{ kind: 'uriTokens', count: 3, amount: '0.6' }],
        });
        expect(remitCostAmounts({ activation: false, trustLines: 0, uriTokens: 0 }, reserve)).toEqual({
            total: '0',
            lines: [],
        });
    });

    it('no rounding surprises from binary fractions (3 x 0.2 is 0.6)', () => {
        expect(remitCostAmounts({ activation: false, trustLines: 3, uriTokens: 0 }, reserve).total).toBe('0.6');
    });
});

describe('the caution above the slide button', () => {
    let tree: ReactTestRenderer;
    const render = async (fields: Record<string, unknown>) => {
        await act(async () => {
            tree = renderer.create(<RemitCostsCaution transaction={remit(fields)} />);
        });
    };
    const lines = () =>
        tree.root
            .findAllByType(Text)
            .map((node) => node.props.children)
            .filter((child) => typeof child === 'string');
    const header = (amount: string) => Localize.t('payload.remitPaysReserves', { amount, asset: 'XAH' });

    afterEach(() => act(() => tree.unmount()));

    it('says the total and lists each part with its amount, the amounts padded to one width', async () => {
        doesNotExist();
        await render({ Amounts: [native, eur], URITokenIDs: [Token('A')], MintURIToken: { URI: '6170' } });
        expect(tree.root.findAllByProps({ testID: 'remit-pays-reserves-warning' }).length).toBeGreaterThan(0);
        expect(lines()).toEqual([
            header('1.6'),
            '1.0 XAH',
            Localize.t('payload.remitPaysActivation'),
            '0.2 XAH',
            Localize.t('payload.remitPaysTrustLines', { count: 1 }),
            '0.4 XAH',
            Localize.t('payload.remitPaysURITokens', { count: 2 }),
        ]);
    });

    it('lists only what applies: a destination that exists gets no line about its activation', async () => {
        exists();
        trustLines();
        await render({ Amounts: [native, eur] });
        expect(tree.root.findAllByProps({ testID: 'remit-pays-activation' })).toHaveLength(0);
        expect(tree.root.findAllByProps({ testID: 'remit-pays-trust-lines' }).length).toBeGreaterThan(0);
        expect(tree.root.findAllByProps({ testID: 'remit-pays-uritokens' })).toHaveLength(0);
        expect(lines()).toEqual([header('0.2'), '0.2 XAH', Localize.t('payload.remitPaysTrustLines', { count: 1 })]);
    });

    it('shows nothing when the Remit pays for nothing more (the destination exists, native asset only)', async () => {
        exists();
        await render({ Amounts: [native] });
        expect(tree.toJSON()).toBeNull();
    });

    it('until the ledger answered, the caution is there with everything that can apply', async () => {
        let answer: (value: unknown) => void = () => undefined;
        accountInfo.mockReturnValue(
            new Promise((resolve) => {
                answer = resolve;
            }) as any,
        );
        await render({ Amounts: [native] });
        expect(lines()).toEqual([header('1'), '1 XAH', Localize.t('payload.remitPaysActivation')]);
        await act(async () => {
            answer({ account_data: { Account: Destination } });
        });
        expect(tree.toJSON()).toBeNull();
    });

    it('a wider amount moves the others to the right: "10.0" above " 0.4"', async () => {
        jest.spyOn(NetworkService, 'getNetworkReserve').mockReturnValue({ BaseReserve: 10, OwnerReserve: 0.2 });
        doesNotExist();
        await render({ URITokenIDs: [Token('A'), Token('B')] });
        expect(lines()).toEqual([
            header('10.4'),
            '10.0 XAH',
            Localize.t('payload.remitPaysActivation'),
            ' 0.4 XAH',
            Localize.t('payload.remitPaysURITokens', { count: 2 }),
        ]);
    });
});
