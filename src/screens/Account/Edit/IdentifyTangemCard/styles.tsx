import StyleService from '@services/StyleService';

import { AppFonts, AppSizes } from '@theme';

const styles = StyleService.create({
    container: {
        flex: 1,
        flexDirection: 'column',
    },
    body: {
        flex: 1,
        paddingHorizontal: AppSizes.padding,
        paddingTop: AppSizes.padding,
    },
    explain: {
        fontFamily: AppFonts.base.family,
        fontSize: AppFonts.base.size,
        color: '$textPrimary',
        textAlign: 'center',
        lineHeight: AppFonts.base.size * 1.4,
    },
    resultBox: {
        borderWidth: 2,
        borderRadius: AppSizes.borderRadius,
        padding: AppSizes.paddingSml,
    },
    resultGreen: {
        backgroundColor: '$lightGreen',
        borderColor: '$green',
    },
    resultRed: {
        backgroundColor: '$lightRed',
        borderColor: '$red',
    },
    resultOrange: {
        backgroundColor: '$lightOrange',
        borderColor: '$orange',
    },
    resultTitle: {
        fontFamily: AppFonts.base.familyBold,
        fontSize: AppFonts.h5.size,
        textAlign: 'center',
    },
    textGreen: { color: '$green' },
    textRed: { color: '$red' },
    textOrange: { color: '$orange' },
    icon: {
        alignSelf: 'center',
    },
    iconGreen: { tintColor: '$green' },
    iconRed: { tintColor: '$red' },
    iconOrange: { tintColor: '$orange' },
    knownAccount: {
        marginTop: AppSizes.paddingSml,
    },
    accountCard: {
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '$background',
        borderWidth: 1,
        borderColor: '$lightGrey',
        paddingHorizontal: AppSizes.paddingExtraSml,
        paddingVertical: AppSizes.paddingExtraSml,
    },
});

export default styles;
