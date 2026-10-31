import ContactRepository from '@store/repositories/contact';
import ResolverService from '@services/ResolverService';
import BackendService from '@services/BackendService';
import AccountRepository from '@store/repositories/account';

const findContact = jest.fn();

jest.mock('@store/repositories/contact', () => ({
    __esModule: true,
    default: {
        on: jest.fn(),
        off: jest.fn(),
        findOne: (...args: unknown[]) => findContact(...args),
    },
}));

jest.mock('@store/repositories/account', () => ({
    __esModule: true,
    default: {
        on: jest.fn(),
        off: jest.fn(),
        findOne: jest.fn(() => null),
    },
}));

jest.mock('@store/repositories', () => ({
    CurrencyRepository: {
        on: jest.fn(),
        off: jest.fn(),
        findAll: jest.fn(() => []),
        update: jest.fn(),
    },
}));

jest.mock('@services/BackendService', () => ({
    __esModule: true,
    default: {
        getAddressInfo: jest.fn(),
        syncTokensDetails: jest.fn(),
    },
}));

jest.mock('@services/LedgerService', () => ({
    __esModule: true,
    default: {},
}));

jest.mock('@services/LoggerService', () => ({
    __esModule: true,
    default: {
        createLogger: () => ({
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
        }),
    },
}));

const ADDRESS = 'rCacheGuardAddressBook';

describe('ResolverService account name cache', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        findContact.mockReset();
        (BackendService.getAddressInfo as jest.Mock).mockReset();
        (AccountRepository.findOne as jest.Mock).mockReset();
        await ResolverService.initialize();
        await ResolverService.clearCache();
    });

    it('does not put a lookup that finished after a contact change back in the cache', async () => {
        let releaseLookup: (contact: { name?: string } | null) => void = () => undefined;
        findContact.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    releaseLookup = resolve;
                }),
        );
        findContact.mockResolvedValue({ name: 'Address Book' });

        const pending = ResolverService.getAccountName(ADDRESS, undefined, true);

        const contactListener = (ContactRepository.on as jest.Mock).mock.calls.find(
            ([event]) => event === 'contactCreate',
        )?.[1] as ((contact: { address: string }) => void) | undefined;

        expect(contactListener).toEqual(expect.any(Function));
        contactListener?.({ address: ADDRESS });

        releaseLookup(null);
        const stale = await pending;

        const fresh = await ResolverService.getAccountName(ADDRESS, undefined, true);
        const cached = await ResolverService.getAccountName(ADDRESS, undefined, true);

        expect(stale.name).toBeUndefined();
        expect(fresh.name).toBe('Address Book');
        expect(cached.name).toBe('Address Book');
        expect(findContact).toHaveBeenCalledTimes(2);
    });
});

describe('resolver cache scope', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        findContact.mockReturnValue(null);
        (AccountRepository.findOne as jest.Mock).mockReturnValue(null);
        (BackendService.getAddressInfo as jest.Mock).mockResolvedValue({ name: 'Backend', blocked: true });
        await ResolverService.initialize();
        await ResolverService.clearCache();
    });

    it.each([true, false])('separates local/full lookups with internal-first=%s', async (internalFirst) => {
        const first = await ResolverService.getAccountName(ADDRESS, 123, internalFirst);
        const second = await ResolverService.getAccountName(ADDRESS, 123, !internalFirst);
        const local = internalFirst ? first : second;
        const full = internalFirst ? second : first;
        expect(local.name).toBeUndefined();
        expect(local.blocked).toBeUndefined();
        expect(full.name).toBe('Backend');
        expect(full.blocked).toBe(true);
        await ResolverService.getAccountName(ADDRESS, 123, true);
        await ResolverService.getAccountName(ADDRESS, 123, false);
        expect(BackendService.getAddressInfo).toHaveBeenCalledTimes(1);
        expect(findContact).toHaveBeenCalledTimes(2);
    });

    it('deduplicates in-flight requests only within their own lookup mode', async () => {
        let release: (value: any) => void = () => undefined;
        (BackendService.getAddressInfo as jest.Mock).mockReturnValue(
            new Promise((resolve) => {
                release = resolve;
            }),
        );
        const first = ResolverService.getAccountName(ADDRESS);
        const second = ResolverService.getAccountName(ADDRESS);
        const local = await ResolverService.getAccountName(ADDRESS, undefined, true);
        expect(local.name).toBeUndefined();
        release({ name: 'Backend', blocked: true });
        expect((await first).name).toBe('Backend');
        expect((await second).name).toBe('Backend');
        expect(BackendService.getAddressInfo).toHaveBeenCalledTimes(1);
    });

    it.each(['destinationTag', 'tag'])(
        'invalidates both modes on a tagged contact event using %s',
        async (field) => {
            findContact.mockReturnValue({ name: 'Before' });
            for (const internal of [false, true])
                {await ResolverService.getAccountName(ADDRESS, 123, internal);}
            findContact.mockReturnValue({ name: 'After' });
            const listener = (ContactRepository.on as jest.Mock).mock.calls.find(
                ([event]) => event === 'contactRemove',
            )![1];
            listener({ address: ADDRESS, [field]: '123' });
            for (const internal of [false, true])
                {expect((await ResolverService.getAccountName(ADDRESS, 123, internal)).name).toBe('After');}
            expect(findContact).toHaveBeenCalledTimes(4);
        },
    );

    it('invalidates every tag and both modes when an account label changes', async () => {
        (AccountRepository.findOne as jest.Mock).mockReturnValue({ label: 'Before' });
        for (const tag of [undefined, 123]) {
            for (const internal of [false, true])
                {await ResolverService.getAccountName(ADDRESS, tag, internal);}
        }
        (AccountRepository.findOne as jest.Mock).mockReturnValue({ label: 'After' });
        const listener = (AccountRepository.on as jest.Mock).mock.calls.find(
            ([event]) => event === 'accountUpdate',
        )![1];
        listener({ address: ADDRESS }, { label: 'After' });
        for (const tag of [undefined, 123]) {
            for (const internal of [false, true])
                {expect((await ResolverService.getAccountName(ADDRESS, tag, internal)).name).toBe('After');}
        }
        expect(AccountRepository.findOne).toHaveBeenCalledTimes(8);
    });
});
