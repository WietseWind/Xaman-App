/**
 * A safe area on a side of the screen while the app is in portrait.
 *
 * On the iPhone Duo the status area and the tab bar are on the right side of the screen, and iOS gives that side a
 * safe area. Every screen of the app stays out of it: the screen is laid out in the rest of the width, as on a phone
 * of that width (AppSizes takes the same width for its sizes). The strip itself shows the background of the screen.
 *
 * The iPhone Duo can be opened while the app runs. The window is then about two times as wide. The app keeps the
 * layout of the cover screen: the screen stays a column of the same width beside the safe area (on the right half,
 * next to the tab bar), and the rest of the window, on the other side, shows the background. The column moves with
 * the window, so the app goes from the cover screen to the inner screen and back without a restart.
 *
 * A backdrop is the exception: the dim or blur of an overlay goes on to the edges of the window, under the safe
 * area and over the free part, as it covers the tab bar at the end of the screen on other phones. `SideSafeAreaFill`
 * and the `sideBleed` styles do that for an element; its content stays in the column.
 *
 * Every other phone has no safe area on a side. There this does nothing at all: the screen is registered as it is,
 * `SideSafeAreaFill` renders nothing and the `sideBleed` styles are undefined.
 */
import React, { Component, ComponentType } from 'react';
import { Animated, Dimensions, EmitterSubscription, StyleProp, View, ViewStyle } from 'react-native';

import { AppSizes } from '@theme';

/* Types ==================================================================== */
export type SideInsets = { left: number; right: number };

/* Constants ==================================================================== */
// what React and JavaScript give a class themselves: not copied to the wrapper
const OWN_STATICS = ['length', 'name', 'prototype', 'caller', 'callee', 'arguments', 'arity', 'displayName'];

// How far a backdrop goes on past the column on the side that can be free (the open phone). More than any window is
// wide: what is outside the window is not drawn.
const FREE_SIDE_REACH = 2000;

/* Helpers ==================================================================== */
/**
 * The part of a window that is free beside the column and the safe areas: 0 while the window is as wide as the
 * layout (the cover screen), the rest of the window when it is wider (the open phone).
 */
export const freeWidthFor = (windowWidth: number, insets: SideInsets, columnWidth?: number): number => {
    if (typeof columnWidth !== 'number' || !(columnWidth > 0) || !(windowWidth > 0)) {
        return 0;
    }
    const free = windowWidth - insets.left - insets.right - columnWidth;
    return free > 0 ? free : 0;
};

/**
 * The screen, kept out of the side insets. Without side insets: the screen itself.
 * The wrapper has the statics of the screen (react-native-navigation reads `options` and the screen name there).
 *
 * columnWidth: the width the screen is laid out for. When the window is wider than that and the insets, the column
 * stays beside the larger inset (the side of the tab bar) and the free part is on the other side.
 */
export const withSideInsets = <P extends object>(
    Screen: ComponentType<P>,
    insets: SideInsets,
    columnWidth?: number,
): ComponentType<P> => {
    const left = insets.left > 0 ? insets.left : 0;
    const right = insets.right > 0 ? insets.right : 0;
    if (left + right <= 0) {
        return Screen;
    }

    const freeNow = () => freeWidthFor(Dimensions.get('window').width, { left, right }, columnWidth);

    class SideSafeArea extends Component<P, { free: number }> {
        static displayName = `SideSafeArea(${Screen.displayName || Screen.name || 'Screen'})`;

        private dimensionsListener: EmitterSubscription | undefined;

        constructor(props: P) {
            super(props);
            this.state = { free: freeNow() };
        }

        componentDidMount() {
            this.dimensionsListener = Dimensions.addEventListener('change', this.onDimensionsChange);
            // the window can have changed between the first render and now
            this.onDimensionsChange();
        }

        componentWillUnmount() {
            this.dimensionsListener?.remove();
            this.dimensionsListener = undefined;
        }

        onDimensionsChange = () => {
            const free = freeNow();
            this.setState((state) => (state.free === free ? null : { free }));
        };

        render() {
            const { free } = this.state;
            // margin, not padding: the box of the wrapper itself is then the usable part of the screen, so a child
            // with an absolute position (an overlay that fills its parent) stays out of the side area too.
            // The free part of a wider window goes to the side with the smaller inset.
            const style: ViewStyle = {
                flex: 1,
                marginLeft: left + (right >= left ? free : 0),
                marginRight: right + (right >= left ? 0 : free),
            };
            // box-none: the strip takes no touch of its own (an overlay lets touches through where it shows nothing)
            return (
                <View style={style} pointerEvents="box-none">
                    {/* eslint-disable-next-line react/jsx-props-no-spreading */}
                    <Screen {...this.props} />
                </View>
            );
        }
    }

    Object.getOwnPropertyNames(Screen).forEach((name) => {
        if (OWN_STATICS.includes(name)) {
            return;
        }
        const descriptor = Object.getOwnPropertyDescriptor(Screen, name);
        if (descriptor) {
            Object.defineProperty(SideSafeArea, name, descriptor);
        }
    });

    return SideSafeArea;
};

