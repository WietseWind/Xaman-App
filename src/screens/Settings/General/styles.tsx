import StyleService from '@services/StyleService';
import { AppFonts } from '@theme';

export default StyleService.create({
    container: { flex: 1, backgroundColor: '$background' },
    themeItem: { flexDirection: 'row', alignItems: 'center', padding: 14, minHeight: 70 },
    themeItemSelected: { backgroundColor: '$lightBlue' },
    themeLabel: { flex: 1, paddingHorizontal: 12 },
    themeItemDot: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 1.5,
        borderColor: '$textSecondary',
        alignItems: 'center',
        justifyContent: 'center',
    },
    themeItemDotSelected: { borderColor: '$blue', borderWidth: 2 },
    themeItemFilled: { width: 12, height: 12, borderRadius: 6, backgroundColor: '$blue' },
    themeItemLabelText: {
        fontFamily: AppFonts.base.familyBold,
        fontSize: AppFonts.base.size,
        color: '$textPrimary',
    },
    themeItemLabelSmall: {
        fontFamily: AppFonts.base.family,
        fontSize: AppFonts.small.size,
        color: '$textSecondary',
        marginTop: 3,
    },
    themePreview: {
        width: 52,
        minHeight: 44,
        padding: 8,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    themePreviewText: { fontFamily: AppFonts.base.familyExtraBold, fontSize: AppFonts.p.size },
    themePreviewLight: { backgroundColor: '$white', color: '$black' },
    themePreviewDark: { backgroundColor: '$themeDark', color: '$white' },
    themePreviewMoonlight: { backgroundColor: '$themeMoonlight', color: '$silver' },
    themePreviewRoyal: { backgroundColor: '$themeRoyal', color: '$white' },
});
