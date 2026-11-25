import Realm from 'realm';
import { values } from 'lodash';
import * as models from '../../models';
import * as repositories from '../../repositories';
import { populateDataStore } from '../../models/schemas/populate';
import { AccountModel, AccountDetailsModel, CurrencyModel, TrustLineModel } from '../../models';
import { AccountRepository, CoreRepository, NetworkRepository } from '../../repositories';
import { AccessLevels, EncryptionLevels } from '../../types';

const ADDRESS = 'rPublicNetworkIsolation';
let realm: Realm;

beforeAll(() => {
    realm = new Realm({ schema: values(models), path: './.jest/account-network-balances', inMemory: true });
    Object.values(repositories).forEach((repository) => repository.initialize(realm));
});
beforeEach(() => {
    realm.write(() => realm.deleteAll());
    populateDataStore(realm);
    realm.write(() => realm.create(AccountModel, {
        address: ADDRESS, accessLevel: AccessLevels.Readonly, encryptionLevel: EncryptionLevels.Passcode,
    }));
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => realm.close());

const network = (key: string) => NetworkRepository.findOne({ key })!;
const currency = (code = 'USD') => realm.create(CurrencyModel, {
    id: `rIssuer.${code}`, issuer: 'rIssuer', currencyCode: code,
}, Realm.UpdateMode.Modified);
const owner = () => AccountRepository.findOne({ address: ADDRESS })!;
const select = (key: string) => realm.write(() => { CoreRepository.getSettings().network = network(key); });

it('separates legacy shared balances and preserves each network’s favorite and order', async () => {
    let unit!: CurrencyModel;
    realm.write(() => {
        unit = currency();
        const shared = realm.create(TrustLineModel, {
            id: `${ADDRESS}.${unit.id}}`, currency: unit, balance: '1', favorite: true, order: 17,
        });
        owner().details.push(realm.create(AccountDetailsModel, {
            id: `${ADDRESS}.0`, network: network('MAINNET'), lines: [shared],
        }));
        owner().details.push(realm.create(AccountDetailsModel, {
            id: `${ADDRESS}.1`, network: network('TESTNET'), lines: [shared],
        }));
    });
    const update = (key: string, amount: string) => AccountRepository.updateDetails(ADDRESS, {
        id: `${ADDRESS}.${network(key).networkId}`, network: network(key),
        lines: [{ id: 'legacy-incoming', currency: unit, balance: amount, order: -8998 }] as any,
    });
    await update('MAINNET', '10');
    await update('TESTNET', '20');
    select('MAINNET');
    const main = owner().lines![0];
    select('TESTNET');
    const test = owner().lines![0];
    expect(main.balance).toBe('10');
    expect(test.balance).toBe('20');
    expect(main.id).not.toBe(test.id);
    [main, test].forEach(line => {
        expect(line.favorite).toBe(true);
        expect(line.order).toBe(17);
    });
    await update('MAINNET', '30');
    expect(main.balance).toBe('30');
    expect(test.balance).toBe('20');
    expect(main.order).toBe(17);
    expect(main.favorite).toBe(true);
});

it('hides invalid cached external holdings offline while retaining ledger IOUs and MPTs', () => {
    realm.write(() => {
        const external = realm.create(TrustLineModel, {
            id: 'legacy-external', currency: currency('Doppler XRP'), balance: '765.769494',
            limit: '-9999999999', order: -8998,
        });
        const iou = realm.create(TrustLineModel, {
            id: 'legacy-iou', currency: currency(), balance: '42', limit: '100', order: 2,
        });
        const mpt = realm.create(TrustLineModel, {
            id: 'legacy-mpt', currency: currency('A'.repeat(48)), balance: '3', order: 1,
        });
        ['MAINNET', 'TESTNET', 'XAHAU'].forEach((key) => {
            owner().details.push(realm.create(AccountDetailsModel, {
                id: `${ADDRESS}.${network(key).networkId}`, network: network(key), lines: [external, iou, mpt],
            }));
        });
    });
    select('MAINNET');
    expect(owner().lines?.length).toBe(3);
    ['TESTNET', 'XAHAU'].forEach((key) => {
        select(key);
        expect(owner().lines?.sorted('order').map(line => line.id)).toEqual(['legacy-mpt', 'legacy-iou']);
        expect(owner().lines?.map(line => line.balance)).toEqual(['42', '3']);
        expect(owner().details.find(item => item.network.key === key)!.lines.length).toBe(3);
    });
    select('MAINNET');
    expect(owner().lines?.find(line => line.id === 'legacy-external')?.balance).toBe('765.769494');
});

it('checks cancellation inside a deferred Realm write and emits no account update', async () => {
    jest.useFakeTimers();
    try {
        const emit = jest.spyOn(AccountRepository, 'emit');
        let current = true;
        realm.beginTransaction();
        const pending = AccountRepository.updateDetails(ADDRESS, {
            id: `${ADDRESS}.0`, network: network('MAINNET'), balance: 999,
        }, () => current);
        current = false;
        realm.cancelTransaction();
        jest.advanceTimersByTime(50);
        await pending;
        expect(owner().details.length).toBe(0);
        expect(emit).not.toHaveBeenCalled();
    } finally {
        if (realm.isInTransaction) realm.cancelTransaction();
        jest.useRealTimers();
    }
});

it('prefers refreshed details over a retained legacy row for the same network', () => {
    realm.write(() => {
        const selected = network('MAINNET');
        const unit = currency();
        owner().details.push(realm.create(AccountDetailsModel, {
            id: `${ADDRESS}.${selected.id}`, network: selected, balance: 1,
            lines: [{ id: 'old-row', currency: unit, balance: '1' }],
        }));
        owner().details.push(realm.create(AccountDetailsModel, {
            id: `${ADDRESS}.0`, network: selected, balance: 2,
            lines: [{ id: 'current-row', currency: unit, balance: '2' }],
        }));
    });
    select('MAINNET');
    expect(owner().balance).toBe(2);
    expect(owner().lines?.map(line => line.id)).toEqual(['current-row']);
});

it('isolates two saved rails that use the same protocol NetworkID', async () => {
    let custom!: models.NetworkModel;
    let unit!: CurrencyModel;
    realm.write(() => {
        const main = network('MAINNET');
        unit = currency();
        custom = realm.create(models.NetworkModel, {
            id: new Realm.BSON.ObjectId(), key: 'CUSTOM', name: 'Standalone fixture',
            networkId: main.networkId, type: main.type, nativeAsset: main.nativeAsset,
            color: main.color, defaultNode: main.defaultNode,
        });
    });
    for (const [rail, amount] of [[network('MAINNET'), '10'], [custom, '99']] as const) {
        await AccountRepository.updateDetails(ADDRESS, {
            id: `${ADDRESS}.${rail.networkId}`, network: rail,
            lines: [{ id: 'incoming', currency: unit, balance: amount }] as any,
        });
    }
    select('MAINNET');
    expect(owner().lines?.[0].balance).toBe('10');
    select('CUSTOM');
    expect(owner().lines?.[0].balance).toBe('99');
    expect(owner().details.length).toBe(2);
});
