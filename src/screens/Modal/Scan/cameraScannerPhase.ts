export type CameraScannerPhase = 'permission' | 'preview' | 'unavailable';

export type CameraAuthorization = 'granted' | 'denied' | 'not-determined' | 'restricted';

/**
 * Android reports denied before the first request as well as after a permanent
 * denial. One bounded request is needed to distinguish these states.
 */
export const shouldRequestCameraPermission = (status: CameraAuthorization, platform = 'ios'): boolean =>
    status === 'not-determined' || (platform === 'android' && status === 'denied');

/** A granted camera must not be asked again when iOS briefly reports not-determined. */
export const nextCameraAuthorization = (
    current: CameraAuthorization,
    reported: CameraAuthorization,
    platform = 'ios',
): CameraAuthorization => {
    if (platform === 'ios' && current === 'granted' && reported === 'not-determined') {
        return current;
    }
    return reported;
};

/**
 * Permission only when the system has not granted the camera.
 * A granted camera whose preview is down, or a retry still in flight, stays on the
 * fallback instead of flashing a blank preview or asking again.
 */
export const cameraScannerPhase = ({
    permissionStatus,
    hasDevice,
    previewFailed,
    holdFallback = false,
}: {
    permissionStatus: CameraAuthorization;
    hasDevice: boolean;
    previewFailed: boolean;
    holdFallback?: boolean;
}): CameraScannerPhase => {
    if (permissionStatus !== 'granted') {
        return 'permission';
    }
    if (!hasDevice || previewFailed || holdFallback) {
        return 'unavailable';
    }
    return 'preview';
};

/**
 * A vision-camera error means the preview session stopped.
 * Leaving the camera view mounted is the black crosshair screen.
 */
export const cameraErrorStopsPreview = (error: unknown): boolean => {
    // Camera.onError already means the session stopped. An empty payload is the same failure.
    if (error === undefined) {
        return true;
    }
    return true;
};
