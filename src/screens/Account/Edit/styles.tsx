import StyleService from '@services/StyleService';
import { AppFonts } from '@theme';

export default StyleService.create({
    container: { flex: 1, backgroundColor: '$background' },
    identity: { padding: 17, marginBottom: 22, backgroundColor: '$tint', borderRadius: 16 },
    accountName: {
        fontFamily: AppFonts.base.familyExtraBold,
        fontSize: AppFonts.h5.size,
        color: '$textPrimary',
    },
    addressLabel: {
        fontFamily: AppFonts.base.family,
        fontSize: AppFonts.small.size,
        color: '$textSecondary',
        marginTop: 12,
    },
    address: {
        fontFamily: AppFonts.base.familyMono,
        fontSize: AppFonts.small.size,
        color: '$textSecondary',
        marginTop: 4,
        writingDirection: 'ltr',
    },
    cardRow: { padding: 15 },
    cardIdLabel: {
        fontFamily: AppFonts.base.family,
        fontSize: AppFonts.small.size,
        color: '$textSecondary',
        marginBottom: 10,
    },
    cardControls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
    cardControlsStacked: { flexDirection: 'column', alignItems: 'flex-start' },
    cardDetailValue: {
        flexGrow: 1,
        flexShrink: 1,
        fontFamily: AppFonts.base.familyMono,
        fontSize: AppFonts.small.size,
        color: '$textPrimary',
        writingDirection: 'ltr',
        paddingVertical: 8,
        marginRight: 10,
    },
    identifyButton: { height: 'auto', minHeight: 44, paddingVertical: 9, marginVertical: 2 },
    cardDetailValueStacked: { alignSelf: 'stretch', flexGrow: 0, flexShrink: 0, marginRight: 0, marginBottom: 6 },
    inlineLoader: { marginRight: 10 },
    removeButton: {
        height: 'auto',
        backgroundColor: '$tint',
        minHeight: 50,
        paddingVertical: 14,
        borderRadius: 13,
        marginTop: 8,
        marginBottom: 12,
    },
    removeText: { color: '$red', fontSize: AppFonts.base.size },
    removeIcon: { tintColor: '$red' },
});
