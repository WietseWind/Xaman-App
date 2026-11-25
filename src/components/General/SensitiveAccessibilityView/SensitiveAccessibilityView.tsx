/**
 * Container for views that show or accept secrets.
 *
 * Android (API 34+): accessibility-data sensitive. Services with isAccessibilityTool=false
 * cannot read this subtree. Accessibility tools such as TalkBack still can.
 *
 * iOS: the content is covered while the screen is being captured (screen recording,
 * mirroring, screen sharing). Android blocks capture for the whole app with FLAG_SECURE.
 * `captureShield={false}` turns the cover off (the passcode pad, which must stay usable).
 *
 * It takes every View prop, so it can replace a View one to one, also as the child of a
 * Touchable (which passes its responder and accessibility props to its child).
 */
import React from 'react';
import { Platform, requireNativeComponent, View, ViewProps } from 'react-native';

import StyleService from '@services/StyleService';

import Localize from '@locale';

interface Props extends ViewProps {
    children?: React.ReactNode;
    captureShield?: boolean;
}

interface CaptureShieldProps extends ViewProps {
    coverText: string;
    coverColor: string;
    coverTextColor: string;
}

const NativeSensitiveAccessibilityView =
    Platform.OS === 'android' ? requireNativeComponent<ViewProps>('SensitiveAccessibilityView') : View;

const NativeCaptureShieldView =
    Platform.OS === 'ios' ? requireNativeComponent<CaptureShieldProps>('CaptureShieldView') : undefined;

const SensitiveAccessibilityView: React.FC<Props> = ({ children, captureShield = true, ...props }) => {
    if (NativeCaptureShieldView && captureShield) {
        return (
            <NativeCaptureShieldView
                // eslint-disable-next-line react/jsx-props-no-spreading
                {...props}
                collapsable={false}
                coverText={Localize.t('global.hiddenWhileScreenIsCaptured')}
                coverColor={StyleService.value('$background')}
                coverTextColor={StyleService.value('$textPrimary')}
            >
                {children}
            </NativeCaptureShieldView>
        );
    }

    return (
        // eslint-disable-next-line react/jsx-props-no-spreading
        <NativeSensitiveAccessibilityView {...props} collapsable={false}>
            {children}
        </NativeSensitiveAccessibilityView>
    );
};

export default SensitiveAccessibilityView;
