import React from 'react';
import { InteractionManager } from 'react-native';
import renderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { binary, XrplDefinitions } from 'xrpl-accountlib';
import NetworkService from '@services/NetworkService';
import LedgerService from '@services/LedgerService';
import BackendService from '@services/BackendService';
import { Batch, NFTokenAcceptOffer, NFTokenCancelOffer } from '@common/libs/ledger/transactions';
import { InfoMessage } from '@components/General';
import BatchTemplate from '../Batch';
import AcceptTemplate from '../NFTokenAcceptOffer';
import CancelTemplate from '../NFTokenCancelOffer';
import { batchNFTokenOffersBefore } from '../batchNFTokenOffers';

jest.mock('@services/NetworkService');
jest.mock('@services/LedgerService', () => ({ __esModule: true, default: { getLedgerEntry: jest.fn() } }));
jest.mock('@services/BackendService', () => ({ __esModule: true, default: {
    getAccountWorth: jest.fn(async () => ({})), getCurrencyRate: jest.fn(async () => ({})),
} }));
jest.mock('@store/repositories', () => ({
    AccountRepository: { findOne: () => undefined },
    CoreRepository: { getSettings: () => ({ network: { key: 'MAINNET' }, currency: 'USD' }) },
}));
jest.mock('@components/General', () => ({
    AmountText: 'AmountText', ExpandableView: 'ExpandableView', InfoMessage: 'InfoMessage',
    LoadingIndicator: 'LoadingIndicator', JsonTree: 'JsonTree',
}));
jest.mock('@components/Modules', () => ({ AccountElement: 'AccountElement', NFTokenElement: 'NFTokenElement' }));
jest.mock('../registry', () => ({
    NFTokenCreateOffer: jest.requireActual('../NFTokenCreateOffer').default,
    NFTokenAcceptOffer: jest.requireActual('../NFTokenAcceptOffer').default,
    Global: () => null,
}));

const A = 'rKymSQrwRF8DcwEzyAgNLMaaSKYSMfJNDY';
const B = 'rJhJRkh1cuG7T8biiGtMDNVVjYpAY71r9D';
const firstId = '170645B2C6B2D9F393FCAFAB7FBDE3B4127E7FCDDB909BF04DFF8CA5BF5D0603';
const secondId = '622794BFC8D19CBDE43ACE20DDD80575FC2C75884F799F4F0BCDE6A677D98850';
const token = '0'.repeat(64);
const create = (change: Record<string, any> = {}): any => ({
    TransactionType: 'NFTokenCreateOffer', Account: A, Sequence: 0, TicketSequence: 63403380,
    NFTokenID: token, Amount: '0', Destination: B, Fee: '0', SigningPubKey: '', Flags: 0x40000001, ...change,
});
const accept = (change: Record<string, any> = {}): any => ({
    TransactionType: 'NFTokenAcceptOffer', Account: B, NFTokenSellOffer: firstId,
    Sequence: 104709044, Fee: '0', SigningPubKey: '', Flags: 0x40000000, ...change,
});
const before = (transactions: any[], index = transactions.length, flags = 65536) =>
    batchNFTokenOffersBefore(transactions, index, flags);

describe('exact earlier Batch NFT offer references', () => {
    it('matches both published issue399 keylet vectors for TicketSequence and Sequence', () => {
        const offers = before([create(), create({ Account: B, Sequence: 104709043, TicketSequence: undefined })]);
        expect([...offers]).toEqual([[firstId, 'sell'], [secondId, 'sell']]);
    });

    it('hashes the creator Account rather than the NFT Owner on a buy offer', () => {
        expect(before([create({ Owner: B, Flags: 0x40000000 })]).get(firstId)).toBe('buy');
    });

    it('does not use a create at or after the current inner transaction', () => {
        expect([...before([accept(), create()], 0)]).toEqual([]);
        expect([...before([create()], 0)]).toEqual([]);
    });

    it('does not choose between two creates using the same account/sequence hash', () => {
        expect(before([create(), create({ NFTokenID: '1'.repeat(64) })]).has(firstId)).toBe(false);
        expect(before([create(), accept(), create()]).has(firstId)).toBe(false);
    });

    it.each([0, 131072, 262144, 524288, 196608, 65536.5])('keeps lookup for unsupported Batch mode %s', (flags) => {
        expect(before([create()], 1, flags).size).toBe(0);
    });

    it.each([
        { Sequence: undefined, TicketSequence: undefined }, { Sequence: 1, TicketSequence: 2 },
        { Sequence: 0, TicketSequence: 0 }, { Sequence: 0, TicketSequence: 2 ** 32 },
        { Sequence: 0, TicketSequence: 1.5 }, { Account: 'invalid' }, { Flags: 1 },
        { Fee: '10' }, { SigningPubKey: 'ED00' }, { NFTokenID: 'bad' },
    ])('keeps lookup for incomplete or invalid creates: %j', (change) => {
        expect(before([create(change)]).size).toBe(0);
    });

    it.each([
        { TransactionType: 'NFTokenCancelOffer', NFTokenOffers: [firstId.toLowerCase()] },
        { TransactionType: 'NFTokenAcceptOffer', NFTokenSellOffer: firstId },
        { TransactionType: 'NFTokenAcceptOffer', NFTokenBuyOffer: firstId },
        { TransactionType: 'NFTokenBurn', NFTokenID: token },
    ])('does not treat an already removed offer as pending: %j', (removal) => {
        expect(before([create(), removal]).has(firstId)).toBe(false);
    });

    it('keeps another unconsumed offer and never mutates the inner JSON', () => {
        const raw = [create(), create({ Account: B, Sequence: 104709043, TicketSequence: undefined }), accept()];
        const saved = JSON.stringify(raw);
        expect([...before(raw)]).toEqual([[secondId, 'sell']]);
        expect(JSON.stringify(raw)).toBe(saved);
    });
});

