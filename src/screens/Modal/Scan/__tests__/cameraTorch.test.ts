import { cameraTorchState } from '../torch';

describe('cameraTorchState', () => {
    it('starts off even when the device has a torch', () => {
        expect(cameraTorchState(false, true)).toBe('off');
    });

    it('turns on only when enabled and a torch is available', () => {
        expect(cameraTorchState(true, true)).toBe('on');
        expect(cameraTorchState(true, false)).toBe('off');
        expect(cameraTorchState(false, false)).toBe('off');
    });
});
