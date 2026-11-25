import { Payload } from '@common/libs/payload';
import { AccountModel } from '@store/models';
import { PseudoTransactions, Transactions } from '@common/libs/ledger/transactions/types';
import { SignMixinType } from '@common/libs/ledger/mixin/types';
import { BatchCreatedNFTokenOffers } from './genuine/batchNFTokenOffers';

export interface TemplateProps {
    source: AccountModel;
    payload: Payload;
    innerBatch?: boolean;
    batchCreatedNFTokenOffers?: BatchCreatedNFTokenOffers;
    transaction: (Transactions | PseudoTransactions) & SignMixinType;
    setLoading: (loading: boolean) => void;
    setReady: (ready: boolean) => void;
    forceRender: () => void;
}
