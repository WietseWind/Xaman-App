import React, { Component, ComponentType } from 'react';
import { Dimensions, LayoutChangeEvent, NativeModules, PixelRatio, View, ViewStyle } from 'react-native';

import { AppSizes } from '@theme';
import FoldPhoneExtraPanel from '@components/General/FoldPhoneExtraPanel/FoldPhoneExtraPanel';

import { AndroidLayoutSize, androidWindowFrame, getAndroidFoldLayout } from './androidWindow';
import {
    AndroidMultiWindowState, getAndroidMultiWindowState, subscribeAndroidMultiWindowState,
} from './androidMultiWindow';
import { AndroidWindowFreeAreaContext, AndroidWindowSurroundContext } from './androidWindowContext';
import { FoldPhone, FoldPhoneState, foldPhoneStateFor } from './foldPhone';

// Keep React's own statics on the screen, as the iOS side-safe-area wrapper does.
const REACT_STATICS = new Set([
    'length', 'name', 'prototype', 'caller', 'callee', 'arguments', 'arity',
    'displayName', 'childContextTypes', 'contextType', 'contextTypes', 'defaultProps',
    'getDefaultProps', 'getDerivedStateFromError', 'getDerivedStateFromProps',
    'mixins', 'propTypes', 'type',
]);
const FLEX: ViewStyle = { flex: 1 };
const FREE_SIDE: ViewStyle = { position: 'absolute', left: 0, top: 0 };

type State = {
    view?: AndroidLayoutSize;
    window: AndroidLayoutSize;
    multiWindow?: AndroidMultiWindowState;
};

const wrappers = new WeakMap<object, ComponentType<any>>();

/**
 * Keep a screen mounted while its Android window changes. New native Android
 * builds support resizing on regular phones too; transparent full-size views
 * preserve their existing layout and also handle a later split-screen entry.
 */
