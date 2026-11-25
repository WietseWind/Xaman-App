import Localize from '@locale';

import { AccountModel } from '@store/models';

import LedgerStateFix from './LedgerStateFix.class';

/* Types ==================================================================== */
import { MutationsMixinType } from '@common/libs/ledger/mixin/types';
import { ExplainerAbstract } from '@common/libs/ledger/factory/types';
import { LedgerFixTypes } from '@common/libs/ledger/types/enums';

/* Descriptor ==================================================================== */
class LedgerStateFixInfo extends ExplainerAbstract<LedgerStateFix, MutationsMixinType> {
    constructor(item: LedgerStateFix & MutationsMixinType, account: AccountModel) {
        super(item, account);
    }

    getEventsLabel(): string {
        return Localize.t('events.ledgerStateFix');
    }

    generateDescription(): string {
        switch (this.item.LedgerFixType) {
            case LedgerFixTypes.NFTokenPageLink:
                return Localize.t('events.ledgerStateFixNFTokenPageLinkExplain', { owner: this.item.Owner });
            case LedgerFixTypes.BookExchangeRate:
                return Localize.t('events.ledgerStateFixBookExchangeRateExplain', {
                    bookDirectory: this.item.BookDirectory,
                });
            default:
                return Localize.t('events.ledgerStateFixExplain', { fixType: this.item.LedgerFixType });
        }
    }

    getParticipants() {
        return {
            start: { address: this.item.Account, tag: this.item.SourceTag },
            end: this.item.Owner ? { address: this.item.Owner, tag: undefined } : undefined,
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
export default LedgerStateFixInfo;
