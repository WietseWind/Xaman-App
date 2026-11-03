import StyleService from '@services/StyleService';
import AppFonts from '@theme/fonts';
import identify from '../IdentifyTangemCard/styles';

const extra = StyleService.create({
    compactBody: { paddingVertical: 10 },
    compactTitle: { fontSize: 23, lineHeight: 28 },
    compactCard: { padding: 10, borderRadius: 10 },
    centeredSectionLabel: { textAlign: 'center' },
    compactSerial: { marginTop: 7, paddingTop: 6 },
    cardHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 3 },
    cardName: { flexGrow: 1, flexShrink: 1 },
    artwork: { height: 120, width: 224, maxWidth: '100%', alignSelf: 'center' },
    blueCard: { position: 'absolute', left: 0, top: 0, width: 156, height: 108 },
    goldCard: { position: 'absolute', right: 0, top: 18, width: 156, height: 108 },
    smallArtwork: { height: 74, width: 144 },
    smallBlueCard: { width: 98, height: 68 },
    smallGoldCard: { width: 98, height: 68, top: 8 },
    faded: { opacity: 0.3 },
    front: { zIndex: 1 },
    progress: { marginBottom: 10 },
    progressSegments: { flexDirection: 'row', gap: 4, marginTop: 7 },
    progressTrack: { flex: 1, height: 3, borderRadius: 1.5, backgroundColor: '$lightBlue' },
    progressFill: { backgroundColor: '$blue' },
    stepText: { fontFamily: AppFonts.base.familyBold, fontSize: 12, lineHeight: 18, color: '$textSecondary' },
    chip: {
        color: StyleService.select({ light: '#15754E', dark: '#81D5AF' }),
        fontFamily: AppFonts.base.familyBold,
        fontSize: 12,
        lineHeight: 18,
    },
    newChip: { color: StyleService.select({ light: '$blue', dark: '#91AEFF' }) },
    connector: {
        textAlign: 'center',
        fontSize: 12,
        lineHeight: 18,
        color: '$textSecondary',
        paddingVertical: 8,
    },
    confirming: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 48,
        paddingVertical: 12,
    },
    confirmingText: {
        color: '$textPrimary',
        fontFamily: AppFonts.base.familyBold,
        fontSize: 14,
        lineHeight: 20,
        flexShrink: 1,
    },
    moreCue: {
        position: 'absolute',
        bottom: 6,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderRadius: 18,
        minHeight: 36,
        paddingHorizontal: 12,
        backgroundColor: StyleService.select({ light: '#FFFFFF', dark: '#1D1F2B' }),
        borderWidth: StyleService.hairlineWidth,
        borderColor: StyleService.select({ light: '#E7E9F1', dark: '#303346' }),
    },
    moreCueText: { color: '$textSecondary', fontFamily: AppFonts.base.familyBold, fontSize: 12, lineHeight: 18 },
    moreCueIcon: { tintColor: '$textSecondary' },
    instruction: {
        color: '$textSecondary',
        fontFamily: AppFonts.base.family,
        fontSize: 14,
        lineHeight: 22,
        marginTop: 12,
    },
});
// Resolve the living style references on every access so theme changes cannot freeze
// either the shared Identify styles or this screen's additions at their import-time values.
export default new Proxy(
    { ...identify, ...extra },
    {
        get: (_target, key) => (key in extra ? Reflect.get(extra, key) : Reflect.get(identify, key)),
    },
);
