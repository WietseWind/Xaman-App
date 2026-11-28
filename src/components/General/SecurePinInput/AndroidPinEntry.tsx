import React, { ReactNode, useContext, useState } from 'react';
import { LayoutChangeEvent, ScrollView, View, ViewStyle } from 'react-native';

import { supportsAndroidMultiWindowLayout } from '@common/helpers/androidMultiWindow';
import { AndroidWindowSurroundContext } from '@common/helpers/androidWindowContext';

export type AndroidPinPaneLayout = { width: number; height: number };

export const ANDROID_PIN_MIN_HEIGHT = 232;

const SCROLL_STYLE = { flex: 1, alignSelf: 'stretch' as const };
const INTRINSIC_SCROLL_STYLE = { alignSelf: 'stretch' as const, flexGrow: 0, flexShrink: 0 };
const CONTENT_STYLE = { flexGrow: 1 };
// Removing flexGrow resets it to native zero, which overrides flex on return.
const NORMAL_CONTENT_STYLE = { flex: 1, flexGrow: 1 };
const SLOT_STYLE = {
    alignSelf: 'stretch' as const, minHeight: ANDROID_PIN_MIN_HEIGHT,
    flexGrow: 1, flexShrink: 0, justifyContent: 'center' as const,
};

/** Stable on capable Android builds so resizing never reparents the PIN keys. */
export const AndroidPinEntryScroll = ({ children, normalContentStyle, paneContentStyle, normalHeight, normalWidth }: {
    children: ReactNode;
    normalContentStyle?: ViewStyle;
    paneContentStyle?: ViewStyle;
    normalHeight?: number;
    normalWidth?: number;
}) => {
    const pane = useContext(AndroidWindowSurroundContext);
    // eslint-disable-next-line react/jsx-no-useless-fragment
    if (!supportsAndroidMultiWindowLayout()) return <>{children}</>;
    const fullPane = pane?.fullPane === true;
    const scrollStyle = !fullPane && normalHeight !== undefined
        ? [INTRINSIC_SCROLL_STYLE, { height: normalHeight }] : SCROLL_STYLE;
    return (
        <ScrollView style={!fullPane && normalWidth !== undefined
            ? [scrollStyle, { width: normalWidth, alignSelf: 'center' }] : scrollStyle}
            contentContainerStyle={fullPane
                ? [CONTENT_STYLE, paneContentStyle] : [NORMAL_CONTENT_STYLE, normalContentStyle]}
            scrollEnabled={fullPane} bounces={false} keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={fullPane} contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}>
            {children}
        </ScrollView>
    );
};

/** Measure the actual flex allocation; a shorter body scrolls the 44dp minimum pad. */
export const AndroidPinEntrySlot = ({ children }: {
    children: (layout?: AndroidPinPaneLayout) => ReactNode;
}) => {
    const pane = useContext(AndroidWindowSurroundContext);
    const [measured, setMeasured] = useState<AndroidPinPaneLayout & { key: string }>();
    const fullPane = supportsAndroidMultiWindowLayout() && pane?.fullPane === true;
    const key = fullPane ? `${pane.columnWidth}:${pane.height}` : '';
    const onLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
        if (!fullPane || !Number.isFinite(layout.width) || layout.width <= 0 ||
            !Number.isFinite(layout.height) || layout.height <= 0) return;
        setMeasured((previous) => previous?.key === key && previous.width === layout.width &&
            previous.height === layout.height ? previous : { key, width: layout.width, height: layout.height });
    };
    if (!supportsAndroidMultiWindowLayout()) return <>{children()}</>;
    const layout = fullPane && measured?.key === key ? measured : undefined;
    return <View style={fullPane ? SLOT_STYLE : undefined} onLayout={fullPane ? onLayout : undefined}>
        {children(layout)}
    </View>;
};
