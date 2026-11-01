import React, { Component, ReactNode } from 'react';
import {
    Animated,
    AppState,
    GestureResponderEvent,
    LayoutChangeEvent,
    NativeScrollEvent,
    NativeSyntheticEvent,
    PanResponder,
    Pressable,
    ScrollView,
    View,
    StyleProp,
    ViewStyle,
} from 'react-native';

import { VibrateHapticFeedback } from '@common/helpers/interface';
import { clamp, edgeScrollSpeed, insertionIndex, moveItem } from './reorder';
import styles from './styles';

export interface Props<T> {
    testID?: string;
    style?: StyleProp<ViewStyle>;
    contentContainerStyle?: StyleProp<ViewStyle>;
    rowStyle?: StyleProp<ViewStyle>;
    emptyComponent?: ReactNode;
    data: T[];
    sortable: boolean;
    keyExtractor: (item: T) => string;
    renderItem: (item: T, index: number) => ReactNode;
    onPress: (item: T, index: number) => void;
    onReorder: (items: T[]) => void;
}

interface Drag {
    key: string;
    from: number;
    to: number;
    origin: number;
    height: number;
    grabOffset: number;
    pageY: number;
    viewportTop: number;
}

// Reorder mode has content-sized rows. Keep their measured native layouts
// alive while dragging so scrolling never unmounts the held row or guesses its height.
export default class ReorderableList<T> extends Component<Props<T>, { activeKey?: string }> {
    private viewport = React.createRef<View>();
    private scroll = React.createRef<ScrollView>();
    private heights = new Map<string, number>();
    private translations = new Map<string, Animated.Value>();
    private drag?: Drag;
    private offset = 0;
    private viewportHeight = 0;
    private contentHeight = 0;
    private frame?: number;
    private lastFrame?: number;
    private mounted = false;
    private touchActive = false;
    private generation = 0;
    private keys: string[];
    private appStateListener?: ReturnType<typeof AppState.addEventListener>;

    constructor(props: Props<T>) {
        super(props);
        this.state = {};
        this.keys = props.data.map(props.keyExtractor);
    }

