import StyleService from '@services/StyleService';
import AppFonts from '@theme/fonts';

export default StyleService.create({
    container: {
        flexBasis: '45%',
        flexGrow: 1,
        minHeight: 63,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 15,
        paddingHorizontal: 12,
        paddingVertical: 13,
        backgroundColor: StyleService.select({ light: '#f3f4f8', dark: '#242632' }),
    },
    icon: { tintColor: StyleService.select({ light: '#636b86', dark: '#a9afc6' }) },
    nameContainer: { flex: 1, minWidth: 0 },
    buttonText: {
        fontFamily: AppFonts.base.familyBold,
        fontSize: 14,
        lineHeight: 18,
        color: StyleService.select({ light: '#636b86', dark: '#a9afc6' }),
    },
    count: {
        fontFamily: AppFonts.base.family,
        fontSize: 12,
        lineHeight: 18,
        color: StyleService.select({ light: '#636b86', dark: '#a9afc6' }),
    },
});
