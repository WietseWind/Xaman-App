import CurrencyRepository from '../../repositories/currency';

const properties = Object.fromEntries([
    'id', 'issuer', 'currencyCode', 'name', 'avatarUrl', 'issuerAvatarUrl', 'issuerName',
    'shortlist', 'xappIdentifier', 'registerAt', 'updatedAt',
].map((key) => [key, 'string']));
const identity = { id: 'issuer.USD', issuer: 'issuer', currencyCode: 'USD' };
let existing: any;
let create: jest.SpyInstance;
let emit: jest.SpyInstance;
let previousModel: any;

beforeEach(() => {
    existing = { ...identity, name: 'Saved metadata', shortlist: true,
        updatedAt: new Date(0), registerAt: new Date(0) };
    previousModel = CurrencyRepository.model;
    CurrencyRepository.model = { schema: { primaryKey: 'id', properties } } as any;
    jest.spyOn(CurrencyRepository, 'findOne').mockImplementation(() => existing);
    create = jest.spyOn(CurrencyRepository, 'create').mockImplementation(async (values) => {
        const target = existing || {};
        for (const key of Object.keys(properties)) {
            const value = (values as any)[key];
            if (value !== undefined) target[key] = value;
        }
        return target;
    });
    emit = jest.spyOn(CurrencyRepository, 'emit');
});
afterEach(() => {
    CurrencyRepository.model = previousModel;
    jest.restoreAllMocks();
});

it('skips 250 unchanged writes and keeps all metadata refresh events asynchronous', async () => {
    const pending = Array.from({ length: 250 }, () => CurrencyRepository.upsert({ ...identity }));
    expect(emit).not.toHaveBeenCalled();
    const results = await Promise.all(pending);
    expect(create).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledTimes(250);
    results.forEach((currency) => expect(currency).toBe(existing));
    expect(existing.name).toBe('Saved metadata');
    expect(existing.updatedAt).toEqual(new Date(0));
});

it('updates a changed identity field instead of treating the primary key as the only input', async () => {
    await CurrencyRepository.upsert({ ...identity, issuer: 'new issuer' });
    expect(create).toHaveBeenCalledWith({ ...identity, issuer: 'new issuer' }, true);
    expect(existing.issuer).toBe('new issuer');
});

it('updates additional supplied metadata fields', async () => {
    await CurrencyRepository.upsert({ ...identity, name: 'New metadata', shortlist: false });
    expect(create).toHaveBeenCalledTimes(1);
    expect(existing.name).toBe('New metadata');
    expect(existing.shortlist).toBe(false);
});

it('keeps Realm semantics for undefined values instead of erasing saved fields', async () => {
    await CurrencyRepository.upsert({ ...identity, name: undefined });
    expect(existing.name).toBe('Saved metadata');
    expect(create).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledTimes(1);
});

it('does not treat null as an omitted value', async () => {
    await CurrencyRepository.upsert({ ...identity, name: null } as any);
    expect(create).toHaveBeenCalledTimes(1);
    expect(existing.name).toBeNull();
});

it('does not swallow unknown supplied properties', async () => {
    await CurrencyRepository.upsert({ ...identity, unknown: 'value' } as any);
    expect(create).toHaveBeenCalledTimes(1);
});

it('does not read accessors twice when the normal write path is needed', async () => {
    const readName = jest.fn(() => 'New metadata');
    const values = { ...identity };
    Object.defineProperty(values, 'name', { get: readName, enumerable: true });
    await CurrencyRepository.upsert(values);
    expect(create).toHaveBeenCalledTimes(1);
    expect(readName).toHaveBeenCalledTimes(1);
    expect(existing.name).toBe('New metadata');
});

it('does not ignore non-enumerable supplied properties', async () => {
    const values = { ...identity };
    Object.defineProperty(values, 'name', { value: 'New metadata' });
    await CurrencyRepository.upsert(values);
    expect(create).toHaveBeenCalledTimes(1);
    expect(existing.name).toBe('New metadata');
});

it('keeps the normal write path for inherited supplied properties', async () => {
    const descriptors = jest.spyOn(Object, 'getOwnPropertyDescriptors');
    const values = Object.assign(Object.create({ name: 'Inherited metadata' }), identity);
    await CurrencyRepository.upsert(values);
    expect(create).toHaveBeenCalledTimes(1);
    expect(existing.name).toBe('Inherited metadata');
    expect(descriptors).not.toHaveBeenCalled();
});

it('writes a supplied timestamp and retains the remaining metadata', async () => {
    const updatedAt = new Date(1000);
    await CurrencyRepository.upsert({ ...identity, updatedAt });
    expect(create).toHaveBeenCalledTimes(1);
    expect(existing.updatedAt).toBe(updatedAt);
    expect(existing.name).toBe('Saved metadata');
});

it('still creates new currencies', async () => {
    existing = undefined;
    await CurrencyRepository.upsert({ ...identity });
    expect(create).toHaveBeenCalledWith(identity);
    expect(emit).toHaveBeenCalledTimes(1);
});

it('still rejects missing primary keys', async () => {
    await expect(CurrencyRepository.upsert({ issuer: 'issuer' })).rejects.toThrow('primary key');
    expect(create).not.toHaveBeenCalled();
});
