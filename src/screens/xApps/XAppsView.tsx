/** xApp directory and its local presentation controls. */
import Fuse from 'fuse.js';
import { countBy, sortBy } from 'lodash';
import React, { Component } from 'react';
import { View, Text, InteractionManager } from 'react-native';
import { Navigation, EventSubscription } from 'react-native-navigation';

import { AppScreens } from '@common/constants';
import BackendService from '@services/BackendService';
import NetworkService from '@services/NetworkService';
import { Header, TouchableDebounce, Icon, SearchBar } from '@components/General';
import { AppsList, HeaderMessage, CategoryChips, MessageType } from '@components/Modules/XAppStore';
import { CategoryChipItem } from '@components/Modules/XAppStore/CategoryChips/ChipButton';
import Localize from '@locale';
import styles from './styles';

export enum Sections {
    Home = 'Home',
    Recent = 'Recent',
    Alphabet = 'Alphabet',
    Categories = 'Categories',
}

export type SectionData = { title?: string; data: XamanBackend.AppCategory[] };
export interface Props {
    timestamp?: number;
}
export interface State {
    message?: MessageType;
    activeSection: Sections;
    categories?: XamanBackend.XAppStoreListingsCategories;
    categoryFilter?: string;
    dataSource: SectionData[];
    isLoading: boolean;
    searchEnabled: boolean;
    searchQuery: string;
}

type SectionButton = { label: string; value: Sections };

class XAppsView extends Component<Props, State> {
    static screenName = AppScreens.TabBar.XApps;

    private searchBarRef = React.createRef<SearchBar>();
    private navigationListener?: EventSubscription;
    private mountTask?: ReturnType<typeof InteractionManager.runAfterInteractions>;
    private focusFrame?: number;
    private mounted = false;
    private requestEpoch = 0;
    private networkContext?: string;

    constructor(props: Props) {
        super(props);
        this.state = {
            activeSection: Sections.Home,
            message: undefined,
            categories: undefined,
            dataSource: [
                { title: Localize.t('xapp.ourSuggestions'), data: Array(4).fill(undefined) },
                { title: Localize.t('xapp.popular'), data: Array(4).fill(undefined) },
            ],
            categoryFilter: undefined,
            searchEnabled: false,
            searchQuery: '',
            isLoading: false,
        };
    }

    componentDidMount() {
        this.mounted = true;
        this.networkContext = this.getNetworkContext();
        NetworkService.on('networkChange', this.onNetworkChange);
        this.mountTask = InteractionManager.runAfterInteractions(this.fetchStoreListings);
        this.navigationListener = Navigation.events().bindComponent(this);
    }

    componentWillUnmount() {
        this.mounted = false;
        this.requestEpoch++;
        this.mountTask?.cancel();
        this.cancelSearchFocus();
        this.navigationListener?.remove();
        NetworkService.off('networkChange', this.onNetworkChange);
    }

    componentDidAppear() {
        const { categories } = this.state;
        if (categories) this.fetchStoreListings();
    }

    private getNetworkContext = (): string | undefined => {
        try {
            const network = NetworkService.getNetwork();
            if (!network) return undefined;
            // A peer failover on this same network does not change the catalog.
            return JSON.stringify([network.id?.toString(), network.key, network.networkId]);
        } catch {
            return undefined;
        }
    };

    private onNetworkChange = () => {
        const context = this.getNetworkContext();
        if (context === this.networkContext) return;
        this.networkContext = context;
        this.requestEpoch++;
        this.mountTask?.cancel();
        this.setState({ categories: undefined, message: undefined, dataSource: [], isLoading: false }, () => {
            if (this.mounted) this.fetchStoreListings();
        });
    };

    fetchStoreListings = async (): Promise<void> => {
        if (!this.mounted) return;
        const context = this.getNetworkContext();
        const epoch = ++this.requestEpoch;
        this.networkContext = context;
        if (!context) {
            this.setState({ categories: undefined, message: undefined, dataSource: [], isLoading: false });
            return;
        }
        this.setState({ isLoading: true });
        const current = () => this.mounted && epoch === this.requestEpoch && context === this.getNetworkContext();
        try {
            const { message, categories } = await BackendService.getXAppStoreListings(
                'message,featured,popular,recent,all',
            );
            if (!current()) return;
            this.setState((state) => ({
                message,
                categories,
                dataSource: this.dataForState(categories, state),
                isLoading: false,
            }));
        } catch {
            if (!current()) return;
            this.setState((state) => ({
                isLoading: false,
                // A failed first request must finish the loading placeholders.
                // A failed refresh keeps the last usable catalog and current view.
                dataSource: state.categories ? this.dataForState(state.categories, state) : [],
            }));
        }
    };

