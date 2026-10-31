import React, { PureComponent } from 'react';
import { View } from 'react-native';

// import { AppStyles } from '@theme';
import styles from './styles';
import { ASSETS_CATEGORY } from '@screens/Overlay/SwitchAssetCategory/types';
import CategoryTabs from '../../CategoryTabs';

/* Types ==================================================================== */
interface Props {
    onTitlePress: (selectedCategory?: ASSETS_CATEGORY) => void;
}

/* Component ==================================================================== */
class ListHeader extends PureComponent<Props> {
    onTitlePress = (selectedCategory?: ASSETS_CATEGORY) => {
        const { onTitlePress } = this.props;

        if (typeof onTitlePress === 'function') {
            onTitlePress(selectedCategory);
        }
    };

    // renderTitle = () => {
    //     return (
    //         <TouchableDebounce
    //             style={[AppStyles.row, AppStyles.flex5, AppStyles.centerAligned]}
    //             onPress={this.onTitlePress}
    //         >
    //             <Text numberOfLines={1} style={styles.tokenText}>
    //                 {Localize.t('global.nfts')}
    //             </Text>
    //             <Icon name="IconChevronDown" size={22} style={styles.pickerIcon} />
    //         </TouchableDebounce>
    //     );
    // };

    render() {
        return (
            <View style={[
                styles.container,
            ]}>
                <CategoryTabs active={ASSETS_CATEGORY.NFTs} onPress={this.onTitlePress} />
                {/* <View style={[
                    AppStyles.alignSelfStretch,
                ]}>{this.renderButtons()}</View> */}
            </View>
        );
    }
}

export default ListHeader;
