import React, { Component } from 'react';
import { requireNativeComponent, StyleProp, View, ViewStyle } from 'react-native';

import { AndroidWindowSurroundContext } from '@common/helpers/androidWindowContext';

const NativeBlurView: any = requireNativeComponent('BlurView');

/* Types ==================================================================== */
interface Props {
    children: React.ReactNode;
    blurType?: 'xlight' | 'light' | 'dark';
    blurAmount?: number;
    style?: StyleProp<ViewStyle>;
    /** Content style before backdrop bleed; used only in adaptive Android windows. */
    contentStyle?: StyleProp<ViewStyle>;
}

/* Component ==================================================================== */
class BlurView extends Component<Props> {
    static contextType = AndroidWindowSurroundContext;

    declare context: React.ContextType<typeof AndroidWindowSurroundContext>;

    render() {
        const { blurType, blurAmount, style, contentStyle, children } = this.props;
        const surround = this.context;
        if (surround) {
            // Android BlurView inherits FrameLayout child placement. Keep React
            // children in a React View, and give the native blur no children.
            // Bound its bitmap to this window instead of the large iOS bleed.
            const frame: ViewStyle = { width: surround.columnWidth, height: surround.height };
            const width = surround.width * surround.scale;
            const height = surround.height * surround.scale;
            const backdrop: ViewStyle = {
                position: 'absolute', width, height,
                left: -surround.left + (width * (1 - surround.scale)) / (2 * surround.scale),
                top: (height * (1 - surround.scale)) / (2 * surround.scale),
            };
            // BlurView samples the root using its measured size. Cancel the
            // column transform, including its centre offset, so that sampling
            // and bitmap size match the visible window even in a small split.
            if (surround.scale !== 1) backdrop.transform = [{ scale: 1 / surround.scale }];
            return (
                <View style={[contentStyle, frame]}>
                    <NativeBlurView blurType={blurType} blurAmount={blurAmount} style={backdrop} />
                    {children}
                </View>
            );
        }
        return (
            <NativeBlurView blurType={blurType} blurAmount={blurAmount} style={style}>
                {children}
            </NativeBlurView>
        );
    }
}

export default BlurView;
