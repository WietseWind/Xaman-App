import { toLower, map, filter, sortBy, isEqual, has, findIndex } from 'lodash';
import React, { Component } from 'react';
import { View, ViewStyle } from 'react-native';

import { AppScreens } from '@common/constants';

import { NormalizeCurrencyCode } from '@common/utils/monetary';

import { Navigator } from '@common/helpers/navigator';

import { CurrencyRepository, TrustLineRepository } from '@store/repositories';
import { AccountModel, NetworkModel, TrustLineModel } from '@store/models';

import { SortableFlatList } from '@components/General';

import { AddTokenOverlayProps } from '@screens/Overlay/AddToken';
import { ExplainBalanceOverlayProps } from '@screens/Overlay/ExplainBalance';
import { Props as TokenSettingsOverlayProps } from '@screens/Overlay/TokenSettings/types';

import { TokenItem } from '@components/Modules/AssetsList/Tokens/TokenItem';
import { NativeItem } from '@components/Modules/AssetsList/Tokens/NativeItem';
import { ListHeader } from '@components/Modules/AssetsList/Tokens/ListHeader';
import { ListEmpty } from '@components/Modules/AssetsList/Tokens/ListEmpty';
import { FiltersType } from '@components/Modules/AssetsList/Tokens/ListFilter';
import {
    AppSizes,
    // AppStyles,
} from '@theme/index';
import NetworkService from '@services/NetworkService';
import { ASSETS_CATEGORY } from '@screens/Overlay/SwitchAssetCategory/types';

/* Types ==================================================================== */
interface Props {
    style?: ViewStyle | ViewStyle[];
    account: AccountModel;
    discreetMode: boolean;
    spendable: boolean;
    experimentalUI?: boolean;
    onChangeCategoryPress: (selectedCategory?: ASSETS_CATEGORY) => void;
    network?: NetworkModel;
    addTokenPress?: () => void;
    hideTopElements: (toggle: boolean) => void;
}

interface State {
    accountStateVersion: number;
    account: AccountModel;
    tokens: TrustLineModel[];
    dataSource: TrustLineModel[];
    filters?: FiltersType;
    reorderEnabled: boolean;
    showHeader: boolean;
}

/* Component ==================================================================== */
class TokensList extends Component<Props, State> {
    private readonly dragSortableRef: React.RefObject<SortableFlatList>;

    constructor(props: Props) {
        super(props);

        const { account } = props;
        const tokens = (account.lines?.sorted([['order', false]]) as TrustLineModel[] | undefined) ?? [];

        this.state = {
            accountStateVersion: account.getStateVersion(),
            account,
            tokens,
            dataSource: tokens,
            filters: undefined,
            reorderEnabled: false,
            showHeader: true,
        };

        this.dragSortableRef = React.createRef();
    }

    componentDidMount(): void {
        // listen for token updates
        // this is needed when a single token favorite status changed
        TrustLineRepository.on('trustLineUpdate', this.onTrustLineUpdate);
        // this is needed when using ResolveService to sync the currency details
        CurrencyRepository.on('currencyDetailsUpdate', this.onCurrencyDetailsUpdate);
    }

    componentWillUnmount(): void {
        // remove trustLine update listener
        TrustLineRepository.off('trustLineUpdate', this.onTrustLineUpdate);
        // remove listener
        CurrencyRepository.off('currencyDetailsUpdate', this.onCurrencyDetailsUpdate);
    }

    shouldComponentUpdate(nextProps: Props, nextState: State): boolean {
        const { discreetMode, spendable, experimentalUI } = this.props;
        const { dataSource, accountStateVersion, reorderEnabled, filters, showHeader } = this.state;

        return (
            !isEqual(nextState.showHeader, showHeader) ||
            !isEqual(nextProps.spendable, spendable) ||
            !isEqual(nextProps.discreetMode, discreetMode) ||
            !isEqual(nextProps.experimentalUI, experimentalUI) ||
            !isEqual(nextState.accountStateVersion, accountStateVersion) ||
            !isEqual(nextState.reorderEnabled, reorderEnabled) ||
            !isEqual(nextState.filters, filters) ||
            !isEqual(map(nextState.dataSource, 'id').join(), map(dataSource, 'id').join())
        );
    }

