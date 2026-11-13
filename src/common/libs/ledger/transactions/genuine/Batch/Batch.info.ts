import Localize from '@locale';

import { AccountModel } from '@store/models';

import Batch from './Batch.class';

/* Types ==================================================================== */
import { MutationsMixinType } from '@common/libs/ledger/mixin/types';
import { ExplainerAbstract } from '@common/libs/ledger/factory/types';
import {
    BatchInnerTransaction,
    batchInnerBalanceChange,
    netBalanceChanges,
} from '@common/libs/ledger/utils/batchInner';

/* Descriptor ==================================================================== */
class BatchInfo extends ExplainerAbstract<Batch, MutationsMixinType> {
    // the inner transactions as looked up in the ledger; undefined until loaded
    private innerTransactions?: BatchInnerTransaction[];

    constructor(item: Batch & MutationsMixinType, account: AccountModel) {
        super(item, account);
    }

    /**
     * The metadata of a Batch only has the fee of its own account: what a Batch did to an account is in its inner
     * transactions, which are loaded separately.
     */
    setInnerTransactions(innerTransactions: BatchInnerTransaction[]) {
        this.innerTransactions = innerTransactions;
    }

    isBalanceEffectKnown(): boolean {
        return Array.isArray(this.innerTransactions);
    }

    getEventsLabel(): string {
        // if (!this.item.Permissions) {
        //     return Localize.t('txBatch.removeAuthorize');
        // }
        // if (this.item.Permissions && this.item.Permissions.length > 0) {
        //     return Localize.t('txBatch.objectLabel');
        // }
        const r: string[] = [
            Localize.t('txBatch.batch', {
                txCount: this.item.RawTransactions?.length || 0,
            }),
        ];

        if (this.item.BatchSigners && this.item.BatchSigners.length > 0) {
            r.push(
                Localize.t('txBatch.batchSignerC', {
                    signCount: this.item.BatchSigners.length,
                }),
            );
        }

        return r.join(' ');
    }

    generateDescription(): string {
        // const { Authorize } = this.item;

        const flag =
            this.item.Flags && Object.keys(this.item.Flags).filter((f) => this.item?.Flags && this.item.Flags[f])?.[0];

        const content: string[] = [
            Localize.t('txBatch.thisIsAnBatchTransaction', {
                signers: this.item.BatchSigners?.length || 0,
                txs: this.item.RawTransactions?.length || 0,
            }),
        ];

        if (flag) {
            content.push(
                Localize.t('txBatch.batchExecutionType', {
                    batchExecution: Localize.t(`txBatch.batchExecution_${flag}`),
                }),
            );
        }

        // if (Authorize && this.item?.Permissions && this.item.Permissions.length > 0) {
        //     content.push(Localize.t('txBatch.itSetsAccountAuthorizeTo', { authorize: Authorize }));

        //     content.push(
        //         Localize.t('txBatch.itSetsThesePermissions', {
        //             permissions: `\n\n - ${this.item.___translatedDelegations.join('\n - ')}`,
        //         }),
        //     );
        // }

        // if (Authorize && (!this.item?.Permissions || this.item.Permissions.length === 0)) {
        //     content.push(Localize.t('txBatch.itRemoves', { authorize: Authorize }));
        // }

        return content.join('\n');
    }

    getParticipants() {
        return {
            start: { address: this.item.Account, tag: this.item.SourceTag },
            // end: this.item.Authorize ? { address: this.item.Authorize, tag: undefined } : undefined,
        };
    }

    getMonetaryDetails() {
        const own = this.item.BalanceChange(this.account.address);

        return {
            // the Batch itself, plus the inner transactions that ran in it
            mutate: Array.isArray(this.innerTransactions)
                ? netBalanceChanges([
                      own,
                      batchInnerBalanceChange(this.innerTransactions, this.item.hash, this.account.address),
                  ])
                : own,
            factor: undefined,
        };
    }
}

/* Export ==================================================================== */
export default BatchInfo;
