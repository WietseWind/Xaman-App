/* eslint-disable react/jsx-props-no-spreading */
import React, { useContext, useRef } from 'react';
import { Animated, StyleSheet, View, ViewProps } from 'react-native';

import { supportsAndroidMultiWindowLayout } from '@common/helpers/androidMultiWindow';
import { AndroidWindowSurroundContext } from '@common/helpers/androidWindowContext';
import { useAndroidPaneKeyboard } from '@common/helpers/androidPaneKeyboard';
import KeyboardAwareScrollView from '@components/General/KeyboardAwareScrollView/KeyboardAwareScrollView';

const SCROLL_STYLE = { flexGrow: 0, flexShrink: 1, alignSelf: 'stretch' as const };
const FILL_STYLE = { flexGrow: 1, flexShrink: 1, flexBasis: 0 };
const VIEWPORT_STYLE = {
    position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0,
    justifyContent: 'center' as const, alignItems: 'center' as const,
};

type Props = ViewProps & { scrollable?: boolean; normalWidth?: number; normalFill?: boolean };

/** Keep the same input subtree while a new Android build enters or leaves a split pane. */
const AndroidPaneCard = React.forwardRef<View, Props>(({
    children, style, scrollable = true, normalWidth, normalFill = false, ...props
}, ref) => {
    const pane = useContext(AndroidWindowSurroundContext);
    const viewport = useRef<View>(null);
    const fullPane = supportsAndroidMultiWindowLayout() && pane?.fullPane === true;
    const bounds = useAndroidPaneKeyboard(fullPane, viewport, pane?.columnWidth ?? 0, pane?.height ?? 0);
    if (!supportsAndroidMultiWindowLayout()) {
        // iOS and older Android binaries retain their original native tree.
        return <View {...props} ref={ref} style={style}>{children}</View>;
    }

    const cardStyle = StyleSheet.flatten(style);
    return (
        <View ref={viewport} pointerEvents="box-none"
            style={fullPane ? VIEWPORT_STYLE : normalFill ? FILL_STYLE : undefined}
            onLayout={bounds.onLayout}>
            <View {...props} ref={ref} style={[
                style,
                !fullPane && normalFill ? FILL_STYLE : undefined,
                !fullPane && normalWidth !== undefined ? { width: normalWidth } : undefined,
                fullPane ? {
                    width: bounds.width * 0.9,
                    maxHeight: Math.max(1, bounds.availableHeight - 20),
                    // Center in the visible area. Legacy whole-card displacement
                    // cannot move the header outside this bounded viewport.
                    marginBottom: bounds.height - bounds.availableHeight,
                } : undefined,
            ]}>
                {scrollable ? <KeyboardAwareScrollView
                    style={!fullPane && normalFill ? FILL_STYLE : SCROLL_STYLE}
                    contentContainerStyle={{ alignItems: cardStyle?.alignItems,
                        ...(!fullPane && normalFill ? { flex: 1 } : {}) }}
                    enabled={fullPane}
                    observeKeyboard={fullPane}
                    scrollEnabled={fullPane}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="none"
                    showsVerticalScrollIndicator={fullPane}
                >
                    {children}
                </KeyboardAwareScrollView> : children}
            </View>
        </View>
    );
});
AndroidPaneCard.displayName = 'AndroidPaneCard';

export const AnimatedAndroidPaneCard = Animated.createAnimatedComponent(AndroidPaneCard);
export default AndroidPaneCard;
