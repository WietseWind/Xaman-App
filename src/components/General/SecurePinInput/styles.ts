import StyleService from '@services/StyleService';

import { AppFonts, AppSizes } from '@theme';
import { StyleSheet } from 'react-native';

/* Styles ==================================================================== */
const styles = StyleService.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    digits: {
        height: AppSizes.verticalScale(80),
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    digitsCondensed: {
        height: AppSizes.screen.height < 800
            ? AppSizes.verticalScale(50)
            : AppSizes.verticalScale(65),
    },
    keyboardWrapCondensed: {
        marginTop: AppSizes.screen.height < 800
            ? AppSizes.verticalScale(20)
            : AppSizes.verticalScale(50),
    },
    hiddenInput: {
        width: 1,
        height: 1,
        opacity: 0,
    },
    textInput: {
        fontSize: 0,
        paddingBottom: 0,
        paddingTop: 0,
        paddingLeft: 0,
        paddingRight: 0,
        textAlign: 'center',
    },
    pinStyle: {
        width: 18,
        height: 18,
        marginRight: 12,
        marginLeft: 12,
        borderRadius: 9,
        opacity: 0.3,
        backgroundColor: '$silver',
    },
    pinActiveStyle: {
        opacity: 1.0,
        backgroundColor: '$blue',
    },
    keyboardWrap: {
        width: AppSizes.screen.width,
        marginTop: AppSizes.verticalScale(50),
    },
    numWrap: {
        flexDirection: 'row',
        justifyContent: 'space-evenly',
    },
    line: {
        margin: 5,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 45,
        // backgroundColor: 'red',
        width: AppSizes.moderateScale(90),
        height: AppSizes.verticalScale(65),
    },
    numTextInt: {
        color: '$textPrimary',
        textAlign: 'center',
        fontFamily: AppFonts.base.family,
        fontSize: AppFonts.h3.size,
    },
    numTextAlpha: {
        fontSize: AppFonts.base.size * 0.65,
        textAlign: 'center',
        color: '$textPrimary',
        letterSpacing: 2,
    },
    bottomWrap: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    iconStyle: {
        tintColor: '$contrast',
    },
});

/** Preserve the existing intrinsic widget height in an inert normal-mode scroll wrapper. */
export const normalPinEntryHeight = () => {
    const digits = StyleSheet.flatten(styles.digits);
    const keyboard = StyleSheet.flatten(styles.keyboardWrap);
    const line = StyleSheet.flatten(styles.line);
    return Number(digits.height) + Number(keyboard.marginTop) +
        4 * (Number(line.height) + 2 * Number(line.margin));
};

export default styles;
