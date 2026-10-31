import StyleService from '@services/StyleService';
import AppFonts from '@theme/fonts';

const select = (light: string, dark: string) => StyleService.select({ light, dark });
const secondary = select('#636b86', '#a9afc6');

export default StyleService.create({
    container: { marginBottom: 25 },
    headingRow: { flexDirection: 'row', alignItems: 'center', minHeight: 40, marginBottom: 5 },
    closeButton: { minHeight: 44, width: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
    closeButtonIcon: { tintColor: secondary },
    titleText: { flex: 1, fontFamily: AppFonts.base.familyBold, fontSize: 14, lineHeight: 20, color: secondary },
    textMessage: { backgroundColor: select('#f3f4f8', '#242632'), borderRadius: 20, padding: 16 },
    messageText: { fontFamily: AppFonts.base.family, fontSize: 14, lineHeight: 21, color: secondary },
});
