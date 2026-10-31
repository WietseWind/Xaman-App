import React from 'react';
import { Text, View } from 'react-native';

import { TouchableDebounce } from '@components/General/TouchableDebounce';
import { ASSETS_CATEGORY } from '@screens/Overlay/SwitchAssetCategory/types';
import StyleService from '@services/StyleService';
import Localize from '@locale';
import { AppFonts } from '@theme';

interface Props {
    active: ASSETS_CATEGORY;
    onPress: (category: ASSETS_CATEGORY) => void;
}

const styles = StyleService.create({
    container: {
        flexDirection: 'row',
        flexShrink: 1,
        marginRight: 12,
    },
    tab: {
        minHeight: 34,
        justifyContent: 'center',
        paddingVertical: 8,
        flexShrink: 1,
    },
    firstTab: {
        marginRight: 16,
    },
    label: {
        fontFamily: AppFonts.base.familyBold,
        fontSize: AppFonts.scaleFontSize(13),
        color: '$textSecondary',
    },
    activeLabel: {
        color: '$textPrimary',
    },
});

const CategoryTabs = ({ active, onPress }: Props) => (
    <View style={styles.container}>
        {[
            { category: ASSETS_CATEGORY.Tokens, label: Localize.t('global.assets'), testID: 'assets-category-tokens' },
            { category: ASSETS_CATEGORY.NFTs, label: Localize.t('global.nfts'), testID: 'assets-category-nfts' },
        ].map(({ category, label, testID }, index) => (
            <TouchableDebounce
                key={category}
                testID={testID}
                accessibilityRole="tab"
                accessibilityState={{ selected: active === category }}
                hitSlop={{ top: 5, bottom: 5 }}
                style={[styles.tab, index === 0 && styles.firstTab]}
                onPress={() => { if (active !== category) onPress(category); }}
            >
                <Text numberOfLines={1} style={[styles.label, active === category && styles.activeLabel]}>
                    {label}
                </Text>
            </TouchableDebounce>
        ))}
    </View>
);

export default CategoryTabs;
