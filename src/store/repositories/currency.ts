import { has, isPlainObject } from 'lodash';
import Realm from 'realm';

import { CurrencyModel } from '@store/models';

import BaseRepository from './base';

/* Types  ==================================================================== */
export type CurrencyRepositoryEvent = {
    currencyDetailsUpdate: (currency: CurrencyModel, changes: Partial<CurrencyModel>) => void;
    currencyUpsert: (currency: CurrencyModel) => void;
};

declare interface CurrencyRepository {
    on<U extends keyof CurrencyRepositoryEvent>(event: U, listener: CurrencyRepositoryEvent[U]): this;
    off<U extends keyof CurrencyRepositoryEvent>(event: U, listener: CurrencyRepositoryEvent[U]): this;
    emit<U extends keyof CurrencyRepositoryEvent>(event: U, ...args: Parameters<CurrencyRepositoryEvent[U]>): boolean;
}

/* Repository  ==================================================================== */
class CurrencyRepository extends BaseRepository<CurrencyModel> {
    initialize(realm: Realm) {
        this.realm = realm;
        this.model = CurrencyModel;
    }

    // @override
    // Please keep on top
    upsert = async (object: Partial<CurrencyModel>) => {
        // The primary key should be in the object for upsert operation
        if (this.model?.schema?.primaryKey && !has(object, this.model.schema.primaryKey)) {
            throw new Error(`Upsert requires primary key (${this.model.schema.primaryKey}) to be set`);
        }

        // Check if the object already exists
        const primaryKey = this.model?.schema?.primaryKey;
        if (primaryKey) {
            const existing = this.findOne({ [primaryKey]: object[primaryKey as keyof Partial<CurrencyModel>] });

            if (existing) {
                if (isPlainObject(object)) {
                    const { properties } = this.model.schema!;
                    const descriptors = Object.getOwnPropertyDescriptors(object);
                    // Accessors and inherited values keep Realm's normal write path.
                    const unchanged = Object.keys(descriptors).every((key) => {
                        const descriptor = descriptors[key];
                        return has(properties, key) && 'value' in descriptor &&
                            (descriptor.value === undefined || (existing as any)[key] === descriptor.value);
                    }) && Object.keys(properties).every((key) => has(object, key) || !(key in object));
                    if (unchanged) {
                        // Keep async event ordering so metadata freshness checks still run.
                        return Promise.resolve(existing).then((currency) => {
                            this.emit('currencyUpsert', currency);
                            return currency;
                        });
                    }
                }
                return this.create(object, true).then((updatedCurrency: CurrencyModel) => {
                    this.emit('currencyUpsert', updatedCurrency);
                    return updatedCurrency;
                });
            }
        }

        // now try to create it
        return this.create(object).then((createdCurrency: CurrencyModel) => {
            this.emit('currencyUpsert', createdCurrency);
            return createdCurrency;
        });
    };

    update = async (object: Partial<CurrencyModel>) => {
        // the primary key should be in the object
        if (this.model?.schema?.primaryKey && !has(object, this.model.schema.primaryKey)) {
            throw new Error(`Update require primary key (${this.model.schema.primaryKey}) to be set`);
        }

        return this.create(object, true).then((updatedCurrency: CurrencyModel) => {
            return updatedCurrency;
        });
    };

    updateCurrencyDetails = async (object: Partial<CurrencyModel>) => {
        // the primary key should be in the object
        if (this.model?.schema?.primaryKey && !has(object, this.model.schema.primaryKey)) {
            throw new Error(`Update require primary key (${this.model.schema.primaryKey}) to be set`);
        }

        return this.create(object, true).then((updatedCurrency: CurrencyModel) => {
            this.emit('currencyDetailsUpdate', updatedCurrency, object);
            return updatedCurrency;
        });
    };
}

export default new CurrencyRepository();
