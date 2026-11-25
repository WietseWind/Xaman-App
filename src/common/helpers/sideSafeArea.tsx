/**
 * A safe area on a side of the screen while the app is in portrait.
 *
 * On the iPhone Duo the status area and the tab bar are in a column on a side of the screen, and iOS gives that side
 * a safe area. Every screen of the app stays out of it: the screen is laid out in the rest of the width, as on a
 * phone of that width (AppSizes takes the same width for its sizes). The strip itself shows the background.
 *
 * That phone changes while the app runs:
 * - closed (the cover screen): the column is on the right.
 * - open: the window is about two times as wide, the column is still on the right. The app keeps the layout of the
 *   cover screen: the screen stays a column of that width beside the bar, the other half shows the background.
 * - open, the app in one half of the screen (split view): the window is as wide as the cover screen again, and the
 *   tab bar can be on the other edge. It is then in the safe area of a tab only, not in that of the window.
 * So the place of the column comes from a native view that tells its own safe area, its width and the edge of the
 * bar each time they change (SideSafeAreaView in DeviceUtils.m). The screen is not made again when they do.
 *
 * A backdrop is the exception: the dim or blur of an overlay goes on to the edges of the window, under the safe
 * area and over the free part, as it covers the tab bar at the end of the screen on other phones. `SideSafeAreaFill`
 * and the `sideBleed` styles do that for an element; its content stays in the column.
 *
 * Every other phone has no safe area on a side. There this does nothing at all: the screen is registered as it is,
 * `SideSafeAreaFill` renders nothing and the `sideBleed` styles are undefined.
 */
import React, { Component, ComponentType } from 'react';
import {
    Animated,
    Dimensions,
    HostComponent,
    I18nManager,
    Platform,
    requireNativeComponent,
    StyleProp,
    View,
    ViewProps,
    ViewStyle,
} from 'react-native';

import { AppSizes } from '@theme';

import { GetVerticalBarEdge } from './device';

/* Types ==================================================================== */
export type SideInsets = { left: number; right: number };

// What the native view tells: its safe area on the sides, its width, and the edge of the vertical bar
// (0 unknown, 1 leading, 2 trailing).
export type SideSafeAreaState = { left: number; right: number; width: number; edge: number };

type NativeProps = ViewProps & {
    onSideSafeAreaChange?: (event: { nativeEvent: SideSafeAreaState }) => void;
};

/* Constants ==================================================================== */
// What JavaScript gives a class itself, and what React reads from a component class: not copied to the wrapper.
// The React ones stay with the screen, where they still work (default props, an error boundary: a wrapper that
// took `getDerivedStateFromError` over would catch the errors of the screen itself).
const OWN_STATICS = [
    'length',
    'name',
    'prototype',
    'caller',
    'callee',
    'arguments',
    'arity',
    'displayName',
    'childContextTypes',
    'contextType',
    'contextTypes',
    'defaultProps',
    'getDefaultProps',
    'getDerivedStateFromError',
    'getDerivedStateFromProps',
    'mixins',
    'propTypes',
    'type',
];

// How far a backdrop goes on past the column on each side. More than any window is wide: what is outside the window
// is not drawn.
const FREE_SIDE_REACH = 2000;

const FLEX: ViewStyle = { flex: 1 };

/* Helpers ==================================================================== */
const positive = (value: unknown): number => {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
};

/**
 * The margins that put the screen in its column.
 *
 * now: what the view has at this moment. insets: the safe area the app started with (the column of the bar is in
 * it); when the view itself has less (an overlay or a modal while the app is in one half of the screen), the
 * column of the bar is still kept free, on the edge of the bar. columnWidth: the width the screen is laid out for;
 * what the view has more than that is free, on the side away from the bar.
 */
