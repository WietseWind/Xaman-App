import Localize from '@locale';

import { AccountModel } from '@store/models';

import PaymentChannelClaim from './PaymentChannelClaim.class';

/* Types ==================================================================== */
import { MutationsMixinType } from '@common/libs/ledger/mixin/types';
import { ExplainerAbstract, MonetaryStatus } from '@common/libs/ledger/factory/types';
import { payChannelAmountsFromMeta, remainingPayChannelAmount } from '@common/libs/ledger/utils/payChannelAmounts';

/* Descriptor ==================================================================== */
class PaymentChannelClaimInfo extends ExplainerAbstract<PaymentChannelClaim, MutationsMixinType> {
    constructor(item: PaymentChannelClaim & MutationsMixinType, account: AccountModel) {
        super(item, account);
    }

    getEventsLabel(): string {
        return Localize.t('events.claimPaymentChannel');
    }

    generateDescription(): string {
        const { Channel, Balance, IsChannelClosed } = this.item;

        const content: string[] = [];

        content.push(Localize.t('events.itWillUpdateThePaymentChannel', { channel: Channel }));

        if (typeof Balance !== 'undefined') {
            content.push(
                Localize.t('events.theChannelBalanceClaimedIs', {
                    balance: Balance.value,
                    currency: Balance.currency,
                }),
            );
        }

        const channel = payChannelAmountsFromMeta(this.item.MetaData, this.item.Channel);
        if (channel.amount) {
            content.push(
                Localize.t('events.theChannelAmountIs', {
                    amount: channel.amount.value,
                    currency: channel.amount.currency,
                }),
            );
        }
        const remaining = remainingPayChannelAmount(channel.amount, channel.balance);
        if (remaining) {
            content.push(
                Localize.t('events.theChannelRemainingAmountIs', {
                    amount: remaining.value,
                    currency: remaining.currency,
                }),
            );
        }

        if (IsChannelClosed) {
            content.push(Localize.t('events.thePaymentChannelWillBeClosed'));
        }

        if (typeof this.item.CredentialIDs !== 'undefined') {
            content.push(
                Localize.t('events.thePaymentIncludesCredentialIds', {
                    credentialIDs: this.item.CredentialIDs.join(', '),
                }),
            );
        }

        return content.join('\n');
    }
    getParticipants() {
        return {
            start: { address: this.item.Account, tag: this.item.SourceTag },
        };
    }

    getMonetaryDetails() {
        const channel = payChannelAmountsFromMeta(this.item.MetaData, this.item.Channel);
        const remaining = remainingPayChannelAmount(channel.amount, channel.balance);
        const factor = [
            {
                currency: (this.item.Amount ?? this.item.Balance)?.currency || remaining?.currency || '',
                value: (this.item.Amount ?? this.item.Balance)?.value || '0',
                effect: MonetaryStatus.IMMEDIATE_EFFECT,
            },
        ];

        if (remaining) {
            factor.push({
                ...remaining,
                effect: MonetaryStatus.POTENTIAL_EFFECT,
            });
        }

        if (channel.amount) {
            factor.push({
                ...channel.amount,
                effect: MonetaryStatus.NO_EFFECT,
            });
        }

        return {
            mutate: this.item.BalanceChange(this.account.address),
            factor,
        };
    }
}

/* Export ==================================================================== */
export default PaymentChannelClaimInfo;
