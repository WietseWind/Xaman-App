/**
 * Back-camera QR preview. Visual chrome stays in ScanModal.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Camera, Code, useCameraDevice, useCameraPermission, useCodeScanner } from 'react-native-vision-camera';

import { AppColors, AppStyles } from '@theme';

import { cameraScannerPhase } from './cameraScannerPhase';
import { cameraTorchState } from './torch';

interface Props extends React.PropsWithChildren {
    onRead: (data: string) => void;
    notAuthorizedView: React.ReactNode;
    renderUnavailable?: (retry: () => void) => React.ReactNode;
    style?: ViewStyle | ViewStyle[];
    torchEnabled?: boolean;
    onHasTorchChange?: (hasTorch: boolean) => void;
}

const styles = StyleSheet.create({
    noDevice: {
        backgroundColor: AppColors.black,
    },
});

const CameraScanner = ({
    onRead,
    notAuthorizedView,
    renderUnavailable,
    style,
    children,
    torchEnabled = false,
    onHasTorchChange,
}: Props) => {
    const device = useCameraDevice('back');
    const { hasPermission, requestPermission } = useCameraPermission();
    const [previewFailed, setPreviewFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const hasTorch = !!device?.hasTorch;
    const phase = cameraScannerPhase({
        hasPermission,
        hasDevice: !!device,
        previewFailed,
    });

    useEffect(() => {
        if (!hasPermission) {
            requestPermission();
        }
    }, [hasPermission, requestPermission]);

    useEffect(() => {
        onHasTorchChange?.(hasTorch);
    }, [hasTorch, onHasTorchChange]);

    const retry = useCallback(() => {
        setPreviewFailed(false);
        setAttempt((value) => value + 1);
    }, []);

    const onCodeScanned = useCallback(
        (codes: Code[]) => {
            const value = codes[0]?.value;
            if (value) {
                onRead(value);
            }
        },
        [onRead],
    );

    const codeScanner = useCodeScanner({
        codeTypes: ['qr'],
        onCodeScanned,
    });

    if (phase === 'permission') {
        return notAuthorizedView;
    }

    if (phase === 'unavailable' || !device) {
        return renderUnavailable?.(retry) ?? notAuthorizedView;
    }

    return (
        <View style={[AppStyles.flex1, style]}>
            <Camera
                key={attempt}
                style={[StyleSheet.absoluteFill, styles.noDevice]}
                device={device}
                isActive
                audio={false}
                torch={cameraTorchState(torchEnabled, hasTorch)}
                codeScanner={codeScanner}
                onError={() => setPreviewFailed(true)}
            />
            {children}
        </View>
    );
};

export default CameraScanner;