export const sideMarginsFor = (
    now: SideSafeAreaState,
    insets: SideInsets,
    columnWidth?: number,
    rtl = false,
): { marginLeft: number; marginRight: number } => {
    let left = positive(now.left);
    let right = positive(now.right);
    const reserve = positive(insets.left) + positive(insets.right);

    // the side of the bar: told by iOS, else the side with the larger safe area
    let barOnLeft: boolean;
    if (now.edge === 1 || now.edge === 2) {
        barOnLeft = (now.edge === 1) !== rtl;
    } else if (left !== right) {
        barOnLeft = left > right;
    } else {
        barOnLeft = positive(insets.left) > positive(insets.right);
    }

    if (left + right < reserve) {
        if (barOnLeft) {
            left = reserve - right;
        } else {
            right = reserve - left;
        }
    }

    const column = positive(columnWidth);
    const free = column > 0 ? positive(positive(now.width) - left - right - column) : 0;

    return {
        marginLeft: left + (barOnLeft ? 0 : free),
        marginRight: right + (barOnLeft ? free : 0),
    };
};

// The native view, asked for once: React Native takes a view name one time only. Kept on the global object, so a
// Fast Refresh of this file (development) does not ask again.
const NATIVE_VIEW_KEY = '__xamanSideSafeAreaView';
const getNativeView = (): HostComponent<NativeProps> => {
    const store = globalThis as unknown as Record<string, HostComponent<NativeProps> | undefined>;
    if (!store[NATIVE_VIEW_KEY]) {
        store[NATIVE_VIEW_KEY] = requireNativeComponent<NativeProps>('SideSafeAreaView');
    }
    return store[NATIVE_VIEW_KEY] as HostComponent<NativeProps>;
};

/**
 * The screen, kept out of the side insets. Without side insets: the screen itself.
 * The wrapper has the statics of the screen (react-native-navigation reads `options` and the screen name there).
 *
 * columnWidth: the width the screen is laid out for (see sideMarginsFor).
 */
export const withSideInsets = <P extends object>(
    Screen: ComponentType<P>,
    insets: SideInsets,
    columnWidth?: number,
): ComponentType<P> => {
    const start: SideInsets = { left: positive(insets.left), right: positive(insets.right) };
    if (start.left + start.right <= 0) {
        return Screen;
    }

    // the live values come from the native view, which only iOS has
    const live = Platform.OS === 'ios';

    class SideSafeArea extends Component<P, SideSafeAreaState> {
        static displayName = `SideSafeArea(${Screen.displayName || Screen.name || 'Screen'})`;

        constructor(props: P) {
            super(props);
            // until the native view tells: what the app started with
            this.state = {
                left: start.left,
                right: start.right,
                width: Dimensions.get('window').width,
                edge: GetVerticalBarEdge(),
            };
        }

        onSideSafeAreaChange = (event: { nativeEvent: SideSafeAreaState }) => {
            const { left, right, width, edge } = event?.nativeEvent || ({} as SideSafeAreaState);
            if (!(width > 0)) {
                return;
            }
            this.setState((state) =>
                state.left === left && state.right === right && state.width === width && state.edge === edge
                    ? null
                    : { left: positive(left), right: positive(right), width, edge },
            );
        };

        render() {
            // margin, not padding: the box of the column itself is then the usable part of the screen, so a child
            // with an absolute position (an overlay that fills its parent) stays out of the side area too.
            // box-none: the strips take no touch of their own (an overlay lets touches through where it shows nothing)
            const margins = sideMarginsFor(this.state, start, columnWidth, I18nManager.isRTL);
            const column = (
                <View style={[FLEX, margins]} pointerEvents="box-none">
                    {/* eslint-disable-next-line react/jsx-props-no-spreading */}
                    <Screen {...this.props} />
                </View>
            );
            if (!live) {
                return column;
            }
            const NativeSideSafeArea = getNativeView();
            return (
                <NativeSideSafeArea
                    style={FLEX}
                    pointerEvents="box-none"
                    onSideSafeAreaChange={this.onSideSafeAreaChange}
                >
                    {column}
                </NativeSideSafeArea>
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
// How far a backdrop goes on past the column on each side: farther than any window. The column can be on either side
// (the bar changes its edge when the app is in one half of the screen), so both sides get the same.
const reach = (): SideInsets | undefined => {
    return AppSizes.sideInsets > 0 ? { left: FREE_SIDE_REACH, right: FREE_SIDE_REACH } : undefined;
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
