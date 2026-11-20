/**
 * The URIToken card looks the token up on the ledger and then at the backend. A connection that does
 * not answer must not leave the card as a placeholder without the token ID (issue 530).
 */
import React from 'react';
import renderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { Animated, InteractionManager, Text } from 'react-native';

import LedgerService from '@services/LedgerService';
import BackendService from '@services/BackendService';

import URITokenElement, { URITOKEN_PLACEHOLDER_MAX_MS } from '../URITokenElement';

jest.mock('@services/LedgerService', () => ({ __esModule: true, default: { getLedgerEntry: jest.fn() } }));
jest.mock('@services/BackendService', () => ({ __esModule: true, default: { getNFTDetails: jest.fn() } }));
jest.mock('@services/StyleService', () => ({ __esModule: true, default: { getImage: () => ({ uri: 'blank' }) } }));
jest.mock('@components/General', () => ({ Avatar: 'Avatar', InfoMessage: 'InfoMessage' }));
jest.mock('../styles', () => ({ __esModule: true, default: {} }));
jest.mock('@theme', () => ({ AppStyles: {} }));
jest.mock('@locale', () => ({ __esModule: true, default: { t: (key: string) => key } }));

const Id = 'A'.repeat(64);
const Owner = 'rtipboteEEZ6JkTNvcYgUZbiYyrV2W7DQ';
const node = { LedgerEntryType: 'URIToken', index: Id, Owner, Issuer: Owner, URI: '6170', Flags: 1 };

const ledgerEntry = jest.mocked(LedgerService.getLedgerEntry);
const details = jest.mocked(BackendService.getNFTDetails);

let tree: ReactTestRenderer;
const render = async () => {
    await act(async () => {
        tree = renderer.create(<URITokenElement uriTokenId={Id} truncate={false} showBurnableStatus />);
    });
};
const later = async (ms: number) => {
    await act(async () => {
        jest.advanceTimersByTime(ms);
    });
};
const texts = () =>
    tree.root
        .findAllByType(Text)
        .map((element) => element.props.children)
        // the placeholder is two lines of spaces
        .filter((child) => typeof child === 'string' && child.trim().length > 0);
const never = () => new Promise(() => undefined) as any;

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // the placeholder pulses until the look-up ends: no animation in a test
    jest.spyOn(Animated, 'sequence').mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() } as any);
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(((task: () => void) => {
        task();
        return { then: jest.fn(), done: jest.fn(), cancel: jest.fn() };
    }) as any);
});
afterEach(() => {
    act(() => tree.unmount());
    jest.useRealTimers();
});

describe('the URIToken card and a connection that fails', () => {
    it('the ledger answers and the backend knows the token: name and ID', async () => {
        ledgerEntry.mockResolvedValue({ node } as any);
        details.mockResolvedValue({ tokenData: { [Id]: { name: 'A token', image: 'https://x/y.png' } } } as any);
        await render();
        expect(texts()).toEqual(['A token', Id]);
        expect(tree.root.findAllByType('InfoMessage' as any)).toHaveLength(1);
    });

    it('the ledger says an error, or the request fails: the token ID, no name, at once', async () => {
        ledgerEntry.mockResolvedValue({ error: 'entryNotFound' } as any);
        await render();
        expect(texts()).toEqual(['[global.noNameFound]', Id]);

        act(() => tree.unmount());
        ledgerEntry.mockRejectedValue(new Error('Request timeout'));
        await render();
        expect(texts()).toEqual(['[global.noNameFound]', Id]);
        expect(details).not.toHaveBeenCalled();
    });

    it('the ledger does not answer: the placeholder ends after a few seconds and the ID shows', async () => {
        ledgerEntry.mockReturnValue(never());
        await render();
        expect(texts()).toEqual([]);
        await later(URITOKEN_PLACEHOLDER_MAX_MS - 1);
        expect(texts()).toEqual([]);
        await later(1);
        expect(texts()).toEqual(['[global.noNameFound]', Id]);
    });

    it('the backend does not answer: the same, and what the ledger said is not lost when it comes', async () => {
        ledgerEntry.mockResolvedValue({ node } as any);
        let answer: (value: unknown) => void = () => undefined;
        details.mockReturnValue(
            new Promise((resolve) => {
                answer = resolve;
            }) as any,
        );
        await render();
        expect(texts()).toEqual([]);
        await later(URITOKEN_PLACEHOLDER_MAX_MS);
        expect(texts()).toEqual(['[global.noNameFound]', Id]);

        // the late answer still fills the card in
        await act(async () => {
            answer({ tokenData: { [Id]: { name: 'Late token' } } });
        });
        expect(texts()).toEqual(['Late token', Id]);
        expect(tree.root.findAllByType('InfoMessage' as any)).toHaveLength(1);
    });

    it('the backend fails: the token ID and what the ledger knows (the issuer can burn it)', async () => {
        ledgerEntry.mockResolvedValue({ node } as any);
        details.mockRejectedValue(new Error('timeout'));
        await render();
        expect(texts()).toEqual(['[global.noNameFound]', Id]);
        expect(tree.root.findAllByType('InfoMessage' as any)).toHaveLength(1);
    });

    it('a card that is closed while it waits does nothing more', async () => {
        let answer: (value: unknown) => void = () => undefined;
        ledgerEntry.mockReturnValue(
            new Promise((resolve) => {
                answer = resolve;
            }) as any,
        );
        const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        await render();
        act(() => tree.unmount());
        await later(URITOKEN_PLACEHOLDER_MAX_MS * 2);
        await act(async () => {
            answer({ node });
        });
        expect(details).not.toHaveBeenCalled();
        expect(errors).not.toHaveBeenCalled();
        errors.mockRestore();
        // for the afterEach
        ledgerEntry.mockResolvedValue({ error: 'entryNotFound' } as any);
        await render();
    });
});
