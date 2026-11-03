import React, { PureComponent } from 'react';
import { View, ScrollView, Text, ViewStyle } from 'react-native';
import { TouchableDebounce, Icon } from '@components/General';
import { getXAppCategoryIcon } from '@common/helpers/xappCategoryIcon';
import StyleService from '@services/StyleService';
import Localize from '@locale';
import { ChipButton, CategoryChipItem } from './ChipButton';
import styles from './styles';

interface Props {
    categories: CategoryChipItem[];
    activeCategory?: string;
    visible?: boolean;
    onChipPress?: (item: CategoryChipItem) => void;
    onChipRemovePress?: (item: string) => void;
    containerStyle?: ViewStyle | ViewStyle[];
}

class CategoryChips extends PureComponent<Props> {
    onChipRemovePress = () => {
        const { activeCategory, onChipRemovePress } = this.props;
        if (activeCategory) onChipRemovePress?.(activeCategory);
    };

    render() {
        const { visible, categories, onChipPress, activeCategory, containerStyle } = this.props;
        if (!visible) return null;
        if (activeCategory) {
            const count = categories.find(({ value }) => value === activeCategory)?.count ?? 0;
            return (
                <View style={[styles.containerActive, containerStyle]}>
                    <TouchableDebounce
                        testID="xapp-category-clear"
                        accessibilityRole="button"
                        accessibilityLabel={`${activeCategory}, ${Localize.t('global.cancel')}`}
                        onPress={this.onChipRemovePress}
                        style={styles.activeCategory}
                    >
                        <Icon name={getXAppCategoryIcon(activeCategory)} size={18} style={styles.icon} />
                        <Text style={styles.activeText}>{activeCategory}</Text>
                        <Text style={styles.count}>{count}</Text>
                        <Icon name="IconX" size={16} style={styles.icon} />
                    </TouchableDebounce>
                </View>
            );
        }
        if (!categories.length) return null;
        return (
            <ScrollView
                testID="xapp-categories-scroll"
                style={styles.scroll}
                contentContainerStyle={[styles.container, containerStyle]}
                indicatorStyle={StyleService.isDarkMode() ? 'white' : 'default'}
            >
                <Text style={styles.heading}>{Localize.t('xapp.exploreByCategory')}</Text>
                <View style={styles.grid}>
                    {categories.map((category) => (
                        <ChipButton key={category.value} item={category} onPress={onChipPress} />
                    ))}
                </View>
            </ScrollView>
        );
    }
}
export default CategoryChips;
