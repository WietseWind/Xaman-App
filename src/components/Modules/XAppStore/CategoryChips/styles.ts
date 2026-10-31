import StyleService from '@services/StyleService';
import AppFonts from '@theme/fonts';
import { glassTabScrollPadding } from '@common/helpers/glassTabBar';

export default StyleService.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 20 + glassTabScrollPadding },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    heading: {
        fontFamily: AppFonts.base.familyExtraBold,
        fontSize: 19,
        lineHeight: 24,
        marginBottom: 14,
        color: StyleService.select({ light: '#171923', dark: '#f5f6fc' }),
    },
    containerActive: { flexDirection: 'row', paddingBottom: 14 },
    activeCategory: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        borderRadius: 12,
        paddingHorizontal: 13,
        paddingVertical: 9,
        backgroundColor: StyleService.select({ light: '#f3f4f8', dark: '#242632' }),
    },
    activeText: {
        fontFamily: AppFonts.base.familyBold,
        fontSize: 14,
        color: StyleService.select({ light: '#636b86', dark: '#a9afc6' }),
    },
    count: {
        fontFamily: AppFonts.base.family,
        fontSize: 12,
        color: StyleService.select({ light: '#636b86', dark: '#a9afc6' }),
    },
    icon: { tintColor: StyleService.select({ light: '#636b86', dark: '#a9afc6' }) },
});
