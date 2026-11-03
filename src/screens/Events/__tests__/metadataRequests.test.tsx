import React from 'react';
import { AccountRepository, CoreRepository } from '@store/repositories';
import LedgerService from '@services/LedgerService';
import NetworkService from '@services/NetworkService';
import { TransactionFactory } from '@common/libs/ledger/factory';
import AppConfig from '@common/constants/config';
import EventsView from '../EventsView';

jest.mock('@services/NetworkService');
jest.mock('@services/BackendService', () => ({ __esModule: true, default: { ping: jest.fn() } }));
jest.mock('@components/General', () => ({
    Spacer: () => null, Button: () => null, Header: () => null, SearchBar: () => null,
    SegmentButtons: class extends React.Component { render() { return null; } },
}));
jest.mock('@components/Modules', () => ({ EventsFilterChip: () => null, EventsList: () => null }));

const owner = 'rQQQrUdN1cLdNmxH4dHfKgmX5P4kf3ZrM';
let issuance: string;
let networkNumber = 0;
const deferred = () => {
    let resolve: (value: any) => void = () => undefined;
    let reject: (reason: Error) => void = () => undefined;
    const promise = new Promise<any>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};
const setup = () => {
    const view = new EventsView({});
    jest.spyOn(view, 'setState').mockImplementation((update: any, callback?: () => void) => {
        Object.assign(view.state, typeof update === 'function' ? update(view.state, view.props) : update);
        callback?.();
    });
    return view;
};
const holding = (sequence = 123 + networkNumber) => ({
    LedgerEntryType: 'MPToken', MPTokenIssuanceID: issuance, PreviousTxnLgrSeq: sequence,
});

beforeEach(() => {
    networkNumber++;
    issuance = `${networkNumber.toString(16).padStart(8, '0')}B5F762798A53D543A014CAF8B297CFF8F2F937E8`;
    jest.spyOn(NetworkService, 'getNetwork').mockReturnValue({ id: `network-${networkNumber}`, key: 'MAINNET' });
    jest.spyOn(NetworkService, 'getConnectedEndpoint').mockReturnValue('wss://example.test');
    jest.spyOn(CoreRepository, 'getSettings').mockReturnValue({} as any);
    jest.spyOn(CoreRepository, 'getDefaultAccount').mockReturnValue({ address: owner, isValid: () => true } as any);
    jest.spyOn(AccountRepository, 'getRegularKeys').mockReturnValue([]);
});
afterEach(() => jest.restoreAllMocks());

it('shares one issuance lookup across 15 transactions and still builds every row', async () => {
    const view = setup();
    const transactions = Array.from({ length: 15 }, (_, index) => ({
        tx: { TransactionType: 'MPTokenAuthorize', MPTokenIssuanceID: issuance, Account: owner, hash: `hash-${index}` },
        meta: { TransactionResult: 'tesSUCCESS', AffectedNodes: [] },
    }));
    jest.spyOn(LedgerService, 'getTransactions').mockResolvedValue({ transactions } as any);
    const reply = deferred();
    const fetch = jest.spyOn(LedgerService, 'getLedgerEntry').mockReturnValue(reply.promise);
    const parse = jest.spyOn(TransactionFactory, 'fromLedger').mockImplementation((item) => item as any);
    const loading = view.loadTransactions();
    await Promise.resolve();
    const requestsBeforeReply = fetch.mock.calls.length;
    reply.resolve({ node: { AssetScale: 2 } });
    await loading;

    expect(requestsBeforeReply).toBe(1);
    expect(parse).toHaveBeenCalledTimes(15);
    expect(view.state.transactions).toHaveLength(15);
    transactions.forEach((item) => {
        expect((item.meta as any)._attachments.MPTokenIssuance.AssetScale).toBe(2);
    });
});

it('shares issuance and ledger lookups across holdings and reuses completed results', async () => {
    const view = setup();
    const reply = deferred();
    const fetch = jest.spyOn(LedgerService, 'getLedgerEntry').mockReturnValue(reply.promise);
    const objects = Array.from({ length: 15 }, () => holding());
    const loading = view.enrichIncompleteObjects(objects as any);
    const requestsBeforeReply = fetch.mock.calls.length;
    reply.resolve({ node: { AssetScale: 2 }, ledger: { close_time_iso: '2026-01-01T00:00:00Z' } });
    await loading;
    const next = holding();
    await view.enrichIncompleteObjects([next] as any);

    expect(requestsBeforeReply).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    objects.concat(next).forEach((item: any) => {
        expect(item._MPTokenIssuanceID.AssetScale).toBe(2);
        expect(item.Date).toBe('2026-01-01T00:00:00Z');
    });
});

