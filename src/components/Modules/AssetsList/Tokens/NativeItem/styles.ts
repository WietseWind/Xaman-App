import StyleService from '@services/StyleService';

import { AppFonts, AppSizes } from '@theme';
/* Styles ==================================================================== */
export default StyleService.create({
    currencyItem: {
        justifyContent: 'space-between',
        // backgroundColor: '$lightBlue',
        borderRadius: 10,
        // paddingHorizontal: 5,
        // paddingVertical: 5,
        marginHorizontal: AppSizes.paddingSml,
        // borderColor: '$red',
        // borderWidth: 2,
    },
    balanceRow: {
        justifyContent: 'space-between',
        flexDirection: 'row',
    },
    reserveRow: {
        justifyContent: 'space-between',
        flexDirection: 'row',
        paddingTop: 2,
        paddingBottom: 5,
    },
    currencyItemLabel: {
        // fontSize: AppFonts.h5.size,
        // fontFamily: AppFonts.base.familyMonoBold,
        fontSize: AppFonts.subtext.size * 1.1,
        fontFamily: AppFonts.base.familyBold,
        color: StyleService.select({ light: '$dark', dark: '$white' }),
        alignItems: 'flex-start',
        justifyContent: 'center',
        marginRight: 10,
    },
    balanceText: {
        fontSize: AppFonts.subtext.size * 1.25,
        fontFamily: AppFonts.base.familyMonoBold,
        color: StyleService.select({ light: '$dark', dark: '$white' }),
        alignItems: 'flex-start',
        justifyContent: 'center',
        marginRight: 0,
    },
    tokenAvatarContainer: {
        marginRight: 10,
    },
    tokenIcon: {
        tintColor: StyleService.select({ light: '$dark', dark: '$white' }),
    },
    tokenIconContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        paddingRight: 10,
    },
    reserveCurrencyAvatarContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        paddingRight: 7,
    },
    reserveTextContainer: {
        flexDirection: 'column',
        justifyContent: 'center',
        paddingLeft: 10,
    },
    reserveTextLabel: {
        fontSize: AppFonts.small.size,
        fontFamily: AppFonts.base.family,
        color: '$grey',
    },
    reserveTextValue: {
        fontSize: AppFonts.small.size,
        fontFamily: AppFonts.base.familyMonoBold,
        color: '$grey',
        // marginRight: 5,
    },
    reserveInfoIconContainer: {
        paddingLeft: AppSizes.scale(14),
        paddingRight: AppSizes.scale(13),
        backgroundColor: '$light',
        borderRadius: 10,
        paddingVertical: 5,
        marginTop: 2,
    },
    fiatAmountText: {
        fontSize: AppFonts.subtext.size,
        fontFamily: AppFonts.base.familyMonoBold,
        color: StyleService.select({ light: '$blue', dark: '$white' }),
        // marginRight: 5,
    },
    rightContainer: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
});
