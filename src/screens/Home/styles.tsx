import StyleService from '@services/StyleService';

import { AppSizes, AppFonts, AppColors } from '@theme';
import { ColorLuminance } from '@common/utils/color';

/* Styles ==================================================================== */
const styles = StyleService.create({
    headerContainer: {
        backgroundColor: '$transparent',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        height: AppSizes.moderateScale(60),
        paddingRight: AppSizes.paddingSml,
        paddingLeft: AppSizes.paddingSml,
        marginTop: -7,
        marginBottom: -7,
    },
    backgroundShapeOpacity: {
        opacity: 0.4,
    },
    hideTopElements: {
    },
    degenWarning: {
        paddingVertical: 7,
        paddingHorizontal: 10, 
        paddingLeft: 13,
        marginBottom: 6,
        borderRadius: 11,
        backgroundColor: '$lightRed',
        borderColor: '$red',
        // borderWidth: 2,
    },
    backUpButton: {
        borderRadius: 7,
        paddingHorizontal: 12,
        marginLeft: 10,
        // borderColor: '$white',
        height: '100%',
    },
    degenWarningText: {
        color: '$red',
        fontWeight: 'bold',
        fontSize: 13,
        paddingVertical: 2,
        lineHeight: 15,
    },
    monetizationContainer: {
        marginHorizontal: AppSizes.paddingSml,
        marginBottom: AppSizes.paddingExtraSml,
    },
    tokenListContainer: {
        flex: 6,
        marginTop: -4,
        // borderWidth: 1,
        // borderColor: '$red',
    },
    iconRotateX: {
        transform: [{ rotateX: '180deg' }],
    },
    iconRotateY: {
        transform: [{ rotateY: '180deg' }],
    },
    logo: {
        width: AppSizes.scale(120),
        height: AppSizes.scale(30),
        resizeMode: 'contain',
    },
    buttonRow: {
        flexDirection: 'row',
        marginBottom: 15,
        marginTop: 15,
        marginHorizontal: AppSizes.paddingSml - 4,
    },
    // SEND BUTTON
    sendButtonContainer: {
        backgroundColor: '$blue',
        marginHorizontal: 4,
    },
    // SEND BUTTON
    swapButtonContainer: {
        backgroundColor: '$darkBlue',
        marginHorizontal: 4,
    },
    sendButtonIcon: { tintColor: '$white', marginRight: -3 },
    sendButtonText: { fontSize: AppFonts.base.size, color: '$white' },

    // REQUEST BUTTON
    requestButtonContainer: {
        marginHorizontal: 4,
        backgroundColor: '$green',
    },

    requestButtonIcon: { tintColor: '$white', marginRight: -3 },
    requestButtonText: { fontSize: AppFonts.base.size, color: '$white' },

    requestButtonContainerClean: {
        marginLeft: 15,
        backgroundColor: '$tint',
    },
    requestButtonIconClean: { tintColor: '$textPrimary' },
    requestButtonTextClean: { fontSize: AppFonts.base.size, color: '$textPrimary' },

    QRButtonText: { fontSize: AppFonts.base.size },

    networkDetailsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 16,
        marginTop: -8,
        paddingHorizontal: 9,
        marginHorizontal: AppSizes.paddingSml,
        marginBottom: AppSizes.paddingExtraSml,
    },
    networkStatusIndicator: {
        width: 7.5,
        height: 7.5,
        borderRadius: 3.75,
    },
    networkConnected: {
        backgroundColor: StyleService.select({ light: '$darkGreen', dark: '$green' }),
    },
    networkConnecting: {
        width: 8.8,
        height: 8.8,
        borderRadius: 4.4,
        borderWidth: 1.65,
        borderColor: StyleService.select({ light: ColorLuminance(AppColors.orange, -0.4), dark: '$orange' }),
        borderRightColor: '$transparent',
    },
    networkDisconnected: {
        borderRadius: 1.1,
        backgroundColor: StyleService.select({ light: '$darkRed', dark: '$red' }),
        transform: [{ rotate: '45deg' }],
    },
    networkTextLabel: {
        color: '$textSecondary',
        fontFamily: AppFonts.base.family,
        fontSize: 13.75,
        lineHeight: 16,
        includeFontPadding: false,
        maxWidth: '40%',
        flexShrink: 1,
    },
    networkTextContent: {
        color: '$textSecondary',
        fontFamily: AppFonts.base.familyMono,
        fontSize: 13.75,
        lineHeight: 16,
        includeFontPadding: false,
        flex: 1,
        marginLeft: 7,
        marginRight: 8,
    },
    accountSwitchConainer: {
        backgroundColor: '$tint',
        marginHorizontal: AppSizes.paddingSml,
        paddingTop: 7,
        paddingBottom: 4,
        paddingLeft: 10,
        paddingRight: 6,
        borderRadius: 11,
    },
    accountSwitchElement: {
        marginHorizontal: 0,
    },
});

export default styles;