    static getDerivedStateFromProps(nextProps: Props, prevState: State): Partial<State> | null {
        // calculate account state version
        const accountStateVersion = nextProps.account.getStateVersion();

        // on switch account or data update replace the dataSource and account
        // check if prev account is not valid anymore
        if (!prevState.account.isValid() || !isEqual(accountStateVersion, prevState.accountStateVersion)) {
            // check if account switched then clear filter and reordering state
            let filtersState = {
                filters: prevState.filters,
                reorderEnabled: prevState.reorderEnabled,
            };
            if (
                (prevState.account.isValid() && !isEqual(nextProps.account.address, prevState.account.address)) ||
                !prevState.account.isValid()
            ) {
                filtersState = {
                    filters: undefined,
                    reorderEnabled: false,
                };
            }

            // apply any filter if present
            const { filters, reorderEnabled } = filtersState;

            // update tokens and dataSource
            const tokens = nextProps.account.lines?.sorted([['order', false]]) as TrustLineModel[] | undefined;
            let dataSource = filters ? TokensList.getFilteredList(tokens, filters) : tokens;

            // if reorder already enabled, keep the sorting in the dataSource and update the list
            if (reorderEnabled) {
                dataSource = sortBy(dataSource, (o) => findIndex(prevState.dataSource, { id: o.id }));
            }

            return {
                accountStateVersion,
                account: nextProps.account,
                tokens,
                dataSource,
                ...filtersState,
            };
        }

        return null;
    }

    static getFilteredList = (tokens: TrustLineModel[] | undefined, filters: FiltersType): TrustLineModel[] => {
        if (!filters) {
            return tokens ?? [];
        }

        // destruct filter variables
        const { text, favorite, hideZero } = filters;

        // default dataSource
        let filtered = tokens;

        // filter base on filter text
        if (text) {
            const normalizedSearch = toLower(text);

            filtered = filter(filtered, (item: TrustLineModel) => {
                return (
                    toLower(item.currency.name).indexOf(normalizedSearch) > -1 ||
                    toLower(item.currency?.issuerName).indexOf(normalizedSearch) > -1 ||
                    toLower(NormalizeCurrencyCode(item.currency.currencyCode)).indexOf(normalizedSearch) > -1
                );
            });
        }

        // hide lines with zero balance
        if (hideZero) {
            filtered = filter(filtered, (item: TrustLineModel) => {
                return Number(item.balance) !== 0;
            });
        }

        // only show favorite lines
        if (favorite) {
            filtered = filter(filtered, { favorite: true });
        }

        return filtered ?? [];
    };

    onCurrencyDetailsUpdate = () => {
        // update the token list if any of token details changed
        this.forceUpdate();
    };

    onTrustLineUpdate = (updatedToken: TrustLineModel, changes: Partial<TrustLineModel>) => {
        // update the token in the list if token favorite changed
        if (has(changes, 'favorite')) {
            this.forceUpdate();
        }
    };

    onTokenAddButtonPress = () => {
        const { account } = this.state;
        const { addTokenPress } = this.props;

        if (NetworkService.hasSwap() && addTokenPress) {
            addTokenPress();
            return;
        }

        Navigator.showOverlay<AddTokenOverlayProps>(AppScreens.Overlay.AddToken, { account });
    };

    onTokenItemPress = (token: TrustLineModel) => {
        const { spendable } = this.props;
        const { account, reorderEnabled } = this.state;

        // ignore if reordering is enabled
        if (!token || reorderEnabled || token?.id === 'native') {
            return;
        }

        if (spendable) {
            Navigator.showOverlay<TokenSettingsOverlayProps>(
                AppScreens.Overlay.TokenSettings,
                { token, account },
                {
                    overlay: {
                        interceptTouchOutside: false,
                        //     ^^  Needed for tapping backdrop = close, uses onTouchStart={this.startTouch}
                    },
                },
            );
        }
    };

    onNativeItemPress = () => {
        const { account } = this.state;
        Navigator.showOverlay<ExplainBalanceOverlayProps>(AppScreens.Overlay.ExplainBalance, { account });
    };

    onCategoryChangePress = (selectedCategory?: ASSETS_CATEGORY) => {
        const { onChangeCategoryPress } = this.props;

        if (typeof onChangeCategoryPress === 'function') {
            onChangeCategoryPress(selectedCategory);
        }
    };

    toggleReordering = () => {
        const { tokens, reorderEnabled, filters } = this.state;

        // if we are enabling the re-ordering, we need to clear filters if any exist
        if (filters && (filters.text || filters.favorite || filters.hideZero)) {
            this.setState({
                dataSource: tokens,
                filters: undefined,
                reorderEnabled: !reorderEnabled,
            });
            return;
        }

        this.setState({
            reorderEnabled: !reorderEnabled,
        });
    };

    onTokenReorder = (data: Array<TrustLineModel>) => {
        this.setState({
            dataSource: data,
        });
    };

    onItemMoveTopPress = (token: TrustLineModel) => {
        const { dataSource } = this.state;

        // move the token to the top
        const sortedDataSource = sortBy(dataSource, ({ id }) => (id === token.id ? 0 : 1));

        // save the new order
        this.setState({
            dataSource: sortedDataSource,
        });
    };

