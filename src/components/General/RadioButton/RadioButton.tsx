/**
 * Radio Button
 *
    <RadioButton />
 *
 */
import React, { PureComponent } from 'react';
import { View, Text, ViewStyle, ImageStyle, StyleProp } from 'react-native';

import { TouchableDebounce } from '@components/General/TouchableDebounce';
import { Icon } from '@components/General/Icon';

import { AppStyles } from '@theme';
import styles from './styles';

/* Types ==================================================================== */
interface Props {
    onPress: (value: any) => void;
    checked: boolean;
    label: string;
    danger?: boolean;
    value: any;
    labelSmall?: string;
    description?: string;
    icon?: React.ComponentProps<typeof Icon>['name'];
    iconStyle?: StyleProp<ImageStyle>;
    disabled?: boolean;
    lessVerticalPadding?: boolean;
    testID?: string;
    style?: ViewStyle | ViewStyle[];
}

/* Component ==================================================================== */
class RadioButton extends PureComponent<Props> {
    onPress = () => {
        const { onPress, value } = this.props;

        if (typeof onPress === 'function') {
            onPress(value);
        }
    };

    render() {
        const {
            checked,
            label,
            danger,
            labelSmall,
            description,
            icon,
            iconStyle,
            disabled,
            testID,
            style,
            lessVerticalPadding,
        } = this.props;

        return (
            <TouchableDebounce
                testID={testID}
                activeOpacity={0.8}
                disabled={disabled}
                onPress={this.onPress}
                style={[
                    styles.content,
                    checked && styles.selected,
                    checked && disabled && styles.selectedDisabled,
                    !checked && disabled && styles.disabled,
                    style,
                    danger && checked && styles.dangerSelected,
                    lessVerticalPadding && styles.lessVerticalPadding,
                ]}
            >
                <View style={AppStyles.flex1}>
                    <View style={[
                        styles.dot,
                        checked && styles.dotSelected,
                        danger && checked && styles.dangerSelected,
                    ]}>
                        {checked && <View style={[ styles.filled, danger && styles.danger ]} />}
                    </View>
                </View>
                <View style={AppStyles.flex6}>
                    <View style={[AppStyles.row, AppStyles.centerAligned]}>
                        {!!icon && (
                            <Icon
                                name={icon}
                                size={22}
                                style={[
                                    checked ? styles.labelIconSelected : styles.labelIcon,
                                    danger && checked && AppStyles.imgColorRed,
                                    iconStyle,
                                ]}
                            />
                        )}
                        <Text
                            style={[
                                AppStyles.p,
                                AppStyles.strong,
                                checked ? styles.textColorSelected : styles.textColor,
                                checked && danger && AppStyles.colorRed,
                            ]}
                        >
                            {label}
                        </Text>
                    </View>
                    {labelSmall && (
                        <Text style={[styles.labelSmall, checked ? styles.textColorSelected : styles.textColor]}>
                            {labelSmall}
                        </Text>
                    )}
                    {description && (
                        <Text
                            style={[
                                AppStyles.subtext,
                                styles.descriptionText,
                                checked ? styles.textColorSelected : styles.textColor,
                                checked && danger && AppStyles.colorRed,
                            ]}
                        >
                            {description}
                        </Text>
                    )}
                </View>
            </TouchableDebounce>
        );
    }
}

/* Export Component ==================================================================== */
export default RadioButton;
