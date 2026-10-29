import { AccountModel } from '@store/models';

export interface Props {
    componentId?: string;
    account: AccountModel;
}

export interface State {
    dataSource?: XamanBackend.CuratedIOUsDetails;
    selectedPartyId?: number;
    selectedCurrencyId?: number;
    isLoading: boolean;
    isLoadingTokenInfo: boolean;
    isHandoffPending: boolean;
    error: boolean;
}
