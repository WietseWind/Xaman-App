/**
 * Review of a Remit sign request (issue 530): what the Remit carries is shown block by block, and
 * nothing of it lands under "Extra fields".
 */
import React from 'react';
import renderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import NetworkService from '@services/NetworkService';
import { Remit } from '@common/libs/ledger/transactions';
import { createNetworkDefinitions } from '@common/libs/ledger/utils/normalizeDefinitions';
import liveXahau from '@common/libs/ledger/utils/__tests__/fixtures/definitions/live-xahau.json';
import Localize from '@locale';

import RemitTemplate from '../Remit';
import { remitContents, readableUri } from '../remitContents';

jest.mock('@services/NetworkService', () => ({
    __esModule: true,
    default: {
        getNetworkDefinitions: jest.fn(),
        getNetworkId: () => 21337,
        getNetwork: () => ({ id: 'remit-review-test' }),
        getNativeAsset: () => 'XAH',
    },
}));
jest.mock('@components/Modules', () => ({
    AccountElement: 'AccountElement',
    CurrencyElement: 'CurrencyElement',
    URITokenElement: 'URITokenElement',
}));
jest.mock('@components/General', () => ({
    AmountText: 'AmountText',
    Icon: 'Icon',
    InfoMessage: 'InfoMessage',
    ReadMore: 'ReadMore',
    TouchableDebounce: 'TouchableDebounce',
}));

const hex = (text: string) => Buffer.from(text, 'utf8').toString('hex').toUpperCase();

const Account = 'rwietsevLFg8XSmG3bEZzFein1g8RBqWDZ';
const Destination = 'rtipboteEEZ6JkTNvcYgUZbiYyrV2W7DQ';
const Issuer = 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq';
const Informed = 'rQHGELnuopj4fWjsrbMA53ViqRLt5bS8Hb';
const TokenA = 'A'.repeat(64);
const TokenB = 'B'.repeat(64);
const Digest = 'C'.repeat(64);

// the request of the issue: one native amount and a hook parameter
const tipbot = {
    TransactionType: 'Remit',
    Account,
    Destination,
    Amounts: [{ AmountEntry: { Amount: '1000000' } }],
    HookParameters: [
        {
            HookParameter: {
                HookParameterName: '4445504F534954',
                HookParameterValue: '0100000000000000000000005562000B00000000',
            },
        },
    ],
    NetworkID: 21337,
    Fee: '3108',
    Sequence: 1,
};

// everything a Remit can carry
const full = {
    ...tipbot,
    Amounts: [
        { AmountEntry: { Amount: '2500000' } },
        { AmountEntry: { Amount: { currency: 'EUR', issuer: Issuer, value: '12.5' } } },
    ],
    URITokenIDs: [TokenA, TokenB],
    MintURIToken: { URI: hex('ipfs://bafybeigdyr/meta.json?v=1&x=%20'), Digest, Flags: 1 },
    Inform: Informed,
};

const remit = (json: Record<string, unknown>) => new Remit(json as any);

beforeEach(() => {
    jest.mocked(NetworkService.getNetworkDefinitions).mockReturnValue(createNetworkDefinitions(liveXahau) as any);
    Localize.setLocale('en');
});

describe('nothing that the Remit screen shows is an "extra field"', () => {
    it('the request of the issue has no extra fields (it listed Amounts[0].AmountEntry.Amount)', () => {
        expect(remit(tipbot).ExtraFields).toEqual([]);
    });

    it('a Remit with amounts, URITokens, a mint and Inform has no extra fields', () => {
        expect(remit(full).ExtraFields).toEqual([]);
    });

    it('a field that the screen does not show is still an extra field, also inside an amount entry', () => {
        const json = {
            ...tipbot,
            Amounts: [{ AmountEntry: { Amount: '1000000', Flags: 7 } }],
        };
        expect(remit(json).ExtraFields).toEqual([{ name: 'Amounts[0].AmountEntry.Flags', value: 7 }]);
    });

    it('what is signed does not change: the amounts are in the bytes as given', () => {
        expect(remit(full).JsonForSigning.Amounts).toEqual(full.Amounts);
    });
});

describe('the contents of a Remit, one by one', () => {
    it('amounts first, then the URITokens to transfer, then the URIToken to mint', () => {
        const contents = remitContents(remit(full));
        expect(contents.map((content) => content.kind)).toEqual(['amount', 'amount', 'uritoken', 'uritoken', 'mint']);
        expect(contents[0]).toMatchObject({ amount: { currency: 'XAH', value: '2.5' } });
        expect(contents[1]).toMatchObject({ amount: { currency: 'EUR', issuer: Issuer, value: '12.5' } });
        expect(contents[2]).toMatchObject({ id: TokenA });
        expect(contents[3]).toMatchObject({ id: TokenB });
        expect(contents[4]).toMatchObject({
            uriText: 'ipfs://bafybeigdyr/meta.json?v=1&x=%20',
            digest: Digest,
            burnable: true,
            otherFlags: undefined,
        });
    });

    it('a Remit that only activates an account has no contents', () => {
        expect(remitContents(remit({ TransactionType: 'Remit', Account, Destination }))).toEqual([]);
    });

    it('a mint without flags is not burnable; a flag this screen does not know is shown as a number', () => {
        const plain = remitContents(remit({ ...tipbot, Amounts: undefined, MintURIToken: { URI: hex('a') } }));
        expect(plain[0]).toMatchObject({ kind: 'mint', burnable: false, otherFlags: undefined });
        const unknown = remitContents(
            remit({ ...tipbot, Amounts: undefined, MintURIToken: { URI: hex('a'), Flags: 5 } }),
        );
        expect(unknown[0]).toMatchObject({ kind: 'mint', burnable: true, otherFlags: 4 });
    });

    it('a URI is shown as text only when its bytes are text', () => {
        expect(readableUri(hex('https://example.com/a?b=c&d=%20#e'))).toBe('https://example.com/a?b=c&d=%20#e');
        expect(readableUri(hex('ipfs://bafy'))).toBe('ipfs://bafy');
        expect(readableUri('FFFE00')).toBeUndefined();
        expect(readableUri(hex('line\nbreak'))).toBe('line break');
        expect(readableUri(hex('bell\u0007'))).toBeUndefined();
        expect(readableUri('ABC')).toBeUndefined();
        expect(readableUri('')).toBeUndefined();
    });
});

