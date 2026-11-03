/**
 * Android accessibility-data sensitive container (API 34+).
 * Services with isAccessibilityTool=false cannot read this subtree.
 * Accessibility tools such as TalkBack still can. iOS renders a normal View.
 */
import React from 'react';
import { Platform, requireNativeComponent, View, ViewStyle } from 'react-native';

interface Props {
    children?: React.ReactNode;
    style?: ViewStyle | ViewStyle[];
    testID?: string;
    collapsable?: boolean;
}

const NativeSensitiveAccessibilityView =
    Platform.OS === 'android' ? requireNativeComponent<Props>('SensitiveAccessibilityView') : View;

const SensitiveAccessibilityView: React.FC<Props> = ({ children, style, testID }) => {
    return (
        <NativeSensitiveAccessibilityView collapsable={false} style={style} testID={testID}>
            {children}
        </NativeSensitiveAccessibilityView>
    );
};

export default SensitiveAccessibilityView;
