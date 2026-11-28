/**
 * Action Panel component
 */
import React, { Component } from 'react';
import {
    Animated,
    View,
    TouchableWithoutFeedback,
    InteractionManager,
    PanResponder,
    ViewStyle,
    GestureResponderEvent,
    PanResponderGestureState,
    PanResponderInstance,
    AccessibilityInfo,
    findNodeHandle,
    LayoutChangeEvent,
} from 'react-native';

import Localize from '@locale';

// style
import { AppStyles, AppSizes } from '@theme';
import { sideBleedEdges, SideSafeAreaContext } from '@common/helpers/sideSafeArea';
import { AndroidWindowSurroundContext } from '@common/helpers/androidWindowContext';
import { supportsAndroidMultiWindowLayout } from '@common/helpers/androidMultiWindow';
import { useAndroidPaneKeyboard } from '@common/helpers/androidPaneKeyboard';
import KeyboardAwareScrollView from '@components/General/KeyboardAwareScrollView/KeyboardAwareScrollView';

import styles from './styles';

/* types ==================================================================== */
interface Props extends React.PropsWithChildren {
    height: number;
    offset?: number;
    extraBottomInset?: boolean;
    testID?: string;
    contentStyle?: ViewStyle | ViewStyle[];
    onCloseRequest?: () => void;
    onDragEnd?: () => void;
    lockAfterCloseRequest?: boolean;
    onSlideDown?: () => void;
    /** Supplied only for a real split pane by the new Android native bridge. */
    viewportHeight?: number;
    availableHeight?: number;
    viewportRef?: React.RefObject<View>;
    onViewportLayout?: (event: LayoutChangeEvent) => void;
    /** Only simple, non-list content opts in to an outer scroll container. */
    scrollableContent?: boolean;
}

interface SnapPoint {
    y: number;
}

interface State {
    snapPoints: SnapPoint[];
    boundaries: { top: number };
    panelHeight?: number;
}

/* Constants ==================================================================== */
const BOUNDARY_HEIGHT = 20;
const HEADER_CAPTURE_HEIGHT = 56;
const MOVE_CAPTURE_THRESHOLD = 10;
const FLICK_VELOCITY = 0.8;
const PANE_CONTENT_STYLE = { flexGrow: 1 };

const PanePanelContents = ({ children, enabled }: React.PropsWithChildren<{ enabled?: boolean }>) => {
    const pane = React.useContext(AndroidWindowSurroundContext);
    // Preserve multiple caller-owned sibling controls without adding a native View.
    // eslint-disable-next-line react/jsx-no-useless-fragment
    if (!enabled || !supportsAndroidMultiWindowLayout()) return <>{children}</>;
    const fullPane = pane?.fullPane === true;
    return (
        <KeyboardAwareScrollView
            style={AppStyles.flex1}
            contentContainerStyle={fullPane ? PANE_CONTENT_STYLE : AppStyles.flex1}
            scrollEnabled={fullPane}
            enabled={fullPane}
            observeKeyboard={fullPane}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
        >
            {children}
        </KeyboardAwareScrollView>
    );
};

/* Component ==================================================================== */
export class ActionPanel extends Component<Props, State> {
    // the window around the box of the screen: only more than the default on the open iPhone Duo turned a quarter
    static contextType = SideSafeAreaContext;

    declare context: React.ContextType<typeof SideSafeAreaContext>;

    private translateY: Animated.Value;
    private panResponder: PanResponderInstance;
    private currentY: number;
    private dragStartY: number;
    private currentIndex: number;
    private isDragging: boolean;
    private dismissed: boolean;
    private closeRequested: boolean;
    private startedOnHeader: boolean;
    private slideTimeout?: ReturnType<typeof setTimeout>;
    private focusTimeout?: ReturnType<typeof setTimeout>;
    private panelRef = React.createRef<View>();

