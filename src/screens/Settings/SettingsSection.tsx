import React, { Children, ReactNode } from 'react';
import { Text, View, StyleProp, TextStyle, useWindowDimensions } from 'react-native';

import { Icon } from '@components/General/Icon';
import { TouchableDebounce } from '@components/General/TouchableDebounce';
import { Switch } from '@components/General/Switch';

import styles from './sectionStyles';

export const SettingsSection = ({ title, children }: { title?: string; children: ReactNode }) => {
    return (
        <View style={styles.section}>
            {!!title && (
                <Text accessibilityRole="header" style={styles.sectionTitle}>
                    {title}
                </Text>
            )}
            <View style={styles.group}>
                {Children.toArray(children).map((child, index) => (
                    <View key={React.isValidElement(child) ? child.key ?? index : index}>
                        {index > 0 && <View style={styles.separator} />}
                        {child}
                    </View>
                ))}
            </View>
        </View>
    );
};

interface RowProps {
    label: string;
    value?: string;
    valueTestID?: string;
    testID?: string;
    onPress?: () => void;
    children?: ReactNode;
    valueStyle?: StyleProp<TextStyle>;
    selectableValue?: boolean;
}

export const SettingsRow = ({
    label,
    value,
    valueTestID,
    testID,
    onPress,
    children,
    valueStyle,
    selectableValue,
}: RowProps) => {
    const { fontScale, width } = useWindowDimensions();
    const stackValue = value !== undefined && (fontScale > 1.2 || (width < 360 && fontScale > 1));
    const controls = Children.map(children, (child) => {
        if (!React.isValidElement(child) || child.type !== Switch) return child;
        return React.cloneElement(child as React.ReactElement<React.ComponentProps<typeof Switch>>, {
            accessibilityLabel: label,
            containerStyle: styles.switchContainer,
        });
    });
    const content = (
        <>
            {stackValue ? (
                <View style={styles.stackedContent}>
                    <Text style={[styles.label, styles.stackedLabel]}>{label}</Text>
                    <Text
                        testID={valueTestID}
                        selectable={selectableValue}
                        style={[styles.value, valueStyle, styles.stackedValue]}
                    >
                        {value}
                    </Text>
                </View>
            ) : (
                <>
                    <Text style={styles.label}>{label}</Text>
                    {value !== undefined && (
                        <Text
                            testID={valueTestID}
                            selectable={selectableValue}
                            style={[styles.value, valueStyle]}
                        >
                            {value}
                        </Text>
                    )}
                </>
            )}
            {children && <View style={styles.control}>{controls}</View>}
            {onPress && <Icon size={18} style={styles.chevron} name="IconChevronRight" />}
        </>
    );

    return onPress ? (
        <TouchableDebounce testID={testID} accessibilityRole="button" onPress={onPress} style={styles.row}>
            {content}
        </TouchableDebounce>
    ) : (
        <View testID={testID} style={styles.row}>
            {content}
        </View>
    );
};
