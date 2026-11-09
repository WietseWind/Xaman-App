/**
 * Android accessibility-data sensitive container (API 34+).
 * Services with isAccessibilityTool=false cannot read this subtree.
 * Accessibility tools such as TalkBack still can. iOS renders a normal View.
 *
 * It takes every View prop, so it can replace a View one to one, also as the child of a
 * Touchable (which passes its responder and accessibility props to its child).
 */
import React from 'react';
import { Platform, requireNativeComponent, View, ViewProps } from 'react-native';

interface Props extends ViewProps {
    children?: React.ReactNode;
}

const NativeSensitiveAccessibilityView =
    Platform.OS === 'android' ? requireNativeComponent<Props>('SensitiveAccessibilityView') : View;

const SensitiveAccessibilityView: React.FC<Props> = ({ children, ...props }) => {
    return (
        // eslint-disable-next-line react/jsx-props-no-spreading
        <NativeSensitiveAccessibilityView {...props} collapsable={false}>
            {children}
        </NativeSensitiveAccessibilityView>
    );
};

export default SensitiveAccessibilityView;
