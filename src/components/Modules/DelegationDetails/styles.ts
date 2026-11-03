import StyleService from '@services/StyleService';
import { AppFonts } from '@theme';

export default StyleService.create({
    label: { color: '$textSecondary', fontFamily: AppFonts.base.familyBold, marginTop: 15, marginBottom: 8 },
    value: { color: '$textPrimary', fontFamily: AppFonts.base.family, marginVertical: 8, lineHeight: 22 },
    account: { paddingVertical: 8 },
    permission: { padding: 14, marginVertical: 8, borderRadius: 8, backgroundColor: '$tint' },
    heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    icon: { tintColor: '$textPrimary' },
    title: { color: '$textPrimary', fontFamily: AppFonts.base.familyBold, flexShrink: 1 },
    protocolName: { color: '$textSecondary', fontFamily: AppFonts.base.familyMono, marginTop: 6 },
});