it('shares a ledger-date lookup across credentials without changing their dates', async () => {
    const view = setup();
    const reply = deferred();
    const fetch = jest.spyOn(LedgerService, 'getLedgerEntry').mockReturnValue(reply.promise);
    const objects = Array.from({ length: 15 }, () => ({
        LedgerEntryType: 'Credential', PreviousTxnLgrSeq: 123 + networkNumber,
    }));
    const loading = view.enrichIncompleteObjects(objects as any);
    const requestsBeforeReply = fetch.mock.calls.length;
    reply.resolve({ ledger: { close_time_iso: '2026-01-01T00:00:00Z' } });
    await loading;
    expect(requestsBeforeReply).toBe(1);
    objects.forEach((item: any) => expect(item.Date).toBe('2026-01-01T00:00:00Z'));
});

it('keeps hook-rejected transactions in the Events list', async () => {
    const view = setup();
    jest.spyOn(LedgerService, 'getTransactions').mockResolvedValue({ transactions: [{
        tx: { TransactionType: 'MPTokenAuthorize', Account: owner, MPTokenIssuanceID: issuance },
        meta: { TransactionResult: 'tecHOOK_REJECTED', AffectedNodes: [] },
    }] } as any);
    const fetch = jest.spyOn(LedgerService, 'getLedgerEntry').mockResolvedValue({ node: { AssetScale: 2 } } as any);
    jest.spyOn(TransactionFactory, 'fromLedger').mockImplementation((item) => item as any);
    await expect(view.loadTransactions()).resolves.toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
});

it.each(['network', 'node'])('does not reuse metadata after a %s change', async (change) => {
    const view = setup();
    const fetch = jest.spyOn(LedgerService, 'getLedgerEntry').mockResolvedValue({ node: { AssetScale: 2 } } as any);
    await view.enrichIncompleteObjects([holding()] as any);
    if (change === 'network') {
        jest.mocked(NetworkService.getNetwork).mockReturnValue({ id: 'another-network', key: 'TESTNET' });
    } else {
        jest.mocked(NetworkService.getConnectedEndpoint).mockReturnValue('wss://another.test');
    }
    fetch.mockResolvedValue({ node: { AssetScale: 6 } } as any);
    const other = holding();
    await view.enrichIncompleteObjects([other] as any);
    expect((other as any)._MPTokenIssuanceID.AssetScale).toBe(6);
    expect(fetch).toHaveBeenCalledTimes(4);
});

it.each(['reject', 'rpc-error'])('retries a failed metadata lookup (%s)', async (failure) => {
    const view = setup();
    const fetch = jest.spyOn(LedgerService, 'getLedgerEntry');
    if (failure === 'reject') fetch.mockRejectedValue(new Error('Offline'));
    else fetch.mockResolvedValue({ error: 'entryNotFound' } as any);
    await view.enrichIncompleteObjects([holding()] as any);
    fetch.mockResolvedValue({ node: { AssetScale: 2 } } as any);
    const retry = holding();
    await view.enrichIncompleteObjects([retry] as any);
    expect((retry as any)._MPTokenIssuanceID.AssetScale).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(4);
});

it('keeps a late reply in its own network cache', async () => {
    const view = setup();
    const old = deferred();
    const fetch = jest.spyOn(LedgerService, 'getLedgerEntry').mockReturnValue(old.promise);
    const loading = view.enrichIncompleteObjects([holding()] as any);
    jest.mocked(NetworkService.getNetwork).mockReturnValue({ id: 'late-reply-network', key: 'TESTNET' });
    fetch.mockResolvedValue({ node: { AssetScale: 6 } } as any);
    await view.enrichIncompleteObjects([holding()] as any);
    old.resolve({ node: { AssetScale: 2 } });
    await loading;
    const next = holding();
    await view.enrichIncompleteObjects([next] as any);
    expect((next as any)._MPTokenIssuanceID.AssetScale).toBe(6);
    expect(fetch).toHaveBeenCalledTimes(4);
});

it.each(['failed', 'hidden-fee'])('does not fetch metadata for a %s transaction that is filtered out', async (kind) => {
    const view = setup();
    Object.assign(view.state, { hideServiceFeeTransactions: true });
    const tx = kind === 'failed'
        ? { TransactionType: 'MPTokenAuthorize', MPTokenIssuanceID: issuance, Account: owner }
        : { TransactionType: 'Payment', Account: owner, Destination: AppConfig.feeAccount,
            Amount: { mpt_issuance_id: issuance, value: '10' } };
    jest.spyOn(LedgerService, 'getTransactions').mockResolvedValue({ transactions: [{
        tx, meta: { TransactionResult: kind === 'failed' ? 'tecNO_PERMISSION' : 'tesSUCCESS', AffectedNodes: [] },
    }] } as any);
    const fetch = jest.spyOn(LedgerService, 'getLedgerEntry').mockResolvedValue({ node: { AssetScale: 2 } } as any);
    await expect(view.loadTransactions()).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
});
