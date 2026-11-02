import StyleService from '@services/StyleService';
import AppFonts from '@theme/fonts';
import identify from '../IdentifyTangemCard/styles';

const extra = StyleService.create({
    artwork: { height: 150, width: 280, maxWidth: '100%', alignSelf: 'center' },
    blueCard: { position: 'absolute', left: 0, top: 0, width: 195, height: 135 },
    goldCard: { position: 'absolute', right: 0, top: 22, width: 195, height: 135 },
    faded: { opacity: 0.3 },
    front: { zIndex: 1 },
    progress: { marginBottom: 18 },
    progressTrack: { height: 4, borderRadius: 2, backgroundColor: '$lightBlue', marginTop: 7 },
    progressFill: { height: 4, borderRadius: 2, backgroundColor: '$blue' },
    stepText: { fontFamily: AppFonts.base.familyBold, fontSize: 12, lineHeight: 18, color: '$textSecondary' },
    gap: { marginTop: 16 },
    chip: {
        color: StyleService.select({ light: '#15754E', dark: '#81D5AF' }),
        fontFamily: AppFonts.base.familyBold,
        fontSize: 12,
        lineHeight: 18,
        marginBottom: 6,
    },
    newChip: { color: StyleService.select({ light: '$blue', dark: '#91AEFF' }) },
    redError: { backgroundColor: '$lightRed' },
    connector: {
        textAlign: 'center',
        fontSize: 12,
        lineHeight: 18,
        color: '$textSecondary',
        paddingVertical: 10,
    },
    error: { backgroundColor: '$lightOrange', borderRadius: 14, padding: 14, marginVertical: 12 },
    errorText: { color: '$textPrimary', fontFamily: AppFonts.base.family, fontSize: 14, lineHeight: 21 },
    fee: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 14, gap: 8 },
    footerFee: {
        alignSelf: 'stretch',
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 8,
        paddingBottom: 12,
    },
    feeLabel: { color: '$textSecondary', fontFamily: AppFonts.base.family, fontSize: 12, lineHeight: 18 },
    feeValue: { color: '$textPrimary', fontFamily: AppFonts.base.familyBold, fontSize: 12, lineHeight: 18 },
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
export default new Proxy({ ...identify, ...extra }, {
    get: (_target, key) => key in extra ? Reflect.get(extra, key) : Reflect.get(identify, key),
});