describe('the Remit screen', () => {
    let tree: ReactTestRenderer;
    const render = (json: Record<string, unknown>) => {
        act(() => {
            tree = renderer.create(React.createElement(RemitTemplate as any, { transaction: remit(json) }));
        });
    };
    const texts = () =>
        tree.root
            .findAllByType(Text)
            .flatMap((node) => node.props.children)
            .filter((child) => typeof child === 'string' || typeof child === 'number')
            .join('|');
    const block = (key: string) => tree.root.findByProps({ testID: `remit-content-${key}` });

    afterEach(() => act(() => tree.unmount()));

    it('shows a block for every amount, every URIToken and the mint, each with its place in the count', () => {
        render(full);
        expect(texts()).toContain(Localize.t('events.remitContents'));
        const counts = ['amount-0', 'amount-1', 'uritoken-0', 'uritoken-1', 'mint'].map((key) =>
            block(key)
                .findAllByType(Text)
                .flatMap((node) => node.props.children)
                .join(''),
        );
        expect(counts[0]).toContain('(1/5)');
        expect(counts[1]).toContain('(2/5)');
        expect(counts[2]).toContain('(3/5)');
        expect(counts[3]).toContain('(4/5)');
        expect(counts[4]).toContain('(5/5)');
    });

    it('an amount is the token (icon and name) and its value: the native asset without an issuer', () => {
        render(full);
        const native = block('amount-0').findByType('CurrencyElement' as any).props;
        expect(native.currency).toBe('XAH');
        expect(native.issuer).toBeUndefined();
        expect(block('amount-0').findByType('AmountText' as any).props).toMatchObject({
            value: '2.5',
            currency: 'XAH',
        });
        // the native amount is on one line with its icon and name
        expect(block('amount-0').findAllByProps({ testID: 'remit-native-amount' }).length).toBeGreaterThan(0);
        expect(block('amount-0').findAllByProps({ testID: 'remit-issued-amount' })).toHaveLength(0);
        expect(block('amount-1').findByType('CurrencyElement' as any).props).toMatchObject({
            issuer: Issuer,
            currency: 'EUR',
        });
        expect(block('amount-1').findByType('AmountText' as any).props).toMatchObject({
            value: '12.5',
            currency: 'EUR',
        });
        // an issued amount is under its issuer, in the middle
        expect(block('amount-1').findAllByProps({ testID: 'remit-issued-amount' }).length).toBeGreaterThan(0);
    });

    it('a URIToken to transfer is the URIToken card, which looks the token up itself', () => {
        render(full);
        expect(block('uritoken-0').findByType('URITokenElement' as any).props).toMatchObject({ uriTokenId: TokenA });
        expect(block('uritoken-1').findByType('URITokenElement' as any).props).toMatchObject({ uriTokenId: TokenB });
    });

    it('the mint shows the URI as text with its bytes, the digest, and that the issuer can burn it', () => {
        render(full);
        const mint = block('mint')
            .findAllByType(Text)
            .flatMap((node) => node.props.children)
            .join('|');
        expect(mint).toContain('ipfs://bafybeigdyr/meta.json?v=1&x=%20');
        expect(mint).toContain(full.MintURIToken.URI);
        expect(mint).toContain(Digest);
        expect(block('mint').findByType('InfoMessage' as any).props.label).toBe(
            Localize.t('payload.theIssuerCanBurnThisToken'),
        );
    });

    it('a URI that is not text is shown as its bytes only, and a mint that is not burnable has no note', () => {
        render({ ...tipbot, Amounts: undefined, MintURIToken: { URI: 'FFFE00' } });
        const mint = block('mint')
            .findAllByType(Text)
            .flatMap((node) => node.props.children)
            .join('|');
        expect(mint).toContain('FFFE00');
        expect(block('mint').findAllByType('InfoMessage' as any)).toHaveLength(0);
    });

    it('the destination and the account to inform are account blocks', () => {
        render(full);
        const accounts = tree.root.findAllByType('AccountElement' as any).map((node) => node.props.address);
        expect(accounts).toEqual([Destination, Informed]);
    });

    it('the request of the issue: one block, the native amount', () => {
        render(tipbot);
        expect(block('amount-0').findByType('AmountText' as any).props).toMatchObject({ value: '1', currency: 'XAH' });
        expect(tree.root.findAllByProps({ testID: 'remit-content-amount-1' })).toHaveLength(0);
    });
});
