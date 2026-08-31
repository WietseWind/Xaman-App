import StyleService from '@services/StyleService';

import { AppFonts, AppSizes } from '@theme';
/* Styles ==================================================================== */
export default StyleService.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 10,
        paddingHorizontal: AppSizes.paddingSml,
        backgroundColor: '$tint',
    },
    tokenImageContainer: {
        marginRight: 10,
    },
    label: {
        flexWrap: 'wrap',
        flexShrink: 1,
        fontSize: AppFonts.subtext.size,
        fontFamily: AppFonts.base.familyMono,
        color: '$textPrimary',
        marginBottom: 3,
    },
    labelPlaceholder: {
        color: StyleService.select({ light: '$silver', dark: '$grey' }),
        backgroundColor: StyleService.select({ light: '$silver', dark: '$grey' }),
    },
    description: {
        flexWrap: 'wrap',
        flexShrink: 1,
        fontFamily: AppFonts.base.familyMonoBold,
        fontSize: AppFonts.small.size,
        color: '$textSecondary',
    },
    descriptionPlaceholder: {
        color: StyleService.select({ light: '$silver', dark: '$grey' }),
        backgroundColor: StyleService.select({ light: '$silver', dark: '$grey' }),
    },
});
