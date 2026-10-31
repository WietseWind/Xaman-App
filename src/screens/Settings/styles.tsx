import StyleService from '@services/StyleService';
import { AppSizes, AppFonts } from '@theme';

export default StyleService.create({
    content: { paddingHorizontal: AppSizes.paddingSml, paddingTop: 8, paddingBottom: 20 },
    rowContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 58,
        paddingHorizontal: 15,
        paddingVertical: 14,
    },
    rowLabel: {
        flex: 1,
        fontFamily: AppFonts.base.familyBold,
        fontSize: AppFonts.base.size,
        color: '$textPrimary',
        marginHorizontal: 14,
    },
    rowIcon: { tintColor: '$textPrimary', flexShrink: 0 },
    chevron: { tintColor: '$textSecondary', flexShrink: 0 },
    monetizationContainer: { marginHorizontal: AppSizes.paddingSml, marginBottom: AppSizes.paddingSml },
});
