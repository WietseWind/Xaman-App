/**
 * Back-camera QR preview. Visual chrome stays in ScanModal.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, View, ViewStyle } from 'react-native';
import { Camera, Code, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';

import { AppColors, AppStyles } from '@theme';

import {
    CameraAuthorization,
    cameraErrorStopsPreview,
    cameraScannerPhase,
    nextCameraAuthorization,
    shouldRequestCameraPermission,
} from './cameraScannerPhase';
import { cameraTorchState } from './torch';

const readCameraAuthorization = (): CameraAuthorization => {
    const status = Camera.getCameraPermissionStatus();
    if (
        status === 'granted' ||
        status === 'denied' ||
        status === 'not-determined' ||
        status === 'restricted'
    ) {
        return status;
    }
    return 'not-determined';
};

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
    const [permissionStatus, setPermissionStatus] = useState(readCameraAuthorization);
    const [previewFailed, setPreviewFailed] = useState(false);
    const [holdFallback, setHoldFallback] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const hasTorch = !!device?.hasTorch;
    const phase = cameraScannerPhase({
        permissionStatus,
        hasDevice: !!device,
        previewFailed,
        holdFallback,
    });

    useEffect(() => {
        const subscription = AppState.addEventListener('change', () => {
            setPermissionStatus((current) => nextCameraAuthorization(current, readCameraAuthorization()));
        });
        return () => subscription.remove();
    }, []);

    useEffect(() => {
        if (!shouldRequestCameraPermission(permissionStatus)) {
            return undefined;
        }
        let cancelled = false;
        Camera.requestCameraPermission().then((result) => {
            if (!cancelled) {
                setPermissionStatus(result === 'granted' ? 'granted' : 'denied');
            }
        });
        return () => {
            cancelled = true;
        };
    }, [permissionStatus]);

    useEffect(() => {
        onHasTorchChange?.(hasTorch);
    }, [hasTorch, onHasTorchChange]);

    const retry = useCallback(() => {
        setHoldFallback(true);
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

    const showFallback = phase === 'unavailable' || !device;

    return (
        <View style={[AppStyles.flex1, style]}>
            {!!device && !previewFailed && (
                <Camera
                    key={attempt}
                    style={[StyleSheet.absoluteFill, styles.noDevice]}
                    device={device}
                    isActive
                    audio={false}
                    torch={cameraTorchState(torchEnabled, hasTorch)}
                    codeScanner={codeScanner}
                    onStarted={() => {
                        setHoldFallback(false);
                        setPreviewFailed(false);
                    }}
                    onError={(error) => {
                        if (cameraErrorStopsPreview(error)) {
                            setHoldFallback(false);
                            setPreviewFailed(true);
                        }
                    }}
                />
            )}
            {showFallback ? renderUnavailable?.(retry) ?? notAuthorizedView : children}
        </View>
    );
};

export default CameraScanner;
