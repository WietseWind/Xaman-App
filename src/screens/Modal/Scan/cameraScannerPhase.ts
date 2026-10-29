export type CameraScannerPhase = 'permission' | 'preview' | 'unavailable';

export type CameraAuthorization = 'granted' | 'denied' | 'not-determined' | 'restricted';

/**
 * iOS only shows the system camera prompt when the status is not-determined.
 * Granted and denied must not call requestAccess again.
 */
export const shouldRequestCameraPermission = (status: CameraAuthorization): boolean =>
    status === 'not-determined';

/** A granted camera must not be asked again when iOS briefly reports not-determined. */
export const nextCameraAuthorization = (
    current: CameraAuthorization,
    reported: CameraAuthorization,
): CameraAuthorization => {
    if (current === 'granted' && reported === 'not-determined') {
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