// one wrapper for a screen, however often it is asked for
const wrapped = new WeakMap<object, ComponentType<any>>();

/**
 * The screen as the app registers it: out of the side safe area of this phone.
 */
export const withSideSafeArea = <P extends object>(Screen: ComponentType<P>): ComponentType<P> => {
    if (AppSizes.sideInsets <= 0) {
        return Screen;
    }
    const known = wrapped.get(Screen);
    if (known) {
        return known;
    }
    const made = withSideInsets(
        Screen,
        { left: AppSizes.leftInset, right: AppSizes.rightInset },
        AppSizes.screen.uncorrectedWidth,
    );
    wrapped.set(Screen, made);
    return made;
};

/* Backdrops ==================================================================== */
// How far a backdrop goes on past the column on each side: the safe area, and on the side that can be free (the one
// with the smaller safe area) as far as any window goes.
const reach = (): SideInsets | undefined => {
    const left = AppSizes.leftInset > 0 ? AppSizes.leftInset : 0;
    const right = AppSizes.rightInset > 0 ? AppSizes.rightInset : 0;
    if (left + right <= 0) {
        return undefined;
    }
    return right >= left ? { left: left + FREE_SIDE_REACH, right } : { left, right: right + FREE_SIDE_REACH };
};

const bleed = <T extends ViewStyle>(make: (left: number, right: number) => T): T | undefined => {
    const sides = reach();
    return sides ? make(sides.left, sides.right) : undefined;
};

/**
 * For an element that fills its parent with an absolute position and has no content of its own (a dim layer):
 * it goes on to the edges of the window. Undefined without a side safe area.
 */
export const sideBleedEdges = bleed((left, right) => ({ left: -left, right: -right }));

/**
 * For an element that fills the screen with an absolute position and has content (a blur with a dialog in it):
 * it goes on to the edges of the window, its content stays in the column. Undefined without a side safe area.
 */
export const sideBleedAbsolute = bleed((left, right) => ({
    left: -left,
    right: -right,
    width: left + AppSizes.screen.uncorrectedWidth + right,
    paddingLeft: left,
    paddingRight: right,
}));

/**
 * The same for an element in the normal flow that has no padding of its own. Undefined without a side safe area.
 */
export const sideBleedMargin = bleed((left, right) => ({
    marginLeft: -left,
    marginRight: -right,
    paddingLeft: left,
    paddingRight: right,
}));

const fill: ViewStyle = { position: 'absolute', top: 0, bottom: 0 };

/**
 * The window beside an element, filled in the style of that element (its animated dim colour). Put it in the
 * element that draws the backdrop. It takes the touches there, as the backdrop does: the tab bar under it is
 * covered. Renders nothing without a side safe area.
 */
export const SideSafeAreaFill = ({ style }: { style?: Animated.WithAnimatedValue<StyleProp<ViewStyle>> }) => {
    const sides = reach();
    if (!sides) {
        return null;
    }
    return (
        <>
            <Animated.View style={[fill, { left: -sides.left, width: sides.left }, style]} />
            <Animated.View style={[fill, { right: -sides.right, width: sides.right }, style]} />
        </>
    );
};
