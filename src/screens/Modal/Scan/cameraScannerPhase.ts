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
