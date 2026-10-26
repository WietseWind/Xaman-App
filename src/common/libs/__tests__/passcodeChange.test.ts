import { createPasscodeChange, PASSCODE_CHANGE_JOURNAL } from '../passcodeChange';

jest.mock('@store/repositories/core', () => ({ __esModule: true, default: {} }));
jest.mock('@store/repositories/account', () => ({ __esModule: true, default: {} }));

const setup = () => {
    const blobs = new Map<string, { data: string; key: string }>();
    let current = 'old';
    const vault = {
        exist: jest.fn(async (name: string) => blobs.has(name)),
        open: jest.fn(async (name: string, key: string) => {
            const item = blobs.get(name);
            return item?.key === key ? item.data : undefined;
        }),
        create: jest.fn(async (name: string, data: string, key: string) => {
            if (blobs.has(name)) throw new Error('exists');
            blobs.set(name, { data, key });
            return true;
        }),
        purge: jest.fn(async (name: string) => {
            blobs.delete(name);
            return true;
        }),
        getStorageEncryptionKey: jest.fn(async () => Buffer.from('device-realm-key')),
        reKeyBatch: jest.fn(async (names: string[], oldKey: string, newKey: string) => {
            for (const name of names) {
                const item = blobs.get(name)!;
                if (item.key !== oldKey) throw new Error('bad old key');
                blobs.set(name, { ...item, key: newKey });
            }
            return true;
        }),
    };
    const deps = {
        vault,
        readHash: () => current,
        writeHash: jest.fn((hash: string) => {
            current = hash;
        }),
        hash: jest.fn(async () => 'new'),
        names: () => ['A', 'B'],
    };
    const seed = async (committed = 'old') => {
        current = committed;
        blobs.set(PASSCODE_CHANGE_JOURNAL, {
            data: JSON.stringify({
                version: 1,
                oldKey: 'old',
                newKey: 'new',
                names: ['A', 'B'],
            }),
            key: Buffer.from('device-realm-key').toString('hex'),
        });
    };
    for (const name of ['A', 'B']) blobs.set(name, { data: `secret-${name}`, key: 'old' });
    return { blobs, vault, deps, seed, service: createPasscodeChange(deps) };
};

describe('durable passcode change', () => {
    it('commits settings only after vault rekey succeeds and deletes the journal', async () => {
        const { service, vault, deps, blobs } = setup();
        vault.reKeyBatch.mockImplementationOnce(async () => {
            expect(deps.readHash()).toBe('old');
            expect(blobs.has(PASSCODE_CHANGE_JOURNAL)).toBe(true);
            for (const name of ['A', 'B']) blobs.set(name, { data: `secret-${name}`, key: 'new' });
            return true;
        });
        await service.change('123456');
        expect(deps.readHash()).toBe('new');
        expect(blobs.has(PASSCODE_CHANGE_JOURNAL)).toBe(false);
    });

    it('rejects failed hashing without changing a vault or leaving a pending task', async () => {
        const { service, deps, vault } = setup();
        deps.hash.mockResolvedValueOnce('');
        await expect(service.change('123456')).rejects.toThrow('Unable to store');
        expect(vault.reKeyBatch).not.toHaveBeenCalled();
        expect(deps.writeHash).not.toHaveBeenCalled();
    });

    it('does not start rekey if durable journal storage fails', async () => {
        const { service, vault, deps } = setup();
        vault.create.mockRejectedValueOnce(new Error('storage full'));
        await expect(service.change('123456')).rejects.toThrow('storage full');
        expect(vault.reKeyBatch).not.toHaveBeenCalled();
        expect(deps.readHash()).toBe('old');
    });

    it('rolls back a partially replaced batch and reports failure', async () => {
        const { service, vault, deps, blobs } = setup();
        vault.reKeyBatch.mockImplementationOnce(async () => {
            blobs.set('A', { data: 'secret-A', key: 'new' });
            blobs.set('B_RECOVER', blobs.get('B')!);
            blobs.delete('B');
            throw new Error('injected native write failure');
        });
        await expect(service.change('123456')).rejects.toThrow('injected native');
        expect(deps.readHash()).toBe('old');
        expect(await vault.open('A', 'old')).toBe('secret-A');
        expect(await vault.open('B', 'old')).toBe('secret-B');
        expect(blobs.has(PASSCODE_CHANGE_JOURNAL)).toBe(false);
    });

    it.each(['before rekey', 'partial rekey', 'after commit'])('recovers on launch: %s', async (phase) => {
        const { service, seed, vault, blobs, deps } = setup();
        await seed(phase === 'after commit' ? 'new' : 'old');
        if (phase !== 'before rekey') blobs.set('A', { data: 'secret-A', key: 'new' });
        if (phase === 'partial rekey') {
            blobs.set('B_RECOVER', blobs.get('B')!);
            blobs.delete('B');
        } else if (phase === 'after commit') blobs.set('B', { data: 'secret-B', key: 'new' });
        await service.recover();
        for (const name of ['A', 'B']) expect(await vault.open(name, deps.readHash())).toBe(`secret-${name}`);
        expect(blobs.has(PASSCODE_CHANGE_JOURNAL)).toBe(false);
    });

    it('retains recovery material if restoration fails, then resumes on another launch', async () => {
        const { service, seed, vault, blobs, deps } = setup();
        await seed();
        blobs.set('A', { data: 'secret-A', key: 'new' });
        const create = vault.create.getMockImplementation()!;
        vault.create.mockImplementation(async (name, data, key) => {
            if (name === 'A') throw new Error('storage unavailable');
            return create(name, data, key);
        });
        await expect(service.recover()).rejects.toThrow('storage unavailable');
        expect(blobs.has(PASSCODE_CHANGE_JOURNAL)).toBe(true);
        expect(blobs.has('A_PASSCODE_RECOVER')).toBe(true);
        vault.create.mockImplementation(create);
        await createPasscodeChange(deps).recover();
        expect(await vault.open('A', 'old')).toBe('secret-A');
        expect(blobs.has(PASSCODE_CHANGE_JOURNAL)).toBe(false);
    });

    it('restores old-key vaults if committing settings fails', async () => {
        const { service, deps, vault } = setup();
        deps.writeHash.mockImplementationOnce(() => {
            throw new Error('Realm full');
        });
        await expect(service.change('123456')).rejects.toThrow('Realm full');
        for (const name of ['A', 'B']) expect(await vault.open(name, 'old')).toBe(`secret-${name}`);
    });
});

it('keeps committed rekey recovery available when journal cleanup fails', async () => {
    const { service, deps, vault, blobs } = setup();
    const purge = vault.purge.getMockImplementation()!;
    let fail = true;
    vault.purge.mockImplementation(async (name) => {
        if (name === PASSCODE_CHANGE_JOURNAL && fail) {
            fail = false;
            throw new Error('cleanup unavailable');
        }
        return purge(name);
    });
    await expect(service.change('123456')).resolves.toBeUndefined();
    expect(deps.readHash()).toBe('new');
    expect(blobs.has(PASSCODE_CHANGE_JOURNAL)).toBe(true);
    await createPasscodeChange(deps).recover();
    expect(await vault.open('A', 'new')).toBe('secret-A');
    expect(blobs.has(PASSCODE_CHANGE_JOURNAL)).toBe(false);
});
