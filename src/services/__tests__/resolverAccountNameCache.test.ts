import ContactRepository from '@store/repositories/contact';
import ResolverService from '@services/ResolverService';

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
        findContact.mockReset();
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