    constructor(props: Props) {
        super(props);

        const screenHeight = props.viewportHeight ?? AppSizes.screen.height;

        this.state = {
            snapPoints: [],
            boundaries: { top: 0 },
            panelHeight: undefined,
        };

        this.translateY = new Animated.Value(screenHeight);
        this.currentY = screenHeight;
        this.dragStartY = screenHeight;
        this.currentIndex = 0;
        this.isDragging = false;
        this.dismissed = false;
        this.closeRequested = false;
        this.startedOnHeader = false;

        this.translateY.addListener(({ value }) => {
            this.currentY = value;
        });

        this.panResponder = PanResponder.create({
            onStartShouldSetPanResponder: this.onStartShouldSetPanResponder,
            onMoveShouldSetPanResponder: this.onMoveShouldSetPanResponder,
            onPanResponderGrant: this.onPanResponderGrant,
            onPanResponderMove: this.onPanResponderMove,
            onPanResponderRelease: this.onPanResponderRelease,
            onPanResponderTerminate: this.onPanResponderRelease,
            onPanResponderTerminationRequest: this.onPanResponderTerminationRequest,
            onShouldBlockNativeResponder: () => false,
        });
    }

    componentDidMount() {
        InteractionManager.runAfterInteractions(this.slideUp);

        // screen readers: start in the panel, not on what is behind it
        this.focusTimeout = setTimeout(this.focusPanel, 600);
    }

    focusPanel = async () => {
        try {
            if (!(await AccessibilityInfo.isScreenReaderEnabled())) return;
        } catch {
            return;
        }

        const node = this.panelRef.current ? findNodeHandle(this.panelRef.current) : null;
        if (node) {
            AccessibilityInfo.setAccessibilityFocus(node);
        }
    };

    componentWillUnmount() {
        if (this.slideTimeout) {
            clearTimeout(this.slideTimeout);
        }

        if (this.focusTimeout) {
            clearTimeout(this.focusTimeout);
        }

        this.translateY.removeAllListeners();
        this.translateY.stopAnimation();
    }

    componentDidUpdate(previousProps: Props) {
        const { viewportHeight, availableHeight } = this.props;
        if ((previousProps.viewportHeight === viewportHeight && previousProps.availableHeight === availableHeight) ||
            this.isDragging) return;
        // A divider move changes the coordinate space, not the chosen snap target.
        // Finish an interrupted close with its normal completion callback.
        if (this.closeRequested) {
            this.animateToIndex(0);
            return;
        }
        this.translateY.stopAnimation();
        const { snapPoints } = this.state;
        const point = snapPoints[this.currentIndex];
        if (point) this.translateY.setValue(point.y);
    }

    static getDerivedStateFromProps(props: Props) {
        const { height, offset, extraBottomInset, viewportHeight, availableHeight } = props;

        const screenHeight = viewportHeight ?? AppSizes.screen.height;
        const visibleHeight = viewportHeight === undefined ? screenHeight
            : Math.max(0, Math.min(screenHeight, availableHeight ?? screenHeight));

        let panelHeight = height;

        if (extraBottomInset) {
            panelHeight += AppSizes.safeAreaBottomInset;
        }
        if (viewportHeight !== undefined) {
            panelHeight = Math.min(panelHeight, Math.max(1, visibleHeight - BOUNDARY_HEIGHT));
        }

        const restingY = viewportHeight === undefined ? screenHeight - panelHeight
            : Math.max(0, visibleHeight - panelHeight);
        const snapPoints = [{ y: screenHeight }, { y: restingY }];

        let topBoundary = restingY - BOUNDARY_HEIGHT;

        if (typeof offset === 'number') {
            const boundedOffset = viewportHeight === undefined ? offset : Math.max(0, Math.min(offset, restingY));
            topBoundary -= boundedOffset;
            snapPoints.push({
                y: restingY - boundedOffset,
            });
        }
        if (viewportHeight !== undefined) topBoundary = Math.max(0, topBoundary);

        return {
            panelHeight: panelHeight + (viewportHeight === undefined ? BOUNDARY_HEIGHT : 0),
            snapPoints,
            boundaries: {
                top: topBoundary,
            },
        };
    }

    public get isDragActive(): boolean {
        return this.isDragging;
    }

