/**
 * Send, recipient search: the result on screen belongs to the text in the field.
 *
 * Every key runs onSearch. A text that is not a complete address is searched 500 ms later; a
 * complete address is looked up at once. A search that started for an earlier text must not
 * replace the result of a later one (issue 525: an address typed key by key ended in "No search
 * result", because the search for the address less its last character was still waiting).
 */
import { BackendService, ResolverService } from '@services';

import RecipientStep from '../RecipientStep';

jest.mock('@store/repositories', () => ({
    CoreRepository: { getSettings: () => ({ developerMode: false }) },
    AccountRepository: { getAccounts: () => ({ sorted: () => [] }) },
    ContactRepository: { getContacts: () => [] },
}));

jest.mock('@services', () => ({
    BackendService: { lookup: jest.fn(), getAddressInfo: jest.fn() },
    ResolverService: { getAccountName: jest.fn() },
    LedgerService: {},
    NetworkService: {},
    StyleService: { value: (v: any) => v, create: (v: any) => v, select: (v: any) => v },
}));

const ADDRESS = 'rJ9uJ32u3Y46RenZrfvdYWjVf5ReKwf5Wr';

const after = <T,>(ms: number, value: T) =>
    new Promise<T>((resolve) => {
        setTimeout(() => resolve(value), ms);
    });

// the step with its state and context, without a renderer
const makeStep = () => {
    const setDestination = jest.fn();
    const step = new RecipientStep({}) as any;
    step.context = { setDestination, destination: undefined, scanResult: undefined };
    step.setState = (patch: any) => {
        Object.assign(step.state, typeof patch === 'function' ? patch(step.state) : patch);
    };
    // the addresses of the rows on screen (a section without rows has a placeholder: no address)
    const shown = () =>
        (step.state.dataSource as any[])
            .flatMap((section) => section.data)
            .map((item: any) => item.address)
            .filter(Boolean);
    return { step, setDestination, shown };
};

// the backends answer after the given times
const backends = ({ textSearchMs = 100, addressLookupMs = 100 } = {}) => {
    (BackendService.lookup as jest.Mock).mockImplementation(() => after(textSearchMs, { matches: [] }));
    (ResolverService.getAccountName as jest.Mock).mockImplementation((address: string) =>
        after(addressLookupMs, { name: '', address, source: '', kycApproved: false }),
    );
    (BackendService.getAddressInfo as jest.Mock).mockImplementation((address: string) =>
        after(addressLookupMs, { account: address, name: '', blocked: false }),
    );
};

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('an address that is typed key by key', () => {
    it('is found: the search for the text before the last key does not run any more', async () => {
        backends();
        const { step, setDestination, shown } = makeStep();

        step.onSearch(ADDRESS.slice(0, -1));
        await jest.advanceTimersByTimeAsync(125);
        step.onSearch(ADDRESS);
        await jest.advanceTimersByTimeAsync(5000);

        expect(BackendService.lookup).not.toHaveBeenCalled();
        expect(shown()).toEqual([ADDRESS]);
        expect(step.state.isSearching).toBe(false);
        expect(setDestination).toHaveBeenLastCalledWith(expect.objectContaining({ address: ADDRESS }));
    });

    it('is found also when the search for the earlier text is already at the backend', async () => {
        // the text search started (the pause before the last key was longer than 500 ms) and its
        // answer comes after the answer for the address
        backends({ textSearchMs: 2000, addressLookupMs: 100 });
        const { step, setDestination, shown } = makeStep();

        step.onSearch(ADDRESS.slice(0, -1));
        await jest.advanceTimersByTimeAsync(600);
        expect(BackendService.lookup).toHaveBeenCalledTimes(1);
        step.onSearch(ADDRESS);
        await jest.advanceTimersByTimeAsync(5000);

        expect(shown()).toEqual([ADDRESS]);
        expect(setDestination).toHaveBeenLastCalledWith(expect.objectContaining({ address: ADDRESS }));
    });

    it('with a space after it (two address lookups in a row) is found once', async () => {
        backends();
        const { step, shown } = makeStep();

        step.onSearch(ADDRESS.slice(0, -1));
        await jest.advanceTimersByTimeAsync(125);
        step.onSearch(ADDRESS);
        await jest.advanceTimersByTimeAsync(50);
        step.onSearch(`${ADDRESS} `);
        await jest.advanceTimersByTimeAsync(5000);

        expect(shown()).toEqual([ADDRESS]);
    });
});

describe('the text changes while a lookup of an address is under way', () => {
    it('to a text that is no address: the answer for the address is not shown', async () => {
        backends({ textSearchMs: 100, addressLookupMs: 3000 });
        const { step, setDestination, shown } = makeStep();

        step.onSearch(ADDRESS);
        await jest.advanceTimersByTimeAsync(100);
        step.onSearch(`${ADDRESS}x`);
        await jest.advanceTimersByTimeAsync(8000);

        expect(shown()).toEqual([]);
        expect(step.state.isSearching).toBe(false);
        expect(setDestination).not.toHaveBeenCalledWith(expect.objectContaining({ address: ADDRESS }));
    });

    it('to nothing (the field is cleared): the answer for the address is not shown', async () => {
        backends({ addressLookupMs: 3000 });
        const { step, setDestination, shown } = makeStep();

        step.onSearch(ADDRESS);
        await jest.advanceTimersByTimeAsync(100);
        step.onSearch('');
        await jest.advanceTimersByTimeAsync(8000);

        expect(shown()).toEqual([]);
        // the pull-to-refresh spinner does not stay on for a search that no longer reports back
        expect(step.state.isSearching).toBe(false);
        expect(setDestination).toHaveBeenLastCalledWith(undefined);
    });
});

describe('what worked before still works', () => {
    it('an address in one piece (paste, QR scan) is found', async () => {
        backends();
        const { step, setDestination, shown } = makeStep();

        step.onSearch(ADDRESS);
        await jest.advanceTimersByTimeAsync(5000);

        expect(shown()).toEqual([ADDRESS]);
        expect(setDestination).toHaveBeenLastCalledWith(expect.objectContaining({ address: ADDRESS }));
    });

    it('a text is searched once, 500 ms after the last key', async () => {
        backends();
        const { step } = makeStep();

        step.onSearch('wiet');
        await jest.advanceTimersByTimeAsync(200);
        step.onSearch('wiets');
        await jest.advanceTimersByTimeAsync(200);
        step.onSearch('wietse');
        await jest.advanceTimersByTimeAsync(499);
        expect(BackendService.lookup).not.toHaveBeenCalled();
        await jest.advanceTimersByTimeAsync(5000);

        expect(BackendService.lookup).toHaveBeenCalledTimes(1);
        expect(BackendService.lookup).toHaveBeenCalledWith('wietse');
        expect(step.state.isSearching).toBe(false);
    });
});
