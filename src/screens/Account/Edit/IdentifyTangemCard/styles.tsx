import StyleService from '@services/StyleService';
import AppFonts from '@theme/fonts';

const tone = (light: string, dark: string) => StyleService.select({ light, dark });

const background = tone('#F8F9FC', '#12131B');
const surface = tone('#FFFFFF', '#1D1F2B');
const ink = tone('#191D39', '#F0F1FA');
const secondary = tone('#636981', '#A7ACC3');
const border = tone('#E7E9F1', '#303346');
const accent = '$blue';
const accentInk = '$white';

export default StyleService.create({
    container: { flex: 1, backgroundColor: background },
    header: { height: 48, marginTop: 0, paddingHorizontal: 14, backgroundColor: background },
    headerTitle: {
        fontFamily: AppFonts.base.familyBold,
        fontSize: 16,
        lineHeight: 22,
        color: ink,
    },
    headerIcon: { tintColor: ink },
    body: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 16 },
    scroll: { flex: 1 },
    bodyCompact: { paddingTop: 10, paddingBottom: 10 },
    cardGraphic: { alignSelf: 'center', width: 220, height: 140, maxWidth: '100%' },
    cardGraphicCompact: { height: 80, width: 160 },
    title: {
        fontFamily: AppFonts.base.familyBold,
        fontSize: 27,
        lineHeight: 32,
        color: ink,
        textAlign: 'center',
    },
    explain: {
        fontFamily: AppFonts.base.family,
        fontSize: 14,
        lineHeight: 21,
        color: secondary,
        textAlign: 'center',
    },
    sectionLabel: {
        fontFamily: AppFonts.base.familyBold,
        fontSize: 11,
        lineHeight: 16,
        letterSpacing: 1,
        color: secondary,
        textTransform: 'uppercase',
    },
    accountSection: { alignSelf: 'stretch' },
    accountCard: {
        borderRadius: 17,
        backgroundColor: surface,
        borderWidth: 1,
        borderColor: border,
        padding: 14,
    },
    accountIdentity: { flexDirection: 'row', alignItems: 'center' },
    accountText: { flex: 1, minWidth: 0, marginLeft: 12 },
    accountName: {
        fontFamily: AppFonts.base.familyBold,
        fontSize: 16,
        lineHeight: 21,
        color: ink,
    },
    address: {
        marginTop: 3,
        fontFamily: AppFonts.base.familyMono,
        fontSize: 12,
        lineHeight: 17,
        color: secondary,
        writingDirection: 'ltr',
    },
    serialSection: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginTop: 12,
        paddingTop: 10,
        borderTopWidth: StyleService.hairlineWidth,
        borderTopColor: border,
    },
    serialOnly: { flexDirection: 'row', alignItems: 'flex-start' },
    serialLabel: {
        fontFamily: AppFonts.base.family,
        fontSize: 12,
        lineHeight: 18,
        color: secondary,
        marginRight: 10,
        flexShrink: 1,
    },
    serial: {
        flex: 1,
        fontFamily: AppFonts.base.familyMono,
        fontSize: 12,
        lineHeight: 18,
        color: ink,
        writingDirection: 'ltr',
        textAlign: 'right',
    },
    hint: { flexDirection: 'row', alignItems: 'flex-start' },
    hintIcon: { tintColor: secondary },
    hintText: {
        flex: 1,
        marginLeft: 9,
        fontFamily: AppFonts.base.family,
        fontSize: 12,
        lineHeight: 18,
        color: secondary,
    },
    resultSymbol: {
        alignSelf: 'center',
        alignItems: 'center',
        justifyContent: 'center',
        width: 64,
        height: 64,
        borderRadius: 22,
        marginTop: 12,
    },
    resultGreen: { backgroundColor: tone('#EAF6EF', '#1B352C') },
    resultOrange: { backgroundColor: tone('#FCF2E4', '#3A2E22') },
    resultUnknown: { backgroundColor: tone('#FCEEF0', '#3D252E') },
    iconGreen: { tintColor: tone('#15754E', '#81D5AF') },
    iconOrange: { tintColor: tone('#8A591B', '#EDC180') },
    unknownIcon: { tintColor: tone('#B13B47', '#FFA7B1') },
    swapIcon: { transform: [{ rotate: '90deg' }] },
    footer: {
        width: '100%',
        padding: 0,
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 12,
        backgroundColor: background,
    },
    button: {
        minHeight: 48,
        height: 'auto',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: accent,
    },
    primaryButtonText: {
        fontFamily: AppFonts.base.familyBold,
        fontSize: 16,
        lineHeight: 22,
        paddingHorizontal: 0,
        color: accentInk,
    },
    buttonIcon: { tintColor: accentInk },
    secondaryButton: { backgroundColor: 'transparent', paddingVertical: 10 },
    secondaryButtonText: {
        fontFamily: AppFonts.base.familyBold,
        fontSize: 14,
        lineHeight: 20,
        paddingHorizontal: 0,
        color: secondary,
    },
});
