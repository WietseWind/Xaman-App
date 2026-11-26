/**
 * App Theme - Sizes
 */

import { Dimensions, Platform, PixelRatio } from 'react-native';

import { GetLayoutInsets } from '@common/helpers/device';

const { height: screenHeight, width: screenWidth } = Dimensions.get('screen');
const { width: windowWidth, height: windowHeight } = Dimensions.get('window');

const { bottom: bottomInset, top: topInset, left: leftInset, right: rightInset } = GetLayoutInsets();

// A safe area on a side of the screen in portrait (iPhone Duo: the status area and the tab bar are on the right).
// Content stays out of it: every screen is padded by it (common/helpers/sideSafeArea.tsx), and `width`, with all
// that is made from it below, is the width that is left. The app then lays out as on a phone of that width.
// On every other phone both insets are 0 and `width` is the window width, as it always was.
//
// Such a phone can also be open (iPhone Duo unfolded): the window is then about two times as wide as the cover
// screen, which stays the `screen` of the device. The app keeps the layout of the cover screen there, in a column of
// that width beside the safe area (sideSafeArea.tsx puts it there), so it is the same app, folded or not.
const sideInsets = leftInset + rightInset;
const layoutWindowWidth = sideInsets > 0 && screenWidth > 0 ? Math.min(windowWidth, screenWidth) : windowWidth;
const width = layoutWindowWidth - sideInsets;
// The height of that layout: the window, but not more than the screen of the device. On the open phone turned a
// quarter the window is much higher than the cover screen; the app stays a box of the cover layout there.
// The window height on every other phone, as it always was.
const height = sideInsets > 0 && screenHeight > 0 ? Math.min(windowHeight, screenHeight) : windowHeight;

// Guideline sizes are based on standard ~5" screen mobile device
const guidelineBaseWidth = 350;
const guidelineBaseHeight = 680;

const isSmallDevice = width <= 375;

const xyFactor = width / height;
const isSquareScreen = xyFactor > 0.85; // Fixes fold devices
const altScreenDimensionsCorrectionFactor = isSquareScreen // Fixes fold devices
    ? 2
    : 1;

// bottomTabs height
const tabbarHeight = Platform.select({
    ios: bottomInset + 50,
    android: 60,
    default: 0,
});

// status bar size. iOS always has at least the classic 20pt bar; DeviceUtils
// can report 0 when keyWindow is nil at JS module init.
const statusBarHeight = topInset > 0 ? topInset : Platform.OS === 'ios' ? 20 : 0;

// in some android devices the screen goes under navigation bar
// this help's us to add extra padding if necessary
let safeAreaBottomInset = 0;
if (Platform.OS === 'android') {
    // Edge-to-edge: window height matches screen. Use the stored nav-bar inset.
    safeAreaBottomInset = bottomInset > 0 ? bottomInset : 0;
} else if (Platform.OS === 'ios') {
    safeAreaBottomInset = bottomInset;
}

let safeAreaTopInset = 0;
if (Platform.OS === 'ios' || Platform.OS === 'android') {
    safeAreaTopInset = statusBarHeight;
}

const Sizes = {
    // Screen Dimensions
    screen: {
        height,
        width: width / altScreenDimensionsCorrectionFactor, // Fixes fold devices
        uncorrectedWidth: width,
        // the whole window, with a safe area on a side
        windowWidth,

        screenHeight,

        heightHalf: height * 0.5,
        heightThird: height * 0.333,
        heightTwoThirds: height * 0.666,
        heightQuarter: height * 0.25,
        heightThreeQuarters: height * 0.75,

        widthHalf: width * 0.5,
        widthThird: width * 0.333,
        widthTwoThirds: width * 0.666,
        widthQuarter: width * 0.25,
        widthThreeQuarters: width * 0.75,
        isSmallDevice,
    },
    statusBarHeight,
    tabbarHeight,

    bottomInset,
    topInset,

    // a safe area on a side of the screen in portrait: 0 on every phone but one with a system part on a side
    leftInset,
    rightInset,
    sideInsets,

    safeAreaBottomInset,
    safeAreaTopInset,

    padding: 30,
    paddingSml: 20,
    paddingMid: 15,
    paddingExtraSml: 10,

    paddingList: 20,

    borderRadius: 8,

    extraKeyBoardPadding: 20,

    scale: (size: number) => ((width / guidelineBaseWidth) * size) / altScreenDimensionsCorrectionFactor,
    verticalScale: (size: number) => (height / guidelineBaseHeight) * size,
    moderateScale: (size: number, factor = 0.5) => size + (Sizes.scale(size) - size) * factor,

    widthPercentageToDP: (widthPercent: number) => PixelRatio.roundToNearestPixel((width * widthPercent) / 100),
    heightPercentageToDP: (heightPercent: number) => PixelRatio.roundToNearestPixel((height * heightPercent) / 100),
};

export default Sizes;