    private dataForState = (categories: State['categories'], state: State): SectionData[] => {
        return state.searchEnabled
            ? this.getSearchData(categories, state.searchQuery)
            : this.buildDataSource(categories, state.activeSection, state.categoryFilter);
    };

    getAlphabetSectionData = ({ all: apps }: XamanBackend.XAppStoreListingsCategories): SectionData[] => {
        const sections: SectionData[] = [];
        sortBy(apps, 'title').forEach((item) => {
            if (!item?.title) return;
            const title = item.title.charAt(0).toUpperCase();
            let section = sections.find((candidate) => candidate.title === title);
            if (!section) {
                section = { title, data: [] };
                sections.push(section);
            }
            section.data.push(item);
        });
        return sortBy(sections, 'title');
    };

    getRecentSectionData = ({ recent }: XamanBackend.XAppStoreListingsCategories): SectionData[] => [
        { title: Localize.t('xapp.recentlyUsed'), data: recent },
    ];

    getHomeSectionData = ({ featured, popular }: XamanBackend.XAppStoreListingsCategories): SectionData[] => [
        { title: Localize.t('xapp.ourSuggestions'), data: featured },
        { title: Localize.t('xapp.popular'), data: popular },
    ];

    getCategoriesFilteredData = (
        { all }: XamanBackend.XAppStoreListingsCategories,
        categoryFilter?: string,
    ): SectionData[] => [{ data: all.filter((app) => app.category === categoryFilter) }];

    buildDataSource = (
        categories?: XamanBackend.XAppStoreListingsCategories,
        section?: Sections,
        categoryFilter?: string,
    ): SectionData[] => {
        const { activeSection } = this.state;
        if (!categories) return [];
        switch (section ?? activeSection) {
            case Sections.Home: return this.getHomeSectionData(categories);
            case Sections.Recent: return this.getRecentSectionData(categories);
            case Sections.Alphabet: return this.getAlphabetSectionData(categories);
            case Sections.Categories: return this.getCategoriesFilteredData(categories, categoryFilter);
            default: return [];
        }
    };

    private getSearchData = (categories: State['categories'], query: string): SectionData[] => {
        if (!query || !categories) return [];
        const matches = new Fuse(categories.all, {
            keys: ['title', 'identifier'], minMatchCharLength: 2,
            shouldSort: false, includeScore: false, threshold: 0.1,
        }).search(query).map(({ item }) => item);
        return matches.length ? [{ title: Localize.t('send.searchResults'), data: matches }] : [];
    };

    private cancelSearchFocus = () => {
        if (this.focusFrame !== undefined) cancelAnimationFrame(this.focusFrame);
        this.focusFrame = undefined;
    };

    toggleSearchBar = () => {
        this.cancelSearchFocus();
        this.setState((state) => {
            const searchEnabled = !state.searchEnabled;
            return {
                searchEnabled,
                searchQuery: '',
                dataSource: searchEnabled ? [] : this.buildDataSource(
                    state.categories, state.activeSection, state.categoryFilter,
                ),
            };
        }, () => {
            const { searchEnabled } = this.state;
            if (searchEnabled) {
                this.focusFrame = requestAnimationFrame(() => {
                    this.focusFrame = undefined;
                    const { searchEnabled: stillSearching } = this.state;
                    if (this.mounted && stillSearching) this.searchBarRef.current?.focus();
                });
            }
        });
    };

    onSectionItemPress = (item: SectionButton) => {
        this.setState((state) => ({
            activeSection: item.value,
            dataSource: this.buildDataSource(state.categories, item.value, state.categoryFilter),
        }));
    };

    onSearchChange = (searchQuery: string) => {
        this.setState((state) => ({ searchQuery, dataSource: this.getSearchData(state.categories, searchQuery) }));
    };

    getSegmentButtons = (): SectionButton[] => [
        { label: Localize.t('global.home'), value: Sections.Home },
        { label: Localize.t('xapp.recent'), value: Sections.Recent },
        { label: Localize.t('xapp.ADashZ'), value: Sections.Alphabet },
        { label: Localize.t('xapp.categories'), value: Sections.Categories },
    ];

