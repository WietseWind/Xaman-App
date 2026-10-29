export type CameraScannerPhase = 'permission' | 'preview' | 'unavailable';

/** Permission first. A granted camera that has no device or whose preview failed is not a silent blank screen. */
export const cameraScannerPhase = ({
    hasPermission,
    hasDevice,
    previewFailed,
}: {
    hasPermission: boolean;
    hasDevice: boolean;
    previewFailed: boolean;
}): CameraScannerPhase => {
    if (!hasPermission) {
        return 'permission';
    }
    if (!hasDevice || previewFailed) {
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
