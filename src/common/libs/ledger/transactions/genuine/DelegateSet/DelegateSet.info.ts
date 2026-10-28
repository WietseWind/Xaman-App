import Localize from '@locale';

import { AccountModel } from '@store/models';

import DelegateSet from './DelegateSet.class';

/* Types ==================================================================== */
import { MutationsMixinType } from '@common/libs/ledger/mixin/types';
import { ExplainerAbstract } from '@common/libs/ledger/factory/types';
import { delegationDescription } from '@common/libs/ledger/utils/delegationDetails';
import { NetworkDefinitions } from '@common/libs/ledger/utils/normalizeDefinitions';

/* Descriptor ==================================================================== */
class DelegateSetInfo extends ExplainerAbstract<DelegateSet, MutationsMixinType> {
    constructor(item: DelegateSet & MutationsMixinType, account: AccountModel) {
        super(item, account);
    }

    getEventsLabel(): string {
        if (!this.item.Permissions?.length) {
            return Localize.t('txDelegateSet.removeAuthorize');
        }
        if (this.item.Permissions && this.item.Permissions.length > 0) {
            return Localize.t('txDelegateSet.objectLabel');
        }
        return Localize.t('txDelegateSet.delegateSet');
    }

    generateDescription(): string {
        return delegationDescription(this.item.Account, this.item.Authorize, this.item.Permissions || [],
            (this.item.SigningDefinitions as NetworkDefinitions).rawDefinitions?.TRANSACTION_TYPES || {},
            this.item.Permissions?.length ? 'grant' : 'revoke');
    }

    getParticipants() {
        return {
            start: { address: this.item.Account, tag: this.item.SourceTag },
            end: this.item.Authorize ? { address: this.item.Authorize, tag: undefined } : undefined,
        };
    }

    getMonetaryDetails() {
        return {
            mutate: this.item.BalanceChange(this.account.address),
            factor: undefined,
        };
    }
}

/* Export ==================================================================== */
export default DelegateSetInfo;