    saveTokensOrder = () => {
        const { dataSource } = this.state;

        for (let i = 0; i < dataSource.length; i++) {
            if (dataSource[i].id) {
                TrustLineRepository.update({
                    id: dataSource[i].id,
                    order: i,
                });
            }
        }

        // toggle reordering
        this.toggleReordering();
    };

    onFilterChange = (filters?: FiltersType) => {
        const { tokens } = this.state;

        // return if no token
        if (tokens.length === 0) {
            return;
        }

        // if no filter is applied then return list
        if (!filters) {
            this.setState({
                dataSource: tokens,
                filters,
            });
            return;
        }

        // sort and update dataSource
        this.setState({
            dataSource: TokensList.getFilteredList(tokens, filters),
            filters,
        });
    };

    renderItem = ({ item, index }: { item: TrustLineModel; index: number }) => {
        const { discreetMode, experimentalUI, network } = this.props;
        const { account, reorderEnabled } = this.state;
        
        if (item?.id === 'native') {
            return (
                <NativeItem
                    key={`nativeasset-${network?.key}`}
                    account={account}
                    discreetMode={discreetMode}
                    reorderEnabled={reorderEnabled}
                    onPress={this.onNativeItemPress}
                />
            );
        }

        return (
            <TokenItem
                index={index}
                token={item}
                reorderEnabled={reorderEnabled}
                discreetMode={discreetMode}
                saturate={experimentalUI}
                selfIssued={item.currency.issuer === account.address}
                onPress={this.onTokenItemPress}
                onMoveTopPress={this.onItemMoveTopPress}
            />
        );
    };

    renderEmptyList = () => {
        const { filters } = this.state;

        // return null if there is any filter active
        if (filters) {
            return null;
        }

        return <ListEmpty onTokenAddButtonPress={this.onTokenAddButtonPress} />;
    };

    keyExtractor = (item: TrustLineModel) => {
        return `token-${item.id}`;
    };

    hideTopElements = (state: boolean) => {
        const { hideTopElements } = this.props;

        this.setState({
            showHeader: !state,
        }, () => {
            if (hideTopElements) {
                hideTopElements(state);
            }
        });
    };

    render() {
        const {
            account,
            style,
            spendable,
            discreetMode,
            experimentalUI,
            network,
        } = this.props;
        const {
            dataSource,
            reorderEnabled,
            filters,
            showHeader,
        } = this.state;

        return (
            <View testID="token-list-container" style={style}>
                {showHeader && (
                    <ListHeader
                        reorderEnabled={reorderEnabled}
                        showTokenAddButton={spendable}
                        onReorderSavePress={this.saveTokensOrder}
                        onTokenAddPress={this.onTokenAddButtonPress}
                        onTitlePress={this.onCategoryChangePress}
                        hideTopElements={this.hideTopElements}
                        visible={!(typeof experimentalUI !== 'undefined' && !experimentalUI && AppSizes.scale(41))}
                        filters={filters}
                        onFilterChange={this.onFilterChange}
                        onReorderPress={this.toggleReordering}
                    />
                )}
                {/* { !reorderEnabled && (
                    <View style={{height: AppSizes.scale(41)}}>
                        <ListFilter
                            filters={filters}
                            visible={typeof experimentalUI !== 'undefined' && !experimentalUI}
                            onFilterChange={this.onFilterChange}
                            onReorderPress={this.toggleReordering}
                        />
                    </View>
                )} */}
                { reorderEnabled && (
                    <NativeItem
                        key={`nativeasset-${network?.key}`}
                        account={account}
                        network={network}
                        discreetMode={discreetMode}
                        reorderEnabled={reorderEnabled}
                        onPress={this.onNativeItemPress}
                    />
                )}
                <SortableFlatList
                    ref={this.dragSortableRef}
                    itemHeight={TokenItem.Height}
                    separatorHeight={0}
                    topFade
                    firstItemExtraHeight={reorderEnabled ? 0 : AppSizes.scale(12)}
                    dataSource={[
                        ...(reorderEnabled ? [] : [{
                            id: 'native',
                            currency: {
                                issuer: '',
                            },
                            getFormattedCurrency: () => NetworkService.getNativeAsset(),
                            isLiquidityPoolToken: () => false,
                            isMPToken: () => false,
                            getFormattedIssuer: () => '',
                            getLpAssetPair: () => undefined,
                        }]),
                        ...dataSource,
                    ]}
                    renderItem={this.renderItem}
                    renderEmptyList={this.renderEmptyList}
                    onItemPress={this.onTokenItemPress}
                    keyExtractor={this.keyExtractor}
                    onDataChange={this.onTokenReorder}
                    sortable={reorderEnabled}
                />
            </View>
        );
    }
}

export default TokensList;
