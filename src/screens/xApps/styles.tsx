import StyleService from '@services/StyleService';
import AppFonts from '@theme/fonts';
import AppSizes from '@theme/sizes';

export default StyleService.create({
    container: {
        flex: 1,
        paddingTop: AppSizes.safeAreaTopInset,
        backgroundColor: StyleService.select({ light: '#ffffff', dark: '#11121a' }),
    },
    contentContainer: { flex: 1, alignSelf: 'stretch' },
    headerContainer: {
        height: 68,
        marginTop: 0,
        paddingHorizontal: 20,
        backgroundColor: '$transparent',
    },
    heading: {
        fontFamily: AppFonts.base.familyBold,
        fontSize: 33,
        lineHeight: 39,
        color: StyleService.select({ light: '#10121a', dark: '#f5f6fc' }),
    },
    headerAction: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
    cancelText: {
        fontFamily: AppFonts.base.family,
        fontSize: 14,
        color: StyleService.select({ light: '#636b86', dark: '#a9afc6' }),
    },
    searchIcon: { tintColor: StyleService.select({ light: '#10121a', dark: '#f5f6fc' }) },
    tabs: { flexDirection: 'row', gap: 7, marginHorizontal: 20, marginTop: 5, marginBottom: 17 },
    tab: {
        flex: 1,
        minHeight: 40,
        borderRadius: 12,
        paddingHorizontal: 5,
        paddingVertical: 8,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: StyleService.select({ light: '#f3f4f8', dark: '#242632' }),
    },
    homeTab: { flex: 0.82 },
    alphabetTab: { flex: 0.7 },
    categoryTab: { flex: 1.4 },
    activeTab: { backgroundColor: StyleService.select({ light: '#171923', dark: '#f5f6fc' }) },
    tabText: {
        fontFamily: AppFonts.base.family,
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
        color: StyleService.select({ light: '#636b86', dark: '#a9afc6' }),
    },
    activeTabText: {
        fontFamily: AppFonts.base.familyBold,
        color: StyleService.select({ light: '#ffffff', dark: '#171923' }),
    },
    headerMessageContainer: {},
    appListContainer: { flex: 1, paddingHorizontal: 20 },
    searchBarContainer: { marginHorizontal: 20, marginTop: 5, marginBottom: 17 },
    categoryChipsContainer: { paddingHorizontal: 20 },
});
