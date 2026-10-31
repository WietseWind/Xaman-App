import React, { Component } from 'react';
import {
    Dimensions, PixelRatio, RefreshControl, ScaledSize, SectionList, StyleProp, Text, View, ViewStyle,
} from 'react-native';

import StyleService from '@services/StyleService';
import { Icon } from '@components/General/Icon';
import { AppActions, AppItem } from '@components/Modules/XAppStore/AppsList/AppItem';
import type { AppType } from '@components/Modules/XAppStore/AppsList/AppItem';
import Localize from '@locale';
import { XAppOrigin } from '@common/libs/payload';
import { glassTabScrollPadding } from '@common/helpers/glassTabBar';
import { VibrateHapticFeedback } from '@common/helpers/interface';
import CoreRepository from '@store/repositories/core';
import styles from './styles';

type AppSection = { title?: string; data: Array<AppType | undefined> };
type AppRow = Array<AppType | undefined>;
type RowSection = { title?: string; data: AppRow[] };

interface Props {
    dataSource?: AppSection[];
    visible: boolean;
    onRefresh?: () => Promise<void> | void;
    refreshing?: boolean;
    searching?: boolean;
    containerStyle: StyleProp<ViewStyle>;
    ListHeaderComponent?: React.ReactElement | null;
    emptyTitle?: string;
    emptyBody?: string;
    emptyIcon?: React.ComponentProps<typeof Icon>['name'];
}

interface State { fontScale: number }

class AppsList extends Component<Props, State> {
    private mounted = false;
    private dimensionsSubscription?: ReturnType<typeof Dimensions.addEventListener>;
    private source?: AppSection[];
    private rows: RowSection[] = [];

    constructor(props: Props) {
        super(props);
        this.state = { fontScale: Math.max(1, PixelRatio.getFontScale()) };
    }

    componentDidMount() {
        this.mounted = true;
        this.dimensionsSubscription = Dimensions.addEventListener('change', this.onDimensionsChange);
    }

    componentWillUnmount() {
        this.mounted = false;
        this.dimensionsSubscription?.remove();
    }

    onDimensionsChange = ({ window }: { window: ScaledSize }) => {
        const fontScale = Math.max(1, window.fontScale);
        const { fontScale: currentFontScale } = this.state;
        if (this.mounted && fontScale !== currentFontScale) this.setState({ fontScale });
    };

    getSections = (): RowSection[] => {
        const { dataSource } = this.props;
        if (this.source === dataSource) return this.rows;
        this.source = dataSource;
        this.rows = (this.source ?? []).filter((section) => section.data.length > 0).map((section) => {
            const data: AppRow[] = [];
            for (let index = 0; index < section.data.length; index += 2) {
                data.push(section.data.slice(index, index + 2));
            }
            return { ...section, data };
        });
        return this.rows;
    };

    onRefresh = async () => {
        const { onRefresh } = this.props;
        const haptics = !!CoreRepository.getSettings()?.hapticFeedback;
        if (haptics) VibrateHapticFeedback('impactLight');
        await onRefresh?.();
        if (this.mounted && haptics) VibrateHapticFeedback('impactLight');
    };

    renderEmpty = () => {
        const { searching, emptyTitle, emptyBody, emptyIcon } = this.props;
        if (searching && !emptyTitle && !emptyBody && !emptyIcon) return null;
        return (
            <View testID="xapp-list-empty" style={styles.listEmptyContainer}>
                {!!emptyIcon && (
                    <View style={styles.emptyIconFrame}>
                        <Icon name={emptyIcon} size={26} style={styles.emptyIcon} />
                    </View>
                )}
                <Text style={styles.emptyTitle}>{emptyTitle || Localize.t('global.noInformationToShow')}</Text>
                {!!emptyBody && <Text style={styles.emptyBody}>{emptyBody}</Text>}
            </View>
        );
    };

    renderItem = ({ item: row }: { item: AppRow }): React.ReactElement => {
        const { fontScale } = this.state;
        return (
            <View style={styles.gridRow}>
                {row.map((item, slot) => (
                    <View key={`${item?.identifier || 'placeholder'}-${slot}`} style={styles.gridCell}>
                        <AppItem item={item} action={AppActions.OPEN_ABOUT} origin={XAppOrigin.XAPP_STORE}
                        variant="tile" fontScale={fontScale} />
                    </View>
            ))}
                {row.length === 1 && <View testID="xapp-grid-empty-slot" style={styles.gridCell} accessible={false} />}
            </View>
        );
    };

    renderSectionHeader = ({ section: { title } }: { section: { title?: string } }) => !title ? null : (
        <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{title}</Text>
        </View>
    );

    renderSectionFooter = () => <View style={styles.sectionFooter} />;

    render() {
        const { visible, containerStyle, refreshing, onRefresh, ListHeaderComponent } = this.props;
        const { fontScale } = this.state;
        if (!visible) return null;
        const sections = this.getSections();
        return (
            <SectionList
                testID="xapp-grid-list"
                keyboardShouldPersistTaps="handled"
                style={containerStyle}
                contentContainerStyle={[
                    styles.contentContainer,
                    { paddingBottom: 24 + glassTabScrollPadding },
                    sections.length === 0 && styles.emptyContent,
                ]}
                sections={sections}
                extraData={fontScale}
                renderItem={this.renderItem}
                keyExtractor={(row: AppRow, index) => `${row.map((item) => item?.identifier || 'placeholder').join('|')}:${index}`}
                renderSectionHeader={this.renderSectionHeader}
                renderSectionFooter={this.renderSectionFooter}
                ListHeaderComponent={ListHeaderComponent}
                ListEmptyComponent={this.renderEmpty}
                stickySectionHeadersEnabled
                refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={this.onRefresh}
                    tintColor={StyleService.value('$contrast')} /> : undefined}
                indicatorStyle={StyleService.isDarkMode() ? 'white' : 'default'}
                showsVerticalScrollIndicator={false}
            />
        );
    }
}

export default AppsList;
