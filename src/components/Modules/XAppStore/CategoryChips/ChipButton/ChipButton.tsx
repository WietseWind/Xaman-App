import React, { PureComponent } from 'react';
import { Text, View } from 'react-native';
import { TouchableDebounce, Icon } from '@components/General';
import { getXAppCategoryIcon } from '@common/helpers/xappCategoryIcon';
import styles from './styles';

export type CategoryChipItem = { value: string; count?: number; active?: boolean };
interface Props {
    item: CategoryChipItem;
    onPress?: (item: CategoryChipItem) => void;
}

class ChipButton extends PureComponent<Props> {
    onPress = () => {
        const { onPress, item } = this.props;
        onPress?.(item);
    };

    render() {
        const { item } = this.props;
        return (
            <TouchableDebounce
                testID={`xapp-category-${item.value}`}
                accessibilityRole="button"
                accessibilityLabel={`${item.value}, ${item.count ?? 0}`}
                onPress={this.onPress}
                activeOpacity={0.8}
                style={styles.container}
            >
                <Icon name={getXAppCategoryIcon(item.value)} size={18} style={styles.icon} />
                <View style={styles.nameContainer}>
                    <Text style={styles.buttonText}>{item.value}</Text>
                </View>
                <Text style={styles.count}>{item.count ?? 0}</Text>
            </TouchableDebounce>
        );
    }
}
export default ChipButton;
