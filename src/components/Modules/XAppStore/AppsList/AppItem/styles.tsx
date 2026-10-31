import { StyleSheet } from 'react-native';
import StyleService from '@services/StyleService';
import AppFonts from '@theme/fonts';

const select = (light: string, dark: string) => StyleService.select({ light, dark });
const ink = select('#181b30', '#f2f3fb');
const secondary = select('#636b86', '#a9afc6');

export default StyleService.create({
    tile: { height: 132, borderRadius: 15, backgroundColor: select('#e9e9e9', '#242733'), overflow: 'hidden' },
    backdropContainer: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
    backdrop: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', opacity: 0.65 },
    scrim: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', tintColor: select('#ffffff', '#171924') },
    decoration: { ...StyleSheet.absoluteFillObject },
    iconShadow: {
        position: 'absolute', top: 8, left: 12, width: 54, height: 54, borderRadius: 15,
        backgroundColor: select('#fff', '#171924'),
        shadowColor: '#111a38', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.18,
        shadowRadius: 7, elevation: 3,
    },
    appIcon: { width: 54, height: 54, borderRadius: 15 },
    fallbackIcon: { alignItems: 'center', justifyContent: 'center' },
    fallbackGlyph: { tintColor: secondary },
    developmentBadge: {
        position: 'absolute', bottom: -3, right: -3, width: 17, height: 17, borderRadius: 9,
        backgroundColor: '$orange', alignItems: 'center', justifyContent: 'center',
    },
    developmentGlyph: { tintColor: '$white' },
    caption: { position: 'absolute', top: 68, left: 12, right: 12, height: 56 },
    appTitle: { fontFamily: AppFonts.base.familyBold, fontSize: 17, lineHeight: 19, color: ink, marginBottom: 3 },
    appDescription: { fontFamily: AppFonts.base.family, fontSize: 12.5, lineHeight: 15, color: secondary },
    openTarget: { ...StyleSheet.absoluteFillObject, borderRadius: 15, zIndex: 1 },
    infoTarget: {
        position: 'absolute', top: 6, right: 6, width: 44, height: 44,
        alignItems: 'center', justifyContent: 'center', zIndex: 2,
    },
    infoFace: {
        width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
        backgroundColor: select('#ffffffd9', '#1b1e2bd9'),
    },
    infoGlyph: { tintColor: ink },
    placeholderIcon: { backgroundColor: select('#d9dce7', '#343747'), shadowOpacity: 0, elevation: 0 },
    placeholderCaption: { position: 'absolute', top: 73, left: 12, right: 12 },
    placeholderTitle: { height: 12, borderRadius: 4, width: '76%', backgroundColor: select('#d9dce7', '#343747') },
    placeholderDescription: {
        height: 9, borderRadius: 3, width: '93%', marginTop: 9, backgroundColor: select('#d9dce7', '#343747'),
    },
    featured: {
        minHeight: 126, borderRadius: 15, backgroundColor: '#122462', overflow: 'hidden',
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 20,
    },
    featuredBackdrop: {
        position: 'absolute', width: '73%', height: '210%', right: '-15%', top: '-56%',
        opacity: 0.22, transform: [{ rotate: '-12deg' }],
    },
    featuredMain: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0, marginRight: 10 },
    featuredIconShadow: { position: 'relative', top: 0, left: 0, width: 51, height: 51, borderRadius: 15 },
    featuredIcon: { width: 51, height: 51, borderRadius: 15 },
    featuredText: { flex: 1, minWidth: 0, marginLeft: 13 },
    featuredTitle: {
        fontFamily: AppFonts.base.familyBold, fontSize: 20, lineHeight: 24, color: '$white', marginBottom: 5,
    },
    featuredDescription: { fontFamily: AppFonts.base.family, fontSize: 13, lineHeight: 17, color: '#e2e7ff' },
    featuredButton: {
        minHeight: 44, minWidth: 58, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 11,
        backgroundColor: '$white', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    featuredButtonText: { fontFamily: AppFonts.base.familyBold, fontSize: 13, lineHeight: 18, color: '$blue' },
});
