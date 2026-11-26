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
 * - open and turned a quarter: the window is higher and wider than the cover screen, there is no column, and the tab
 *   bar is a normal one at the end of the screen. The app stays a box of the cover layout in the middle of the window.
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
import React, { Component, ComponentType, createContext } from 'react';
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

// the one file, not the index of the components: those use this helper
import FoldPhoneExtraPanel from '@components/General/FoldPhoneExtraPanel/FoldPhoneExtraPanel';

import { GetVerticalBarEdge } from './device';
import { FoldPhone, FoldPhoneState, foldPhoneStateFor } from './foldPhone';

/* Types ==================================================================== */
export type SideInsets = { left: number; right: number };

// What the native view tells: its safe area on the sides, its width and height, and the edge of the vertical bar
// (0 none, 1 leading, 2 trailing).
export type SideSafeAreaState = { left: number; right: number; width: number; height?: number; edge: number };

// The size the screen is laid out for (AppSizes).
export type LayoutSize = { width?: number; height?: number };

type ColumnStyle = { marginLeft: number; marginRight: number; flex?: number; height?: number; marginTop?: number };

// What a screen can know about the window around its box. below: the height of the window under the box; more than
// 0 only when the box does not reach the end of the window (the open phone turned a quarter). A panel that comes up
// from the end of the screen moves down by it, so it starts at the end of the window, as on every phone.
export type SideSafeAreaSurround = { below: number };

const NO_SURROUND: SideSafeAreaSurround = { below: 0 };

export const SideSafeAreaContext = createContext<SideSafeAreaSurround>(NO_SURROUND);

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

// A window that is this much higher than the layout is the open phone turned a quarter (951 against 678). The cover
// screen and the open phone differ by 9.
const HIGHER_WINDOW = 40;

// The column is put in the middle only when the window has this much more room than the column and the bar need.
const CENTRE_MARGIN = 20;

const FLEX: ViewStyle = { flex: 1 };

const FREE_HALF: ViewStyle = { position: 'absolute' };

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
 * No bar on a side and no side safe area (the open phone turned a quarter): the column is in the middle.
 */
export const sideMarginsFor = (
    now: SideSafeAreaState,
    insets: SideInsets,
    columnWidth?: number,
    rtl = false,
): { marginLeft: number; marginRight: number } => {
    let left = positive(now.left);
    let right = positive(now.right);
    const column = positive(columnWidth);
    const reserve = positive(insets.left) + positive(insets.right);

    // No bar on a side, no side safe area, and clearly more room than the column and the column of the bar take:
    // the open phone turned a quarter. (Without that last check the cover screen would be taken for it in the
    // moment before the native view tells the edge.)
    if (now.edge !== 1 && now.edge !== 2 && left + right <= 0 && column > 0) {
        const free = positive(now.width) - column;
        if (free > reserve + CENTRE_MARGIN) {
            return { marginLeft: free / 2, marginRight: free / 2 };
        }
    }

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

    const free = column > 0 ? positive(positive(now.width) - left - right - column) : 0;

    return {
        marginLeft: left + (barOnLeft ? 0 : free),
        marginRight: right + (barOnLeft ? free : 0),
    };
};

/**
 * The style of the box the screen is in: the column (sideMarginsFor), over the whole height of the window. When
 * the window is much higher than the layout (the open phone turned a quarter), the box has the height of the layout
 * and is in the middle of the window: the sizes of the app are made for that height.
 */