export const withAndroidWindowLayout = <P extends object>(Screen: ComponentType<P>): ComponentType<P> => {
    const known = wrappers.get(Screen);
    if (known) return known;
    const layout = {
        width: AppSizes.screen.uncorrectedWidth,
        height: AppSizes.screen.height,
    };
    const fold = getAndroidFoldLayout();

    class AndroidWindowLayout extends Component<P, State> {
        static displayName = `AndroidWindowLayout(${Screen.displayName || Screen.name || 'Screen'})`;

        private mounted = false;

        private subscription?: ReturnType<typeof Dimensions.addEventListener>;
        private multiWindowSubscription?: { remove: () => void };

        private columnWidth?: number;

        private publishedWidth?: number;

        private foldState?: FoldPhoneState;

        constructor(props: P) {
            super(props);
            const { width, height } = Dimensions.get('window');
            this.state = { window: { width, height }, multiWindow: getAndroidMultiWindowState() };
        }

        componentDidMount() {
            this.mounted = true;
            this.subscription = Dimensions.addEventListener('change', ({ window }) => {
                if (!this.mounted || !(window.width > 0) || !(window.height > 0)) return;
                this.setState((state) => state.multiWindow ||
                    (state.window.width === window.width && state.window.height === window.height)
                    ? null : { window: { width: window.width, height: window.height } });
            });
            this.multiWindowSubscription = subscribeAndroidMultiWindowState((multiWindow) => {
                if (this.mounted) this.setState({ multiWindow });
            });
            // Another mounted screen may have accepted a newer snapshot while
            // React constructed this screen. A same-revision getter will not
            // emit again, so reconcile before publishing a stale tab width.
            const latest = getAndroidMultiWindowState();
            const { multiWindow: rendered } = this.state;
            if (latest && latest !== rendered) {
                this.setState({ multiWindow: latest });
                return;
            }
            this.publishLayout();
        }

        componentDidUpdate() {
            this.publishLayout();
        }

        componentWillUnmount() {
            this.mounted = false;
            this.subscription?.remove();
            this.multiWindowSubscription?.remove();
        }

        onLayout = ({ nativeEvent }: LayoutChangeEvent) => {
            const { width, height } = nativeEvent.layout;
            if (!this.mounted || !(width > 0) || !(height > 0)) return;
            this.setState((state) => state.view?.width === width && state.view?.height === height
                ? null : { view: { width, height } });
        };

        publishLayout = () => {
            if (this.columnWidth !== undefined && this.publishedWidth !== this.columnWidth) {
                NativeModules.DeviceUtilsModule?.setAndroidWindowColumnWidth?.(this.columnWidth);
                this.publishedWidth = this.columnWidth;
            }
            if (this.foldState) FoldPhone.update(this.foldState);
        };

        render() {
            const { view, window, multiWindow } = this.state;
            const fullPane = multiWindow?.isInMultiWindowMode === true;
            // The flag and bounds share one native revision. A late Dimensions
            // event must not restore an old split size after leaving split mode.
            const liveWindow = multiWindow ? { width: multiWindow.width, height: multiWindow.height } : window;
            const paneView = view && fullPane ? {
                width: Math.min(view.width, liveWindow.width), height: Math.min(view.height, liveWindow.height),
            } : view;
            const windowFrame = androidWindowFrame(liveWindow, liveWindow, layout, PixelRatio.get(), fullPane);
            const frame = paneView
                ? androidWindowFrame(paneView, liveWindow, layout, PixelRatio.get(), fullPane) : undefined;
            const initialStyle: ViewStyle = fullPane ? FLEX : { flex: 1, width: layout.width, alignSelf: 'flex-end' };
            const style: ViewStyle = frame ? {
                position: 'absolute',
                left: frame.logicalLeft,
                top: frame.logicalTop,
                width: frame.logicalWidth ?? layout.width,
                height: frame.logicalHeight,
            } : initialStyle;
            if (frame && frame.scale !== 1) style.transform = [{ scale: frame.scale }];
            const hasFreeArea = !!frame && frame.left > 1;
            // Overlays can mount before their first onLayout. Give their blur a
            // bounded initial window too, rather than a 2000dp bleed bitmap.
            const backdropFrame = frame || windowFrame;
            const surround = backdropFrame && (fullPane || fold || hasFreeArea || backdropFrame.scale !== 1) ? {
                left: backdropFrame.left / backdropFrame.scale,
                width: (backdropFrame.left + backdropFrame.width) / backdropFrame.scale,
                height: backdropFrame.logicalHeight,
                columnWidth: backdropFrame.logicalWidth ?? layout.width,
                scale: backdropFrame.scale,
                ...(fullPane ? { fullPane: true,
                    ...(multiWindow?.topInset !== undefined ? { topInset: multiWindow.topInset } : {}) } : {}),
            } : undefined;
            // Detached stack screens retain their last native view size. A
            // global tab bar must follow the current window, never that stale
            // local frame from an invisible screen's Dimensions listener.
            this.columnWidth = windowFrame?.width;
            this.foldState = fold && windowFrame ? foldPhoneStateFor(
                { width: windowFrame.left + windowFrame.width, height: windowFrame.height },
                { left: windowFrame.left, top: 0, width: windowFrame.width, height: windowFrame.height },
                fold.width,
            ) : undefined;
            if (fold && fullPane && windowFrame) {
                this.foldState = {
                    mode: 'split',
                    window: { width: liveWindow.width, height: liveWindow.height },
                    app: { left: 0, top: 0, width: windowFrame.width, height: windowFrame.height },
                };
            }
            const isOverlay = (this.props as { componentType?: string }).componentType === 'OVERLAY';
            return (
                <View testID="android-window-layout" style={FLEX} pointerEvents="box-none" onLayout={this.onLayout}>
                    {fold && hasFreeArea && !isOverlay && frame && (
                        <View
                            style={[FREE_SIDE, { width: frame.left, height: frame.height }]}
                            pointerEvents="box-none"
                        >
                            <FoldPhoneExtraPanel width={frame.left} height={frame.height} side="left"
                                screen={(Screen as { screenName?: string }).screenName} />
                        </View>
                    )}
                    <View style={style} pointerEvents="box-none">
                        <AndroidWindowFreeAreaContext.Provider value={hasFreeArea}>
                            <AndroidWindowSurroundContext.Provider value={surround}>
                                {/* eslint-disable-next-line react/jsx-props-no-spreading */}
                                <Screen {...this.props} />
                            </AndroidWindowSurroundContext.Provider>
                        </AndroidWindowFreeAreaContext.Provider>
                    </View>
                </View>
            );
        }
    }

    Object.getOwnPropertyNames(Screen).forEach((name) => {
        if (REACT_STATICS.has(name)) return;
        const descriptor = Object.getOwnPropertyDescriptor(Screen, name);
        if (descriptor) Object.defineProperty(AndroidWindowLayout, name, descriptor);
    });
    wrappers.set(Screen, AndroidWindowLayout);
    return AndroidWindowLayout;
};