    public get offsetFromRest(): number {
        const { snapPoints } = this.state;
        const restingPoint = snapPoints[1];
        return restingPoint ? restingPoint.y - this.currentY : 0;
    }

    public slideUp = () => {
        // A tap can close the sheet before the deferred open runs.
        if (this.dismissed || this.closeRequested) {
            return;
        }

        this.snapTo(1);
    };

    public slideDown = () => {
        this.requestClose();
        this.snapTo(0);
    };

    private requestClose = () => {
        if (this.closeRequested) return;
        this.closeRequested = true;
        const { onCloseRequest } = this.props;
        onCloseRequest?.();
    };

    private isCloseLocked = () => {
        const { lockAfterCloseRequest } = this.props;
        return this.closeRequested && lockAfterCloseRequest;
    };

    public snapTo = (index: number) => {
        if (this.slideTimeout) {
            clearTimeout(this.slideTimeout);
        }

        this.slideTimeout = setTimeout(() => {
            this.animateToIndex(index);
        }, 50);
    };

    private onStartShouldSetPanResponder = (event: GestureResponderEvent) => {
        if (this.isCloseLocked()) return false;
        this.startedOnHeader = event.nativeEvent.locationY <= HEADER_CAPTURE_HEIGHT;
        return this.startedOnHeader;
    };

    private onMoveShouldSetPanResponder = (_event: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        if (this.isCloseLocked()) return false;
        // Do not steal vertical pans from nested ScrollViews.
        if (!this.startedOnHeader) {
            return false;
        }

        const { dy, dx } = gestureState;

        return Math.abs(dy) > MOVE_CAPTURE_THRESHOLD && Math.abs(dy) > Math.abs(dx);
    };

    private onPanResponderTerminationRequest = () => !this.startedOnHeader;

    private onPanResponderGrant = () => {
        if (this.isCloseLocked()) return;
        this.translateY.stopAnimation();
        this.dragStartY = this.currentY;
        this.isDragging = true;
    };

    private onPanResponderMove = (_event: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        if (this.isCloseLocked()) return;
        const { boundaries } = this.state;
        const { viewportHeight } = this.props;
        const maxY = viewportHeight ?? AppSizes.screen.height;

        let nextY = this.dragStartY + gestureState.dy;

        if (nextY < boundaries.top) {
            nextY = boundaries.top;
        }

        if (nextY > maxY) {
            nextY = maxY;
        }

        this.translateY.setValue(nextY);
    };

    private onPanResponderRelease = (_event: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const wasDragging = this.isDragging;
        this.isDragging = false;
        this.startedOnHeader = false;
        this.animateToIndex(this.getTargetIndex(this.currentY, gestureState.vy));
        // Report the user's chosen target first, so a close request can cancel pending work.
        if (wasDragging) {
            const { onDragEnd } = this.props;
            onDragEnd?.();
        }
    };

    private getTargetIndex = (y: number, vy: number) => {
        const { snapPoints } = this.state;

        if (!snapPoints.length) {
            return 0;
        }

        const lastIndex = snapPoints.length - 1;

        if (vy > FLICK_VELOCITY) {
            return Math.max(0, this.currentIndex - 1);
        }

        if (vy < -FLICK_VELOCITY) {
            return Math.min(lastIndex, this.currentIndex + 1);
        }

        let nearest = 0;
        let bestDistance = Number.POSITIVE_INFINITY;

        snapPoints.forEach((point, index) => {
            const distance = Math.abs(point.y - y);

            if (distance < bestDistance) {
                bestDistance = distance;
                nearest = index;
            }
        });

        return nearest;
    };

