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

import RemitCostsCaution, { REMIT_COSTS_RETRY_MS } from '../RemitCostsCaution';
import { assumedRemitCosts, remitCostAmounts, remitCosts, remitCostsAny } from '../remitCosts';

jest.mock('@services/NetworkService', () => ({
    __esModule: true,
    default: {
        getNetworkDefinitions: jest.fn(),
        getNetworkId: () => 21337,
        getNetwork: () => ({ id: 'remit-costs-test' }),
        getNativeAsset: () => 'XAH',
        getNetworkReserve: () => ({ BaseReserve: 1, OwnerReserve: 0.2 }),
        on: jest.fn(),
        off: jest.fn(),
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
    // a test that changes the reserves of the network does that for itself only
    jest.restoreAllMocks();
    jest.mocked(NetworkService.getNetworkDefinitions).mockReturnValue(createNetworkDefinitions(liveXahau) as any);
    Localize.setLocale('en');
});

describe('what a Remit pays for at the destination', () => {
    it('a destination that does not exist: its activation, and a trust line for every issued amount', async () => {
        doesNotExist();
        const { costs, known } = await remitCosts(remit({ Amounts: [native, eur, usd] }));
        expect(costs).toEqual({ activation: true, trustLines: 2, uriTokens: 0 });
        expect(known).toBe(true);
        // an account that does not exist has no trust lines to ask for
        expect(ledgerEntry).not.toHaveBeenCalled();
    });

    it('a destination that exists, with only the native asset: nothing', async () => {
        exists();
        const { costs, known } = await remitCosts(remit({ Amounts: [native] }));
        expect(costs).toEqual({ activation: false, trustLines: 0, uriTokens: 0 });
        expect(known).toBe(true);
        expect(remitCostsAny(costs)).toBe(false);
    });

    it('a destination that exists: a trust line only for the issued amounts it has no trust line for', async () => {
        exists();
        trustLines('EUR');
        const { costs, known } = await remitCosts(remit({ Amounts: [native, eur, usd] }));
        expect(costs).toEqual({ activation: false, trustLines: 1, uriTokens: 0 });
        expect(known).toBe(true);
        expect(ledgerEntry).toHaveBeenCalledWith({
            ripple_state: { accounts: [Destination, Issuer], currency: 'USD' },
        });
    });

    it('every URIToken that is transferred or minted, also when the destination exists', async () => {
        exists();
        const { costs } = await remitCosts(
            remit({ URITokenIDs: [Token('A'), Token('B')], MintURIToken: { URI: '6170' } }),
        );
        expect(costs).toEqual({ activation: false, trustLines: 0, uriTokens: 3 });
    });

    it('the ledger does not say whether the destination exists: everything that can cost counts', async () => {
        const assumed = { costs: { activation: true, trustLines: 1, uriTokens: 0 }, known: false };
        accountInfo.mockRejectedValue(new Error('no connection'));
        expect(await remitCosts(remit({ Amounts: [native, eur] }))).toEqual(assumed);
        accountInfo.mockResolvedValue({ error: 'slowDown' } as any);
        expect(await remitCosts(remit({ Amounts: [native, eur] }))).toEqual(assumed);
        // a time-out of the request is a rejection like any other
        accountInfo.mockRejectedValue(new Error('Request timeout'));
        expect(await remitCosts(remit({ Amounts: [native, eur] }))).toEqual(assumed);
        // a service that throws at once (no connection object yet) is no crash either
        accountInfo.mockImplementation(() => {
            throw new Error('connection instance is not initiated');
        });
        expect(await remitCosts(remit({ Amounts: [native, eur] }))).toEqual(assumed);
    });

    it('the ledger does not say whether a trust line exists: it counts', async () => {
        exists();
        const assumed = { costs: { activation: false, trustLines: 1, uriTokens: 0 }, known: false };
        ledgerEntry.mockRejectedValue(new Error('no connection'));
        expect(await remitCosts(remit({ Amounts: [eur] }))).toEqual(assumed);
        ledgerEntry.mockResolvedValue({ error: 'slowDown' } as any);
        expect(await remitCosts(remit({ Amounts: [eur] }))).toEqual(assumed);
        ledgerEntry.mockImplementation(() => {
            throw new Error('connection instance is not initiated');
        });
        expect(await remitCosts(remit({ Amounts: [eur] }))).toEqual(assumed);
    });

    it('an issued amount that goes back to its issuer counts: the ledger takes the reserve for it', async () => {
        accountInfo.mockResolvedValue({ account_data: { Account: Issuer } } as any);
        const { costs, known } = await remitCosts(remit({ Destination: Issuer, Amounts: [eur] }));
        expect(costs).toEqual({ activation: false, trustLines: 1, uriTokens: 0 });
        expect(known).toBe(true);
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
            remitCostAmounts({ activation: true, trustLines: 5, uriTokens: 0 }, reserve)?.lines.map((l) => l.amount),
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
        expect(remitCostAmounts({ activation: false, trustLines: 3, uriTokens: 0 }, reserve)?.total).toBe('0.6');
    });

    it('reserves that are not known give no amounts, not "NaN"', () => {
        const costs = { activation: true, trustLines: 1, uriTokens: 0 };
        expect(remitCostAmounts(costs, undefined)).toBeUndefined();
        expect(remitCostAmounts(costs, { BaseReserve: undefined as any, OwnerReserve: 0.2 })).toBeUndefined();
        expect(remitCostAmounts(costs, { BaseReserve: 1, OwnerReserve: NaN })).toBeUndefined();
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
    const upTo = (amount: string) => Localize.t('payload.remitPaysReservesUpTo', { amount, asset: 'XAH' });

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

    it('until the ledger answered, the caution is there with everything that can apply, as "up to"', async () => {
        let answer: (value: unknown) => void = () => undefined;
        accountInfo.mockReturnValue(
            new Promise((resolve) => {
                answer = resolve;
            }) as any,
        );
        await render({ Amounts: [native] });
        expect(lines()).toEqual([upTo('1'), '1 XAH', Localize.t('payload.remitPaysActivation')]);
        expect(tree.root.findAllByProps({ testID: 'remit-pays-total' })).toHaveLength(0);
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

    describe('when the connection fails', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        const later = async (ms: number) => {
            await act(async () => {
                jest.advanceTimersByTime(ms);
            });
        };

        it('no answer from the ledger: the caution stays, as "up to", and the ledger is asked again', async () => {
            accountInfo.mockRejectedValue(new Error('no connection'));
            await render({ Amounts: [native, eur] });
            expect(lines()).toEqual([
                upTo('1.2'),
                '1.0 XAH',
                Localize.t('payload.remitPaysActivation'),
                '0.2 XAH',
                Localize.t('payload.remitPaysTrustLines', { count: 1 }),
            ]);
            expect(accountInfo).toHaveBeenCalledTimes(1);

            // still no connection: asked again, nothing changes on screen
            await later(REMIT_COSTS_RETRY_MS);
            expect(accountInfo).toHaveBeenCalledTimes(2);
            expect(lines()[0]).toBe(upTo('1.2'));

            // the connection is back: exact, and no more questions
            exists();
            trustLines();
            await later(REMIT_COSTS_RETRY_MS);
            expect(accountInfo).toHaveBeenCalledTimes(3);
            expect(lines()).toEqual([header('0.2'), '0.2 XAH', Localize.t('payload.remitPaysTrustLines', { count: 1 })]);
            await later(REMIT_COSTS_RETRY_MS * 3);
            expect(accountInfo).toHaveBeenCalledTimes(3);
        });

        it('a request that never ends does not hold the screen: the caution is there at once', async () => {
            accountInfo.mockReturnValue(new Promise(() => undefined) as any);
            await render({ Amounts: [eur], URITokenIDs: [Token('A')] });
            expect(lines()[0]).toBe(upTo('1.4'));
            await later(60000);
            expect(lines()[0]).toBe(upTo('1.4'));
            // one question is open: no second one on top of it
            expect(accountInfo).toHaveBeenCalledTimes(1);
        });

        it('only the trust line question fails: the rest is exact, the total is "up to"', async () => {
            exists();
            ledgerEntry.mockRejectedValue(new Error('Request timeout'));
            await render({ Amounts: [native, eur] });
            expect(lines()).toEqual([upTo('0.2'), '0.2 XAH', Localize.t('payload.remitPaysTrustLines', { count: 1 })]);
            trustLines('EUR');
            await later(REMIT_COSTS_RETRY_MS);
            expect(tree.toJSON()).toBeNull();
        });

        it('the connection is back: asked at once on the new connection, the answer that hangs is not used', async () => {
            // the first question never ends (it went out on the connection that died)
            let late: (value: unknown) => void = () => undefined;
            accountInfo.mockReturnValueOnce(
                new Promise((resolve) => {
                    late = resolve;
                }) as any,
            );
            await render({ Amounts: [native, eur] });
            expect(lines()[0]).toBe(upTo('1.2'));
            const onConnect = jest.mocked(NetworkService.on).mock.calls.find(([event]) => event === 'connect')?.[1];
            expect(onConnect).toBeDefined();

            // the node is reachable again: the destination exists and has the trust line
            exists();
            trustLines('EUR');
            await act(async () => {
                (onConnect as () => void)();
            });
            expect(accountInfo).toHaveBeenCalledTimes(2);
            expect(tree.toJSON()).toBeNull();

            // the old question answers after all, with another answer: not used
            await act(async () => {
                late({ error: 'actNotFound' });
            });
            expect(tree.toJSON()).toBeNull();
        });

        it('the connection comes back while the answer is exact already: no new question', async () => {
            exists();
            trustLines();
            await render({ Amounts: [native, eur] });
            expect(lines()[0]).toBe(header('0.2'));
            const onConnect = jest.mocked(NetworkService.on).mock.calls.find(([event]) => event === 'connect')?.[1];
            await act(async () => {
                (onConnect as () => void)();
            });
            expect(accountInfo).toHaveBeenCalledTimes(1);
        });

        it('closing the review stops listening for the connection', async () => {
            exists();
            await render({ Amounts: [native, eur] });
            const onConnect = jest.mocked(NetworkService.on).mock.calls.find(([event]) => event === 'connect')?.[1];
            act(() => tree.unmount());
            expect(NetworkService.off).toHaveBeenCalledWith('connect', onConnect);
            // for the afterEach of the outer block
            await render({ Amounts: [native] });
        });

        it('closing the review stops the questions', async () => {
            accountInfo.mockRejectedValue(new Error('no connection'));
            await render({ Amounts: [native] });
            act(() => tree.unmount());
            await later(REMIT_COSTS_RETRY_MS * 4);
            expect(accountInfo).toHaveBeenCalledTimes(1);
            // for the afterEach of the outer block
            await render({ Amounts: [native] });
        });

        it('the reserves of the network are not known: the parts without amounts, no crash and no "NaN"', async () => {
            jest.spyOn(NetworkService, 'getNetworkReserve').mockImplementation(() => {
                throw new TypeError("Cannot destructure property 'base' of undefined");
            });
            doesNotExist();
            await render({ Amounts: [eur] });
            expect(lines()).toEqual([
                header('?'),
                Localize.t('payload.remitPaysActivation'),
                Localize.t('payload.remitPaysTrustLines', { count: 1 }),
            ]);
        });
    });
});
