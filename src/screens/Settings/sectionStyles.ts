import { Platform, StyleSheet } from 'react-native';
import StyleService from '@services/StyleService';
import { AppFonts, AppSizes } from '@theme';

export default StyleService.create({
    content: {
        paddingHorizontal: AppSizes.paddingSml,
        paddingTop: 8,
        paddingBottom: AppSizes.safeAreaBottomInset + 24,
    },
    section: { marginBottom: 22 },
    sectionTitle: {
        fontFamily: AppFonts.base.familyBold,
        fontSize: AppFonts.small.size * 1.2,
        color: '$textSecondary',
        marginHorizontal: 10,
        marginBottom: 9,
    },
    sectionFooter: {
        fontFamily: AppFonts.base.family,
        fontSize: AppFonts.small.size,
        color: '$textSecondary',
        marginHorizontal: 10,
        marginTop: 9,
    },
    group: { backgroundColor: '$tint', borderRadius: 16, overflow: 'hidden' },
    separator: {
        height: StyleSheet.hairlineWidth,
        marginHorizontal: 15,
        backgroundColor: '$transparentContrast',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 56,
        paddingHorizontal: 15,
        paddingVertical: 13,
    },
    label: {
        flex: 1,
        flexShrink: 1,
        fontFamily: AppFonts.base.family,
        fontSize: AppFonts.base.size * 0.9,
        color: '$textPrimary',
        paddingRight: 12,
    },
    value: {
        maxWidth: '50%',
        flexShrink: 1,
        fontFamily: AppFonts.base.family,
        fontSize: AppFonts.base.size,
        color: '$textSecondary',
        textAlign: 'right',
    },
    control: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
    switchContainer: {
        flex: 0,
        flexShrink: 0,
        // React Native reserves 51pt, while the newer native iOS track overhangs it.
        paddingRight: Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26 ? 13 : 0,
    },
    stackedContent: { flex: 1 },
    stackedLabel: { flex: 0, paddingRight: 0 },
    stackedValue: { maxWidth: '100%', marginTop: 5, textAlign: 'auto' },
    chevron: { tintColor: '$textSecondary', marginLeft: 6, flexShrink: 0 },
});