export const columnStyleFor = (
    now: SideSafeAreaState,
    insets: SideInsets,
    layout: LayoutSize = {},
    rtl = false,
): ColumnStyle => {
    const margins = sideMarginsFor(now, insets, layout.width, rtl);
    const layoutHeight = positive(layout.height);
    const over = positive(now.height) - layoutHeight;
    if (layoutHeight > 0 && over > HIGHER_WINDOW) {
        return { ...margins, height: layoutHeight, marginTop: over / 2 };
    }
    return { ...margins, flex: 1 };
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
 * layout: the size the screen is laid out for (see sideMarginsFor and columnStyleFor); a number is the width.
 * startEdge: the edge of the vertical bar when the app started (0: none at that moment).
 */
export const withSideInsets = <P extends object>(
    Screen: ComponentType<P>,
    insets: SideInsets,
    layoutSize?: LayoutSize | number,
    startEdge: number = GetVerticalBarEdge(),
): ComponentType<P> => {
    const layout: LayoutSize = typeof layoutSize === 'number' ? { width: layoutSize } : layoutSize || {};
    const start: SideInsets = { left: positive(insets.left), right: positive(insets.right) };
    if (start.left + start.right <= 0) {
        return Screen;
    }

    // the live values come from the native view, which only iOS has
    const live = Platform.OS === 'ios';

    class SideSafeArea extends Component<P, SideSafeAreaState> {
        static displayName = `SideSafeArea(${Screen.displayName || Screen.name || 'Screen'})`;

        private surround: SideSafeAreaSurround = NO_SURROUND;

        private fold: FoldPhoneState | undefined;

        componentDidMount() {
            this.tellFoldPhone();
        }

        componentDidUpdate() {
            this.tellFoldPhone();
        }

        // the state of the phone, for code that follows it (common/helpers/foldPhone.ts)
        tellFoldPhone = () => {
            if (this.fold) {
                FoldPhone.update(this.fold);
            }
        };

        constructor(props: P) {
            super(props);
            // until the native view tells: what the app started with. No bar on a side at that moment (the open
            // phone turned a quarter): no side safe area either.
            const edge = startEdge === 1 || startEdge === 2 ? startEdge : 0;
            const { width, height } = Dimensions.get('window');
            const known = edge !== 0 || !live;
            this.state = { left: known ? start.left : 0, right: known ? start.right : 0, width, height, edge };
        }

        onSideSafeAreaChange = (event: { nativeEvent: SideSafeAreaState }) => {
            const { left, right, width, height, edge } = event?.nativeEvent || ({} as SideSafeAreaState);
            if (!(width > 0)) {
                return;
            }
            this.setState((state) =>
                state.left === left &&
                state.right === right &&
                state.width === width &&
                state.height === height &&
                state.edge === edge
                    ? null
                    : { left: positive(left), right: positive(right), width, height, edge },
            );
        };

        render() {
            const { width, height } = this.state;
            // margin, not padding: the box of the column itself is then the usable part of the screen, so a child
            // with an absolute position (an overlay that fills its parent) stays out of the side area too.
            // box-none: the strips take no touch of their own (an overlay lets touches through where it shows nothing)
            const box = columnStyleFor(this.state, start, layout, I18nManager.isRTL);
            const below =
                typeof box.height === 'number' ? positive(positive(height) - box.height - positive(box.marginTop)) : 0;
            if (this.surround.below !== below) {
                this.surround = below > 0 ? { below } : NO_SURROUND;
            }
            const column = (
                <View style={box} pointerEvents="box-none">
                    <SideSafeAreaContext.Provider value={this.surround}>
                        {/* eslint-disable-next-line react/jsx-props-no-spreading */}
                        <Screen {...this.props} />
                    </SideSafeAreaContext.Provider>
                </View>
            );
            if (!live) {
                return column;
            }

            // where the app is in the window, and what is free beside it
            const windowHeight = positive(height);
            const boxTop = positive(box.marginTop);
            const boxHeight = typeof box.height === 'number' ? box.height : windowHeight;
            const appWidth = positive(positive(width) - box.marginLeft - box.marginRight);
            this.fold = foldPhoneStateFor(
                { width: positive(width), height: windowHeight },
                { left: box.marginLeft, top: boxTop, width: appWidth, height: boxHeight },
                Dimensions.get('screen').width,
            );
            // The free part of the open phone: its own component (the extra panel), beside each screen. An overlay
            // has none: its backdrop is over the whole window.
            const { free } = this.fold;
            const isOverlay = (this.props as { componentType?: string }).componentType === 'OVERLAY';
            const freeHalf =
                free && free.width > 0 && !isOverlay ? (
                    <View style={[FREE_HALF, free]} pointerEvents="box-none">
                        <FoldPhoneExtraPanel
                            width={free.width}
                            height={free.height}
                            side={free.left <= 0 ? 'left' : 'right'}
                            screen={(Screen as { screenName?: string }).screenName}
                        />
                    </View>
                ) : null;

            const NativeSideSafeArea = getNativeView();
            return (
                <NativeSideSafeArea
                    style={FLEX}
                    pointerEvents="box-none"
                    onSideSafeAreaChange={this.onSideSafeAreaChange}
                >
                    {freeHalf}
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
        { width: AppSizes.screen.uncorrectedWidth, height: AppSizes.screen.height },
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
export const sideBleedEdges = bleed((left, right) => ({
    left: -left,
    right: -right,
    top: -FREE_SIDE_REACH,
    bottom: -FREE_SIDE_REACH,
}));

/**
 * For an element that fills the screen with an absolute position and has content (a blur with a dialog in it):
 * it goes on to the edges of the window, its content stays in the box of the screen. Undefined without a side
 * safe area.
 */
export const sideBleedAbsolute = bleed((left, right) => ({
    left: -left,
    right: -right,
    top: -FREE_SIDE_REACH,
    bottom: -FREE_SIDE_REACH,
    width: left + AppSizes.screen.uncorrectedWidth + right,
    height: FREE_SIDE_REACH + AppSizes.screen.height + FREE_SIDE_REACH,
    paddingLeft: left,
    paddingRight: right,
    paddingTop: FREE_SIDE_REACH,
    paddingBottom: FREE_SIDE_REACH,
}));

/**
 * The same for an element in the normal flow that has no padding of its own. Undefined without a side safe area.
 */
export const sideBleedMargin = bleed((left, right) => ({
    marginLeft: -left,
    marginRight: -right,
    marginTop: -FREE_SIDE_REACH,
    marginBottom: -FREE_SIDE_REACH,
    paddingLeft: left,
    paddingRight: right,
    paddingTop: FREE_SIDE_REACH,
    paddingBottom: FREE_SIDE_REACH,
}));

/**
 * The window around an element, filled in the style of that element (its animated dim colour). Put it in the
 * element that draws the backdrop. It takes the touches there, as the backdrop does: the tab bar under it is
 * covered. Renders nothing without a side safe area.
 */
export const SideSafeAreaFill = ({ style }: { style?: Animated.WithAnimatedValue<StyleProp<ViewStyle>> }) => {
    const sides = reach();
    if (!sides) {
        return null;
    }
    const R = FREE_SIDE_REACH;
    const strips: ViewStyle[] = [
        { position: 'absolute', top: -R, bottom: -R, left: -sides.left, width: sides.left },
        { position: 'absolute', top: -R, bottom: -R, right: -sides.right, width: sides.right },
        { position: 'absolute', left: 0, right: 0, top: -R, height: R },
        { position: 'absolute', left: 0, right: 0, bottom: -R, height: R },
    ];
    return (
        <>
            {strips.map((strip, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <Animated.View key={index} style={[strip, style]} />
            ))}
        </>
    );
};
