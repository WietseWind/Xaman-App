import StyleService from '@services/StyleService';
import AppFonts from '@theme/fonts';

const select = (light: string, dark: string) => StyleService.select({ light, dark });

export default StyleService.create({
    contentContainer: {},
    emptyContent: { flexGrow: 1 },
    gridRow: { flexDirection: 'row', columnGap: 12, marginBottom: 12 },
    gridCell: { flex: 1, minWidth: 0 },
    listEmptyContainer: { flexGrow: 1, alignItems: 'center', paddingTop: 70, paddingBottom: 50, paddingHorizontal: 12 },
    emptyIconFrame: {
        width: 58, height: 58, borderRadius: 19, backgroundColor: select('#f3f4f8', '#242632'),
        alignItems: 'center', justifyContent: 'center', marginBottom: 17,
    },
    emptyIcon: { tintColor: select('#636b86', '#a9afc6') },
    emptyTitle: {
        fontFamily: AppFonts.base.familyBold, fontSize: 20, lineHeight: 25,
        color: select('#181b30', '#f2f3fb'), textAlign: 'center', marginBottom: 8,
    },
    emptyBody: {
        fontFamily: AppFonts.base.family, fontSize: 14, lineHeight: 20,
        color: select('#636b86', '#a9afc6'), textAlign: 'center', maxWidth: 235,
    },
    sectionHeader: { backgroundColor: select('#fff', '#11121a'), paddingBottom: 12 },
    sectionHeaderText: {
        fontSize: 19, lineHeight: 24, fontFamily: AppFonts.base.familyBold, color: select('#181b30', '#f2f3fb'),
    },
    sectionFooter: { height: 14 },
});