    private animateToIndex = (index: number) => {
        const { snapPoints } = this.state;
        const targetIndex = this.isCloseLocked() ? 0 : index;
        const point = snapPoints[targetIndex];

        if (!point) {
            return;
        }

        if (targetIndex === 0) {
            this.requestClose();
        }

        this.currentIndex = targetIndex;

        Animated.spring(this.translateY, {
            toValue: point.y,
            useNativeDriver: true,
            friction: 9,
            tension: 70,
            overshootClamping: true,
        }).start(({ finished }) => {
            if (!finished || this.isDragging) {
                return;
            }

            // The sheet starts off-screen, and that position is not a close animation.
            // A close that interrupts the open spring is an animation to index 0 and must
            // still remove the overlay. Otherwise the invisible backdrop keeps eating taps.
            if (targetIndex === 0) {
                this.notifyDismissed();
            }
        });
    };

    private notifyDismissed = () => {
        const { onSlideDown } = this.props;

        if (this.dismissed) {
            return;
        }

        this.dismissed = true;

        if (typeof onSlideDown === 'function') {
            onSlideDown();
        }
    };

    render() {
        const { below } = this.context || { below: 0 };
        const {
            children, testID, contentStyle, viewportHeight, viewportRef, onViewportLayout, scrollableContent,
        } = this.props;
        const { panelHeight } = this.state;

        if (!panelHeight) return null;

        return (
            <View
                ref={viewportRef}
                onLayout={onViewportLayout}
                testID={testID}
                style={AppStyles.flex1}
                // VoiceOver stays in the panel; its escape gesture closes it
                accessibilityViewIsModal
                onAccessibilityEscape={this.slideDown}
            >
                <TouchableWithoutFeedback
                    onPress={this.slideDown}
                    accessibilityRole="button"
                    accessibilityLabel={Localize.t('global.close')}
                >
                    <Animated.View
                        style={[
                            styles.shadowContent,
                            sideBleedEdges,
                            {
                                opacity: this.translateY.interpolate({
                                    inputRange: [0, viewportHeight ?? AppSizes.screen.height],
                                    outputRange: [0.8, 0],
                                    extrapolateRight: 'clamp',
                                }),
                            },
                        ]}
                    />
                </TouchableWithoutFeedback>

                <Animated.View
                    style={[
                        styles.panel,
                        // the box of the screen does not reach the end of the window: the panel starts at that end
                        below > 0 ? { top: below } : undefined,
                        {
                            transform: [{ translateY: this.translateY }],
                        },
                    ]}
                >
                    <View
                        ref={this.panelRef}
                        style={[
                            styles.container,
                            { height: panelHeight + (viewportHeight === undefined ? BOUNDARY_HEIGHT : 0) },
                            contentStyle,
                        ]}
                    >
                        {/* eslint-disable-next-line react/jsx-props-no-spreading */}
                        <View style={styles.panelHeader} {...this.panResponder.panHandlers}>
                            <View style={styles.panelHandle} />
                        </View>
                        <PanePanelContents enabled={scrollableContent}>{children}</PanePanelContents>
                    </View>
                </Animated.View>
            </View>
        );
    }
}

/* Export Component ==================================================================== */
// Preserve the existing imperative ref API and each child's mounted instance.
type ActionPanelWithAndroidWindow = ActionPanel;
// TypeScript shares this public ref type with the forwarded component value.
// eslint-disable-next-line @typescript-eslint/no-redeclare
const ActionPanelWithAndroidWindow = React.forwardRef<ActionPanel, Props>((props, ref) => {
    const pane = React.useContext(AndroidWindowSurroundContext);
    const viewport = React.useRef<View>(null);
    const fullPane = supportsAndroidMultiWindowLayout() && pane?.fullPane === true;
    const bounds = useAndroidPaneKeyboard(fullPane, viewport, pane?.columnWidth ?? 0, pane?.height ?? 0);
    return (
        // eslint-disable-next-line react/jsx-props-no-spreading
        <ActionPanel {...props} ref={ref}
            viewportRef={fullPane ? viewport : undefined}
            onViewportLayout={fullPane ? bounds.onLayout : undefined}
            viewportHeight={fullPane ? bounds.height : undefined}
            availableHeight={fullPane ? bounds.availableHeight : undefined} />
    );
});
ActionPanelWithAndroidWindow.displayName = 'ActionPanel';

export default ActionPanelWithAndroidWindow;
