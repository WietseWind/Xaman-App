import { NativeModules } from 'react-native';
import { GetElapsedRealtime } from '../device';

afterEach(() => jest.restoreAllMocks());

it.each([0, 1337, 0.25, '0', '1337', '1337.25'])('accepts valid native uptime %p', async (value) => {
    jest.spyOn(NativeModules.DeviceUtilsModule, 'getElapsedRealtime').mockResolvedValue(value);
    await expect(GetElapsedRealtime()).resolves.toBe(Number(value));
});

it.each([
    undefined, null, true, false, '', ' ', 'not-a-clock', 'NaN', NaN,
    Infinity, -Infinity, 'Infinity', -1, '-1', {}, [],
])(
    'rejects invalid native uptime %p',
    async (value) => {
        jest.spyOn(NativeModules.DeviceUtilsModule, 'getElapsedRealtime').mockResolvedValue(value);
        await expect(GetElapsedRealtime()).rejects.toThrow('Invalid elapsed real time');
    },
);

it('propagates a native rejection to its caller', async () => {
    const error = new Error('native clock unavailable');
    jest.spyOn(NativeModules.DeviceUtilsModule, 'getElapsedRealtime').mockRejectedValue(error);
    await expect(GetElapsedRealtime()).rejects.toBe(error);
});

it('turns a synchronous bridge exception into a rejected promise', async () => {
    jest.spyOn(NativeModules.DeviceUtilsModule, 'getElapsedRealtime').mockImplementation(() => {
        throw new Error('bridge unavailable');
    });
    await expect(GetElapsedRealtime()).rejects.toThrow('bridge unavailable');
});
