/**
 * Account model
 *
 * @class
 * @extends Realm.Object
 */

import Realm from 'realm';
import { EXTERNAL_ASSET_LIMIT, supportsExternalAssets } from '@common/helpers/externalAssets';
import { accountDetailsId } from '@common/helpers/accountNetwork';
import { Card } from 'tangem-sdk-react-native';

import { StringIdentifier } from '@common/utils/string';

import CoreRepository from '@store/repositories/core';

import { AccountSchema } from '@store/models/schemas/latest';
import { EncryptionLevels, AccessLevels, AccountTypes } from '@store/types';

import AccountDetails from './accountDetails';

/* Model  ==================================================================== */
class Account extends Realm.Object<Account> {
    public static schema: Realm.ObjectSchema = AccountSchema.schema;

    /** Type of the account. @type {AccountTypes} */
    public declare type: AccountTypes;
    /** Address of the account. @type {string} */
    public declare address: string;
    /** Label of the account. @type {string} */
    public declare label: string;
    /** Public key associated with the account. @type {string} */
    public declare publicKey: string;
    /** Access level of the account. @type {AccessLevels} */
    public declare accessLevel: AccessLevels;
    /** Encryption level for the account. @type {EncryptionLevels} */
    public declare encryptionLevel: EncryptionLevels;
    /** CipherEncryption version used to encrypt this account. @type {number} */
    public declare encryptionVersion: number;
    /** Index Order of the account when showing as list, if any. @type {number?} */
    public declare order?: number;
    /** Whether the account is hidden in the accounts list. @type {boolean?} */
    public declare hidden?: boolean;
    /** Additional information string about the account (contains stringify version of object). @type {string?} */
    public declare additionalInfoString?: string;
    /** Detailed data associated with the account. @type {AccountDetails[]?} */
    public declare details?: AccountDetails[];
    /** Date when the account was registered. @type {Date?} */
    public declare registerAt?: Date;
    /** Date when the account was last updated. @type {Date?} */
    public declare updatedAt?: Date;

    /**
     * Returns the parsed additional information object.
     * @type {Object}
     */
    get additionalInfo(): Card | undefined {
        return this.additionalInfoString ? JSON.parse(this.additionalInfoString) : undefined;
    }

    /**
     * Set the additional information after stringify it.
     */
    set additionalInfo(data: Card) {
        this.additionalInfoString = JSON.stringify(data);
    }

    get balance(): number {
        return this.getDetails()?.balance ?? 0;
    }

    get ownerCount(): number {
        return this.getDetails()?.ownerCount ?? 0;
    }

    get regularKey(): string | undefined {
        return this.getDetails()?.regularKey ?? undefined;
    }

    get domain(): string | undefined {
        return this.getDetails()?.domain ?? undefined;
    }

    get emailHash(): string | undefined {
        return this.getDetails()?.emailHash ?? undefined;
    }

    get messageKey(): string | undefined {
        return this.getDetails()?.messageKey ?? undefined;
    }

    get flags(): { [key: string]: boolean } | undefined {
        return this.getDetails()?.flags ?? undefined;
    }

    get lines() {
        const details = this.getDetails();
        if (!details) return undefined;
        // Older versions may have cached Mainnet external positions under a
        // test network. Exclude them immediately, including while offline.
        return supportsExternalAssets(details.network?.key)
            ? details.lines
            : details.lines.filtered('limit != $0', EXTERNAL_ASSET_LIMIT);
    }

    get reward() {
        return this.getDetails()?.reward ?? {};
    }

    /**
     * Calculates and retrieves the state version of the account based on its details.
     * @returns {number} The state version identifier.
     */
    public getStateVersion(): number {
        const details = this.getDetails();

        if (!details) {
            return 0;
        }

        const state = JSON.stringify(details.toJSON(), (key, val) => {
            if (val !== null && typeof val === 'object') {
                if (['owners', 'currency', 'network'].includes(key)) {
                    return undefined; // exclude these fields
                }
            }
            return val;
        });

        return StringIdentifier(state);
    }

    /**
     * Gets the details of the account based on the selected network.
     * @private
     * @returns {AccountDetails} The details of the account for the selected network.
     */
    private getDetails(): AccountDetails | undefined {
        const network = CoreRepository.getSelectedNetwork();
        if (!network) return undefined;
        const matchesNetwork = (details: AccountDetails) => network?.id.equals(details.network?.id);
        // A migrated wallet can retain an older details key alongside the row
        // refreshed by AccountService. Prefer the current row on this network.
        return this.details?.find((details) => details.id === accountDetailsId(this.address, network) &&
            matchesNetwork(details)) ?? this.details?.find((details) =>
            details.id === `${this.address}.${network.networkId}` && matchesNetwork(details)) ??
            this.details?.find(matchesNetwork);
    }
}

export default Account;
