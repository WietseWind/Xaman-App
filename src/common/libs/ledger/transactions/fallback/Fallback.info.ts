import { AccountModel } from '@store/models';

import Fallback from './Fallback.class';
import Localize from '@locale';

/* Types ==================================================================== */
import { MutationsMixinType } from '@common/libs/ledger/mixin/types';
import { ExplainerAbstract } from '@common/libs/ledger/factory/types';

/* Descriptor ==================================================================== */
class FallbackInfo extends ExplainerAbstract<Fallback, MutationsMixinType> {
    constructor(item: Fallback & MutationsMixinType, account: AccountModel) {
        super(item, account);
    }

    getEventsLabel(): string {
        return this.item.TransactionType;
    }

    generateDescription(): string {
        return `${Localize.t('events.transactionType')}: ${this.item.TransactionType}`;
    }

    getParticipants() {
        return {
            start: { address: this.item.Account, tag: this.item.SourceTag },
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
export default FallbackInfo;
