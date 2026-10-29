import {
    cameraErrorStopsPreview,
    cameraScannerPhase,
    nextCameraAuthorization,
    shouldRequestCameraPermission,
} from '../cameraScannerPhase';

describe('cameraScannerPhase', () => {
    it('asks for permission only when the system has not granted the camera', () => {
        expect(shouldRequestCameraPermission('not-determined')).toBe(true);
        expect(shouldRequestCameraPermission('granted')).toBe(false);
        expect(shouldRequestCameraPermission('denied')).toBe(false);
        expect(shouldRequestCameraPermission('restricted')).toBe(false);
        expect(nextCameraAuthorization('granted', 'not-determined')).toBe('granted');
        expect(nextCameraAuthorization('granted', 'denied')).toBe('denied');
        expect(cameraScannerPhase({
            permissionStatus: 'not-determined',
            hasDevice: true,
            previewFailed: false,
        })).toBe('permission');
        expect(cameraScannerPhase({
            permissionStatus: 'denied',
            hasDevice: true,
            previewFailed: false,
        })).toBe('permission');
    });

    it('shows the live preview only when access is already granted and the preview has not failed', () => {
        expect(cameraScannerPhase({
            permissionStatus: 'granted',
            hasDevice: true,
            previewFailed: false,
        })).toBe('preview');
    });

    it('keeps a granted camera on the fallback instead of a permission prompt', () => {
        expect(cameraScannerPhase({
            permissionStatus: 'granted',
            hasDevice: false,
            previewFailed: false,
        })).toBe('unavailable');
        expect(cameraScannerPhase({
            permissionStatus: 'granted',
            hasDevice: true,
            previewFailed: true,
        })).toBe('unavailable');
        expect(cameraScannerPhase({
            permissionStatus: 'granted',
            hasDevice: true,
            previewFailed: false,
            holdFallback: true,
        })).toBe('unavailable');
    });

    it('treats a stopped camera session as a failed preview', () => {
        expect(cameraErrorStopsPreview({
            nativeEvent: {
                message: 'The camera preview stopped because the camera is not available.',
            },
        })).toBe(true);
        expect(cameraScannerPhase({
            permissionStatus: 'granted',
            hasDevice: true,
            previewFailed: cameraErrorStopsPreview(undefined),
        })).toBe('unavailable');
    });
});
