import Localize from '@locale';

import { AccountModel } from '@store/models';

import Delegate from './Delegate.class';

/* Types ==================================================================== */
import { ExplainerAbstract } from '@common/libs/ledger/factory/types';
import { OperationActions } from '@common/libs/ledger/parser/types';
import { delegationDescription } from '@common/libs/ledger/utils/delegationDetails';

/* Descriptor ==================================================================== */
class DelegateInfo extends ExplainerAbstract<Delegate> {
    constructor(item: Delegate, account: AccountModel) {
        super(item, account);
    }

    getEventsLabel(): string {
        return Localize.t('txDelegateSet.objectLabel');
    }

    generateDescription(): string {
        return delegationDescription(this.item.Account, this.item.Authorize, this.item.Permissions || [],
            this.item.PermissionTransactionTypes, 'object');
    }

    getParticipants() {
        return {
            start: { address: this.item.Account, tag: undefined },
            end: { address: this.item.Authorize, tag: undefined },
        };
    }

    getMonetaryDetails() {
        return {
            mutate: {
                [OperationActions.INC]: [],
                [OperationActions.DEC]: [],
            },
            factor: undefined,
        };
    }
}

/* Export ==================================================================== */
export default DelegateInfo;