    getCategoryChips = (): CategoryChipItem[] => {
        const { categories, categoryFilter } = this.state;
        const counts = countBy(categories?.all, 'category');
        return Object.keys(counts).sort((a, b) => counts[b] - counts[a]).map((category) => ({
            value: category, count: counts[category], active: category === categoryFilter,
        }));
    };

    onCategoryChipPress = ({ value }: CategoryChipItem) => {
        this.setState((state) => ({
            categoryFilter: value,
            dataSource: this.buildDataSource(state.categories, Sections.Categories, value),
        }));
    };

    onCategoryChipRemovePress = () => {
        this.setState({ categoryFilter: undefined, dataSource: [] });
    };

    renderHeaderSearchButton = () => {
        const { searchEnabled } = this.state;
        return (
            <TouchableDebounce
                testID={searchEnabled ? 'xapps-search-cancel' : 'xapps-search-open'}
                onPress={this.toggleSearchBar}
                accessibilityRole="button"
                accessibilityLabel={Localize.t(searchEnabled ? 'global.cancel' : 'global.search')}
                style={styles.headerAction}
            >
                {searchEnabled && <Text style={styles.cancelText}>{Localize.t('global.cancel')}</Text>}
                <Icon name={searchEnabled ? 'IconX' : 'IconSearch'} size={20} style={styles.searchIcon} />
            </TouchableDebounce>
        );
    };

    renderContent = () => {
        const {
            message, dataSource, activeSection, categoryFilter, searchEnabled, searchQuery, isLoading,
        } = this.state;
        if (searchEnabled) {
            return (
                <>
                    <SearchBar
                        ref={this.searchBarRef}
                        defaultValue={searchQuery}
                        clearButtonVisibility="never"
                        onChangeText={this.onSearchChange}
                        placeholder={Localize.t('global.search')}
                        containerStyle={styles.searchBarContainer}
                    />
                    <AppsList visible searching dataSource={dataSource} containerStyle={styles.appListContainer} />
                </>
            );
        }
        return (
            <>
                <View style={styles.tabs}>
                    {this.getSegmentButtons().map((item) => (
                        <TouchableDebounce
                            key={item.value}
                            testID={`xapps-section-${item.value}`}
                            accessibilityRole="tab"
                            accessibilityLabel={item.label}
                            accessibilityState={{ selected: item.value === activeSection }}
                            onPress={() => this.onSectionItemPress(item)}
                            style={[styles.tab, item.value === Sections.Home && styles.homeTab,
                                item.value === Sections.Alphabet && styles.alphabetTab,
                                item.value === Sections.Categories && styles.categoryTab,
                                item.value === activeSection && styles.activeTab]}
                        >
                            <Text style={[styles.tabText, item.value === activeSection && styles.activeTabText]}>
                                {item.label}
                            </Text>
                        </TouchableDebounce>
                    ))}
                </View>
                <CategoryChips
                    visible={activeSection === Sections.Categories}
                    categories={this.getCategoryChips()}
                    activeCategory={categoryFilter}
                    containerStyle={styles.categoryChipsContainer}
                    onChipRemovePress={this.onCategoryChipRemovePress}
                    onChipPress={this.onCategoryChipPress}
                />
                <AppsList
                    visible={activeSection !== Sections.Categories || !!categoryFilter}
                    dataSource={dataSource}
                    onRefresh={this.fetchStoreListings}
                    refreshing={isLoading}
                    containerStyle={styles.appListContainer}
                    ListHeaderComponent={activeSection === Sections.Home ? (
                        <HeaderMessage visible message={message} containerStyle={styles.headerMessageContainer} />
                    ) : undefined}
                    emptyTitle={activeSection === Sections.Recent ? Localize.t('xapp.yourRecentXApps') : undefined}
                    emptyBody={activeSection === Sections.Recent ? Localize.t('xapp.recentXAppsExplain') : undefined}
                    emptyIcon={activeSection === Sections.Recent ? 'IconXAppRecent' : undefined}
                />
            </>
        );
    };

    render() {
        const { timestamp } = this.props;
        return (
            <View testID="xapp-store-tab-view" style={styles.container}>
                <Header
                    placement="left"
                    containerStyle={styles.headerContainer}
                    leftComponent={{ text: Localize.t('global.xapps'), textStyle: styles.heading }}
                    rightComponent={{ render: this.renderHeaderSearchButton }}
                />
                <View key={`xappsview-${timestamp}`} style={styles.contentContainer}>
                    {this.renderContent()}
                </View>
            </View>
        );
    }
}

export default XAppsView;
