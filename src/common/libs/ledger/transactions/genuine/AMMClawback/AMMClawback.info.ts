import Localize from '@locale';

import { AccountModel } from '@store/models';

import { NormalizeCurrencyCode } from '@common/utils/monetary';

import AMMClawback from './AMMClawback.class';

/* Types ==================================================================== */
import { MutationsMixinType } from '@common/libs/ledger/mixin/types';
import { ExplainerAbstract, MonetaryStatus } from '@common/libs/ledger/factory/types';

/* Descriptor ==================================================================== */
class AMMClawbackInfo extends ExplainerAbstract<AMMClawback, MutationsMixinType> {
    constructor(item: AMMClawback & MutationsMixinType, account: AccountModel) {
        super(item, account);
    }

    getEventsLabel(): string {
        return Localize.t('events.ammClawback');
    }

    generateDescription(): string {
        const content = [];

        const asset = NormalizeCurrencyCode(this.item.Asset?.currency ?? '');
        const asset2 = NormalizeCurrencyCode(this.item.Asset2?.currency ?? '');

        content.push(Localize.t('events.ammClawbackExplain', { asset, asset2, holder: this.item.Holder }));

        if (this.item.Amount) {
            content.push(
                Localize.t('events.ammClawbackAmountExplain', {
                    value: this.item.Amount.value,
                    currency: NormalizeCurrencyCode(this.item.Amount.currency),
                }),
            );
        } else {
            content.push(Localize.t('events.ammClawbackAllExplain', { asset }));
        }

        if (this.item.Flags?.tfClawTwoAssets) {
            content.push(Localize.t('events.ammClawbackTwoAssetsExplain', { asset2 }));
        } else {
            content.push(Localize.t('events.ammClawbackAsset2ReturnedExplain', { asset2, holder: this.item.Holder }));
        }

        return content.join('\n');
    }

    getParticipants() {
        return {
            start: { address: this.item.Holder, tag: undefined },
            end: { address: this.item.Account, tag: undefined },
        };
    }

    getMonetaryDetails() {
        return {
            mutate: this.item.BalanceChange(this.account.address),
            factor: this.item.Amount
                ? [
                      {
                          currency: this.item.Amount.currency,
                          value: this.item.Amount.value,
                          effect: MonetaryStatus.IMMEDIATE_EFFECT,
                      },
                  ]
                : undefined,
        };
    }
}

/* Export ==================================================================== */
export default AMMClawbackInfo;