    private panResponder = PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponderCapture: () => !!this.drag,
        onMoveShouldSetPanResponder: () => !!this.drag,
        onPanResponderMove: (_, gesture) => this.move(gesture.moveY),
        onPanResponderRelease: () => this.finish(true),
        onPanResponderTerminate: () => this.finish(false),
        onPanResponderTerminationRequest: () => !this.drag,
        onShouldBlockNativeResponder: () => !!this.drag,
    });

    componentDidMount() {
        this.mounted = true;
        this.appStateListener = AppState.addEventListener('change', (state) => {
            if (state !== 'active') this.finish(false);
        });
    }

    shouldComponentUpdate(nextProps: Props<T>, nextState: { activeKey?: string }) {
        const { activeKey } = this.state;
        if (!this.drag || nextState.activeKey !== activeKey) return true;
        const { sortable } = this.props;
        // Apply arriving metadata after release so it cannot resize a held row.
        // Membership and order changes cancel the gesture.
        return (
            nextProps.sortable !== sortable ||
            nextProps.data.map(nextProps.keyExtractor).join('|') !== this.keys.join('|')
        );
    }

    componentDidUpdate(previous: Props<T>) {
        const { data, keyExtractor, sortable } = this.props;
        const keys = data.map(keyExtractor);
        if (
            (!sortable && previous.sortable) ||
            keys.join('|') !== this.keys.join('|')
        ) {
            this.finish(false);
        }
        // Removed Realm objects cannot be read again, including through previous props.
        this.keys = keys;
        this.heights.forEach((_, key) => {
            if (!keys.includes(key)) this.heights.delete(key);
        });
        this.translations.forEach((_, key) => {
            if (!keys.includes(key)) this.translations.delete(key);
        });
    }

    componentWillUnmount() {
        this.mounted = false;
        this.finish(false);
        this.appStateListener?.remove();
    }

    private translation = (key: string) => {
        if (!this.translations.has(key)) this.translations.set(key, new Animated.Value(0));
        return this.translations.get(key)!;
    };

    private rows = () => {
        // Live Realm objects can invalidate before React commits their removal.
        // A running frame only needs the last committed keys and native heights.
        return this.keys.map(key => ({ key, height: this.heights.get(key) || 0 }));
    };

    private totalHeight = () => this.rows().reduce((sum, row) => sum + row.height, 0);

    begin = (key: string, event: GestureResponderEvent) => {
        const { sortable } = this.props;
        if (!this.mounted || !sortable || this.drag || !this.touchActive) return;
        const rows = this.rows();
        if (rows.some((row) => !row.height)) return;
        const from = rows.findIndex((row) => row.key === key);
        if (from < 0) return;
        const { pageY } = event.nativeEvent;
        const generation = ++this.generation;
        this.viewport.current?.measureInWindow((_, top) => {
            if (!this.mounted || generation !== this.generation || !this.touchActive || !sortable) return;
            const origin = rows.slice(0, from).reduce((sum, row) => sum + row.height, 0);
            this.drag = {
                key,
                from,
                to: from,
                origin,
                height: rows[from].height,
                grabOffset: pageY - top + this.offset - origin,
                pageY,
                viewportTop: top,
            };
            this.scroll.current?.scrollTo({ y: this.offset, animated: false });
            this.setState({ activeKey: key });
            VibrateHapticFeedback('impactMedium');
            this.move(pageY);
        });
    };

    move = (pageY: number) => {
        const { drag } = this;
        if (!drag || !this.mounted) return;
        drag.pageY = pageY;
        const top = clamp(
            pageY - drag.viewportTop + this.offset - drag.grabOffset,
            0,
            Math.max(0, this.totalHeight() - drag.height),
        );
        this.translation(drag.key).setValue(top - drag.origin);
        const to = insertionIndex(this.rows(), drag.key, top);
        if (to !== drag.to) {
            drag.to = to;
            this.rows().forEach((row, index) => {
                if (row.key === drag.key) return;
                let delta = 0;
                if (index > drag.from && index <= to) delta = -drag.height;
                if (index < drag.from && index >= to) delta = drag.height;
                Animated.timing(this.translation(row.key), {
                    toValue: delta,
                    duration: 140,
                    useNativeDriver: true,
                }).start();
            });
        }
        if (this.frame === undefined && edgeScrollSpeed(pageY - drag.viewportTop, this.viewportHeight)) {
            const { generation } = this;
            this.frame = requestAnimationFrame((time) => {
                if (generation === this.generation) this.autoScroll(time);
            });
        }
    };

    autoScroll = (time: number) => {
        this.frame = undefined;
        const { drag } = this;
        if (!drag || !this.mounted) return;
        const speed = edgeScrollSpeed(drag.pageY - drag.viewportTop, this.viewportHeight);
        const elapsed = this.lastFrame === undefined ? 16 : clamp(time - this.lastFrame, 0, 32);
        this.lastFrame = time;
        const next = clamp(
            this.offset + (speed * elapsed) / 1000,
            0,
            Math.max(0, Math.max(this.totalHeight(), this.contentHeight) - this.viewportHeight),
        );
        if (!speed || next === this.offset) {
            this.lastFrame = undefined;
            return;
        }
        this.offset = next;
        this.scroll.current?.scrollTo({ y: next, animated: false });
        // Recompute the held row too, even when the finger is completely still.
        this.move(drag.pageY);
    };

    finish = (commit: boolean) => {
        const { data, keyExtractor, onReorder } = this.props;
        const { activeKey } = this.state;
        this.generation += 1;
        this.touchActive = false;
        if (this.frame !== undefined) cancelAnimationFrame(this.frame);
        this.frame = undefined;
        this.lastFrame = undefined;
        const { drag } = this;
        this.drag = undefined;
        this.translations.forEach((value) => {
            value.stopAnimation();
            value.setValue(0);
        });
        if (this.mounted && activeKey) this.setState({ activeKey: undefined });
        if (drag && commit) VibrateHapticFeedback('impactMedium');
        if (drag && commit && drag.from !== drag.to) {
            let currentKeys: string[];
            try {
                currentKeys = data.map(keyExtractor);
            } catch {
                // An invalidated live item must cancel this drop, not persist a partial order.
                return;
            }
            if (currentKeys.join('|') !== this.keys.join('|')) return;
            onReorder(moveItem(data, drag.from, drag.to));
        }
    };

    private measureRow = (key: string, event: LayoutChangeEvent) => {
        const { height } = event.nativeEvent.layout;
        const previous = this.heights.get(key);
        if (previous !== undefined && Math.abs(previous - height) > 0.5 && this.drag) this.finish(false);
        this.heights.set(key, height);
    };

    private onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        // During an edge hold the frame loop owns the requested offset. Delayed
        // native scroll events must not pull the held row back toward an old offset.
        if (!this.drag) this.offset = Math.max(0, event.nativeEvent.contentOffset.y);
    };

    render() {
        const {
            data, sortable, keyExtractor, renderItem, onPress, testID, style,
            contentContainerStyle, rowStyle, emptyComponent,
        } = this.props;
        const { activeKey } = this.state;
        return (
            <View
                ref={this.viewport}
                style={[styles.list, style]}
                onLayout={(event) => {
                    if (this.viewportHeight !== event.nativeEvent.layout.height && this.drag) {
                        this.finish(false);
                    }
                    this.viewportHeight = event.nativeEvent.layout.height;
                }}
                onTouchStart={() => {
                    this.touchActive = true;
                }}
                onTouchEnd={() => this.finish(true)}
                onTouchCancel={() => this.finish(false)}
                // eslint-disable-next-line react/jsx-props-no-spreading
                {...this.panResponder.panHandlers}
            >
                <ScrollView
                    ref={this.scroll}
                    testID={testID}
                    contentContainerStyle={contentContainerStyle}
                    onContentSizeChange={(_, height) => { this.contentHeight = height; }}
                    scrollEnabled={!activeKey}
                    onScroll={this.onScroll}
                    scrollEventThrottle={16}
                    bounces={false}
                    removeClippedSubviews={false}
                >
                    {data.length === 0 && emptyComponent}
                    {data.map((item, index) => {
                        const key = keyExtractor(item);
                        const active = activeKey === key;
                        return (
                            <Animated.View
                                key={key}
                                onLayout={(event) => this.measureRow(key, event)}
                                style={[
                                    styles.listItem,
                                    rowStyle,
                                    active && styles.draggedItem,
                                    {
                                        transform: [
                                            { translateY: this.translation(key) },
                                            { scale: active ? 1.02 : 1 },
                                        ],
                                    },
                                ]}
                            >
                                <Pressable
                                    testID={`${testID ?? 'reorder-list'}-row-${key}`}
                                    accessibilityRole={sortable ? undefined : 'button'}
                                    delayLongPress={350}
                                    onLongPress={sortable ? (event) => this.begin(key, event) : undefined}
                                    onPress={() => {
                                        if (!sortable) onPress(item, index);
                                    }}
                                >
                                    {renderItem(item, index)}
                                </Pressable>
                            </Animated.View>
                        );
                    })}
                </ScrollView>
            </View>
        );
    }
}