describe('Batch offer review', () => {
    let tree: ReactTestRenderer | undefined;
    const render = async (component: React.ReactElement) => {
        await act(async () => { tree = renderer.create(component); });
        return tree!;
    };
    beforeEach(() => {
        jest.spyOn(NetworkService, 'getNetworkDefinitions')
            .mockReturnValue(new XrplDefinitions(binary.DEFAULT_DEFINITIONS));
        jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback: any) => {
            callback();
            return { cancel: jest.fn() } as any;
        });
        jest.mocked(LedgerService.getLedgerEntry).mockResolvedValue({ error: 'entryNotFound' } as any);
        jest.clearAllMocks();
    });
    afterEach(() => {
        act(() => { tree?.unmount(); }); tree = undefined;
        jest.restoreAllMocks();
    });

    it('shows translated planned-offer information and both IDs, with no lookup or signed JSON change', async () => {
        const raw = [create(), create({ Account: B, Sequence: 104709043, TicketSequence: undefined }),
            accept(), accept({ Account: A, Sequence: 0, TicketSequence: 63403381, NFTokenSellOffer: secondId })];
        const batch = new Batch({ TransactionType: 'Batch', Account: B, Sequence: 104709042, Fee: '100',
            Flags: 65536, RawTransactions: raw.map((RawTransaction) => ({ RawTransaction })) } as any);
        const saved = JSON.stringify(batch.JsonForSigning);
        const view = await render(<BatchTemplate transaction={batch} source={{ address: B } as any}
            payload={{} as any} setLoading={() => {}} setReady={() => {}} forceRender={() => {}} />);
        const messages = view.root.findAllByType(InfoMessage).filter((item) => item.props.type === 'info');
        expect(messages.map((item) => item.props.label))
            .toEqual(Array(2).fill('This offer will be created earlier in this Batch.'));
        expect(view.root.findAllByType('ExpandableView' as any).map((item) => item.props.title))
            .toEqual([firstId, secondId]);
        expect(view.root.findAllByType('View').filter((item) => item.props.testID === 'batch-created-nft-offer'))
            .toHaveLength(2);
        expect(LedgerService.getLedgerEntry).not.toHaveBeenCalled();
        expect(BackendService.getAccountWorth).not.toHaveBeenCalled();
        expect(BackendService.getCurrencyRate).not.toHaveBeenCalled();
        expect(JSON.stringify(batch.JsonForSigning)).toBe(saved);
    });

    it('also explains an exact earlier-created offer being canceled in this Batch', async () => {
        const transaction = new NFTokenCancelOffer({ TransactionType: 'NFTokenCancelOffer', Account: A,
            NFTokenOffers: [firstId], Sequence: 5, Fee: '0', SigningPubKey: '', Flags: 0x40000000 } as any);
        const view = await render(<CancelTemplate transaction={transaction} source={{ address: A } as any}
            innerBatch batchCreatedNFTokenOffers={before([create()])} payload={{} as any}
            setLoading={() => {}} setReady={() => {}} forceRender={() => {}} />);
        expect(view.root.findByType(InfoMessage).props.type).toBe('info');
        expect(LedgerService.getLedgerEntry).not.toHaveBeenCalled();
    });

    it('keeps the lookup/error for an unmatched side of a brokered accept', async () => {
        const external = 'F'.repeat(64);
        const transaction = new NFTokenAcceptOffer(accept({ NFTokenBuyOffer: external }));
        const view = await render(<AcceptTemplate transaction={transaction} source={{ address: B } as any}
            innerBatch batchCreatedNFTokenOffers={before([create()])} payload={{} as any}
            setLoading={() => {}} setReady={() => {}} forceRender={() => {}} />);
        expect(view.root.findAllByType(InfoMessage).map((item) => item.props.type)).toEqual(['info', 'error']);
        expect(LedgerService.getLedgerEntry).toHaveBeenCalledTimes(1);
        expect(LedgerService.getLedgerEntry).toHaveBeenCalledWith({ index: external });
    });

    it.each([
        { innerBatch: false, side: 'sell', id: firstId },
        { innerBatch: true, side: 'buy', id: firstId },
        { innerBatch: true, side: 'sell', id: 'F'.repeat(64) },
    ])('keeps the real lookup/error for standalone, wrong-side and external offers: %j', async (context) => {
        const transaction = new NFTokenAcceptOffer(accept({ NFTokenSellOffer: context.id }));
        const planned = new Map([[firstId, context.side as 'buy' | 'sell']]);
        const view = await render(<AcceptTemplate transaction={transaction} source={{ address: B } as any}
            innerBatch={context.innerBatch} batchCreatedNFTokenOffers={planned}
            payload={{} as any} setLoading={() => {}} setReady={() => {}} forceRender={() => {}} />);
        expect(LedgerService.getLedgerEntry).toHaveBeenCalledWith({ index: context.id });
        expect(view.root.findAllByType(InfoMessage).filter((item) => item.props.type === 'error')).toHaveLength(1);
    });
});
