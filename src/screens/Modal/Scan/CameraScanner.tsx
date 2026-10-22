/**
 * Back-camera QR preview. Visual chrome stays in ScanModal.
 */
import React, { useCallback, useEffect } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Camera, Code, useCameraDevice, useCameraPermission, useCodeScanner } from 'react-native-vision-camera';

import { AppColors, AppStyles } from '@theme';

import { cameraTorchState } from './torch';

interface Props extends React.PropsWithChildren {
    onRead: (data: string) => void;
    notAuthorizedView: React.ReactNode;
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
    style,
    children,
    torchEnabled = false,
    onHasTorchChange,
}: Props) => {
    const device = useCameraDevice('back');
    const { hasPermission, requestPermission } = useCameraPermission();
    const hasTorch = !!device?.hasTorch;

    useEffect(() => {
        if (!hasPermission) {
            requestPermission();
        }
    }, [hasPermission, requestPermission]);

    useEffect(() => {
        onHasTorchChange?.(hasTorch);
    }, [hasTorch, onHasTorchChange]);

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

    if (!hasPermission) {
        return notAuthorizedView;
    }

    return (
        <View style={[AppStyles.flex1, style]}>
            {device ? (
                <Camera
                    style={StyleSheet.absoluteFill}
                    device={device}
                    isActive
                    audio={false}
                    torch={cameraTorchState(torchEnabled, hasTorch)}
                    codeScanner={codeScanner}
                />
            ) : (
                <View style={[StyleSheet.absoluteFill, styles.noDevice]} />
            )}
            {children}
        </View>
    );
};

export default CameraScanner;
