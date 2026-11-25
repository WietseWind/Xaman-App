import React from 'react';
import { Text, View } from 'react-native';
import { TouchableDebounce } from '@components/General/TouchableDebounce';
import { Icon } from '@components/General/Icon';
import StyleService from '@services/StyleService';
import AppFonts from '@theme/fonts';
import colors from '@theme/colors';
import { HexToRgbA } from '@common/utils/color';

const styles = StyleService.create({
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        marginHorizontal: 12,
        marginBottom: 12,
        borderRadius: 14,
        gap: 10,
    },
    orange: {
        backgroundColor: StyleService.select({
            light: HexToRgbA(colors.orange, 0.16),
            dark: HexToRgbA(colors.orange, 0.2),
        }),
    },
    red: {
        backgroundColor: StyleService.select({
            light: HexToRgbA(colors.red, 0.1),
            dark: HexToRgbA(colors.red, 0.2),
        }),
    },
    orangeTitle: { color: StyleService.select({ light: '#8A591B', dark: '$orange' }) },
    redTitle: { color: StyleService.select({ light: '$darkRed', dark: '$red' }) },
    iconBox: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    orangeIcon: { tintColor: StyleService.select({ light: '#8A591B', dark: '$orange' }) },
    redIcon: { tintColor: StyleService.select({ light: '$darkRed', dark: '$red' }) },
    copy: { flex: 1, minWidth: 0 },
    title: { color: '$textPrimary', fontFamily: AppFonts.base.familyBold, fontSize: 13, lineHeight: 18 },
    subtitle: {
        color: '$textSecondary',
        fontFamily: AppFonts.base.family,
        fontSize: 11,
        lineHeight: 16,
        marginTop: 2,
    },
    chevron: { tintColor: '$textSecondary' },
});
export const HomeWarningBanner = ({
    variant,
    title,
    subtitle,
    onPress,
}: {
    variant: 'orange' | 'red';
    title: string;
    subtitle: string;
    onPress: () => void;
}) => (
    <TouchableDebounce
        testID={`home-${variant}-backup-warning`}
        accessibilityRole="button"
        onPress={onPress}
        style={[styles.banner, styles[variant]]}
    >
        <View style={[styles.iconBox, styles[variant]]}>
            <Icon
                name={variant === 'orange' ? 'IconScanCard' : 'IconFileText'}
                size={21}
                style={variant === 'orange' ? styles.orangeIcon : styles.redIcon}
            />
        </View>
        <View style={styles.copy}>
            <Text style={[styles.title, variant === 'orange' ? styles.orangeTitle : styles.redTitle]}>
                {title}
            </Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <Icon name="IconChevronRight" size={16} style={styles.chevron} />
    </TouchableDebounce>
);
