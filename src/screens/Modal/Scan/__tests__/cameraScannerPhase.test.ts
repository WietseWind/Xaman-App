import { cameraScannerPhase } from '../cameraScannerPhase';

describe('cameraScannerPhase', () => {
    it('asks for permission before it tries to show a preview', () => {
        expect(cameraScannerPhase({
            hasPermission: false,
            hasDevice: false,
            previewFailed: false,
        })).toBe('permission');
    });

    it('shows the live preview only when a camera is available and has not failed', () => {
        expect(cameraScannerPhase({
            hasPermission: true,
            hasDevice: true,
            previewFailed: false,
        })).toBe('preview');
    });

    it('does not leave a blank screen when the camera is missing or the preview fails', () => {
        expect(cameraScannerPhase({
            hasPermission: true,
            hasDevice: false,
            previewFailed: false,
        })).toBe('unavailable');
        expect(cameraScannerPhase({
            hasPermission: true,
            hasDevice: true,
            previewFailed: true,
        })).toBe('unavailable');
    });
});
