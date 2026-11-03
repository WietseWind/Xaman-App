import StyleService from '@services/StyleService';
import { AppFonts } from '@theme';

export default StyleService.create({
    container: { flex: 1, backgroundColor: '$background' },
    value: {
        fontFamily: AppFonts.base.family,
        fontSize: AppFonts.base.size,
        color: '$textSecondary',
        textAlign: 'right',
    },
    identifier: {
        fontFamily: AppFonts.base.familyMono,
        fontSize: AppFonts.small.size,
        writingDirection: 'ltr',
    },
});
