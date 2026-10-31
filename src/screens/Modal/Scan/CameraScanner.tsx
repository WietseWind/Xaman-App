/**
 * Back-camera QR preview. Visual chrome stays in ScanModal.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, PermissionsAndroid, Platform, StyleSheet, View, ViewStyle } from 'react-native';
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
    try {
        const status = Camera.getCameraPermissionStatus();
        if (
            status === 'granted' ||
            status === 'denied' ||
            status === 'not-determined' ||
            status === 'restricted'
        ) {
            return status;
        }
    } catch {
        // A failed status read must not mount the camera.
    }
    return 'denied';
};

interface Props extends React.PropsWithChildren {
    onRead: (data: string) => void;
    renderNotAuthorized: (
        requestPermission: () => void,
        settingsRequired: boolean,
        requesting: boolean,
    ) => React.ReactNode;
    renderUnavailable?: (retry: () => void) => React.ReactNode;
    style?: ViewStyle | ViewStyle[];
    torchEnabled?: boolean;
    onHasTorchChange?: (hasTorch: boolean) => void;
    visible?: boolean;
    canUseCamera?: (activityEpoch?: number) => boolean;
    activityEpoch?: number;
}

const styles = StyleSheet.create({
    noDevice: {
        backgroundColor: AppColors.black,
    },
});

const CameraScanner = ({
    onRead,
    renderNotAuthorized,
    renderUnavailable,
    style,
    children,
    torchEnabled = false,
    onHasTorchChange,
    visible = true,
    canUseCamera,
    activityEpoch = 0,
}: Props) => {
    const device = useCameraDevice('back');
    const [permissionStatus, setPermissionStatus] = useState(readCameraAuthorization);
    const [previewFailed, setPreviewFailed] = useState(false);
    const [holdFallback, setHoldFallback] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [appActive, setAppActive] = useState(AppState.currentState === 'active');
    const [requesting, setRequesting] = useState(false);
    const [androidBlocked, setAndroidBlocked] = useState(false);
    const [sessionEpoch, setSessionEpoch] = useState(0);
    const mounted = useRef(true);
    const active = useRef(appActive);
    const shown = useRef(visible);
    const authorization = useRef(permissionStatus);
    const blocked = useRef(androidBlocked);
    const autoAttempted = useRef(false);
    const permissionEpoch = useRef(0);
    const inFlight = useRef<symbol>();
    const onReadCurrent = useRef(onRead);
    const liveCamera = useRef<symbol>();
    const sessionGeneration = useRef(0);
    const policy = useRef(canUseCamera);
    const activity = useRef(activityEpoch);
    policy.current = canUseCamera;
    activity.current = activityEpoch;
    const allowed = useCallback((epoch?: number) => {
        try {
            return policy.current ? policy.current(epoch) === true : true;
        } catch {
            return false;
        }
    }, []);
    const cameraAllowed = allowed();
    const renderedGeneration = sessionGeneration.current;
    const cameraToken = useMemo(() => Symbol('camera'), [
        attempt, device?.id, permissionStatus, sessionEpoch, appActive, visible, cameraAllowed, activityEpoch,
    ]);
    shown.current = visible;
    onReadCurrent.current = onRead;
    const hasTorch = !!device?.hasTorch;
    const phase = cameraScannerPhase({
        permissionStatus,
        hasDevice: !!device,
        previewFailed,
        holdFallback,
    });
    liveCamera.current = permissionStatus === 'granted' && !!device && !previewFailed &&
        appActive && visible && cameraAllowed ? cameraToken : undefined;
    const settingsRequired = permissionStatus === 'restricted' ||
        (Platform.OS === 'ios' && permissionStatus === 'denied') || androidBlocked;

    const refreshAuthorization = useCallback(() => {
        if (!mounted.current || !allowed()) return;
        const next = nextCameraAuthorization(authorization.current, readCameraAuthorization(), Platform.OS);
        if (next !== authorization.current) {
            permissionEpoch.current += 1;
            authorization.current = next;
            setPermissionStatus(next);
            if (next === 'granted') {
                blocked.current = false;
                setAndroidBlocked(false);
                setPreviewFailed(false);
                setHoldFallback(false);
            }
        }
    }, [allowed]);

    useEffect(() => {
        mounted.current = true;
        const subscription = AppState.addEventListener('change', (state) => {
            const nextActive = state === 'active';
            if (active.current !== nextActive) {
                sessionGeneration.current += 1;
                liveCamera.current = undefined;
                setSessionEpoch((value) => value + 1);
            }
            active.current = nextActive;
            setAppActive(nextActive);
            if (nextActive) refreshAuthorization();
        });
        return () => {
            mounted.current = false;
            liveCamera.current = undefined;
            permissionEpoch.current += 1;
            inFlight.current = undefined;
            subscription.remove();
        };
    }, [refreshAuthorization]);

    const requestPermission = useCallback(() => {
        if (!mounted.current || !active.current || !shown.current || !allowed() || inFlight.current ||
            authorization.current === 'granted') return;
        const token = Symbol('permission');
        const epoch = ++permissionEpoch.current;
        const requestActivity = activity.current;
        const needsSettings = authorization.current === 'restricted' || blocked.current ||
            (Platform.OS === 'ios' && authorization.current === 'denied');
        inFlight.current = token;
        setRequesting(true);
        const run = async () => {
            try {
                if (needsSettings) {
                    await Linking.openSettings();
                    return;
                }
                const result = Platform.OS === 'android'
                    ? await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA)
                    : await Camera.requestCameraPermission();
                if (!mounted.current || inFlight.current !== token || !allowed(requestActivity) ||
                    activity.current !== requestActivity) return;
                if (permissionEpoch.current !== epoch) {
                    // A foreground read can report denial before Android returns
                    // NEVER_ASK_AGAIN. Retain that metadata without changing a newer grant.
                    if (authorization.current !== 'granted' &&
                        result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
                        blocked.current = true;
                        setAndroidBlocked(true);
                    }
                    return;
                }
                const next = result === 'granted' ? 'granted' : 'denied';
                blocked.current = result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
                authorization.current = next;
                setAndroidBlocked(blocked.current);
                setPermissionStatus(next);
            } catch {
                // Leave access closed and keep the explicit action available for retry.
            } finally {
                if (mounted.current && inFlight.current === token) {
                    inFlight.current = undefined;
                    setRequesting(false);
                }
            }
        };
        run();
    }, [allowed]);

    useEffect(() => {
        if (appActive && visible && cameraAllowed) refreshAuthorization();
    }, [appActive, visible, cameraAllowed, activityEpoch, refreshAuthorization]);

    useEffect(() => {
        if (!appActive || !visible || !cameraAllowed || !allowed() || autoAttempted.current) return;
        autoAttempted.current = true;
        if (shouldRequestCameraPermission(authorization.current, Platform.OS)) requestPermission();
    }, [appActive, visible, cameraAllowed, allowed, requestPermission]);

    useEffect(() => {
        onHasTorchChange?.(hasTorch);
    }, [hasTorch, onHasTorchChange]);

    const retry = useCallback(() => {
        if (!mounted.current || !active.current || !shown.current || !allowed()) return;
        setHoldFallback(true);
        setPreviewFailed(false);
        setAttempt((value) => value + 1);
    }, [allowed]);

    const onCodeScanned = useCallback(
        (codes: Code[]) => {
            if (!mounted.current || !active.current || !shown.current || !allowed(activityEpoch) ||
                activity.current !== activityEpoch || sessionGeneration.current !== renderedGeneration ||
                liveCamera.current !== cameraToken) return;
            const value = codes[0]?.value;
            if (value) {
                onReadCurrent.current(value);
            }
        },
        [cameraToken, allowed, activityEpoch, renderedGeneration],
    );

    const codeScanner = useCodeScanner({
        codeTypes: ['qr'],
        onCodeScanned,
    });

    if (!appActive || !visible || !cameraAllowed) {
        return <View testID="scan-camera-paused-view" style={[AppStyles.flex1, style]} />;
    }

    if (phase === 'permission') {
        return renderNotAuthorized(requestPermission, settingsRequired, requesting);
    }

    const showFallback = phase === 'unavailable' || !device;

    return (
        <View style={[AppStyles.flex1, style]}>
            {!!device && !previewFailed && (
                <Camera
                    key={`${attempt}:${sessionEpoch}:${activityEpoch}`}
                    testID="scan-camera-preview"
                    style={[StyleSheet.absoluteFill, styles.noDevice]}
                    device={device}
                    isActive={appActive && visible && cameraAllowed}
                    audio={false}
                    torch={cameraTorchState(torchEnabled, hasTorch)}
                    codeScanner={codeScanner}
                    onStarted={() => {
                        if (!mounted.current || !active.current || !shown.current || !allowed(activityEpoch) ||
                            activity.current !== activityEpoch || sessionGeneration.current !== renderedGeneration ||
                            liveCamera.current !== cameraToken) return;
                        setHoldFallback(false);
                        setPreviewFailed(false);
                    }}
                    onError={(error) => {
                        if (!mounted.current || !active.current || !shown.current || !allowed(activityEpoch) ||
                            activity.current !== activityEpoch || sessionGeneration.current !== renderedGeneration ||
                            liveCamera.current !== cameraToken) return;
                        if (cameraErrorStopsPreview(error)) {
                            liveCamera.current = undefined;
                            setHoldFallback(false);
                            setPreviewFailed(true);
                        }
                    }}
                />
            )}
            {showFallback
                ? renderUnavailable?.(retry) ?? renderNotAuthorized(requestPermission, settingsRequired, requesting)
                : children}
        </View>
    );
};

export default CameraScanner;
