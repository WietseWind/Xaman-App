jest.mock('react-native', () => ({ NativeModules: { AppUtilsModule: { getImageSample: jest.fn() } } }));

let helper: typeof import('../xappPalette');
let sample: jest.Mock;
let native: any;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const blue = 0xff0030cf;
beforeEach(() => {
    jest.useFakeTimers();
    jest.isolateModules(() => {
        helper = require('../xappPalette');
        native = require('react-native').NativeModules;
        sample = native.AppUtilsModule.getImageSample;
    });
    sample.mockResolvedValue([blue]);
});
afterEach(async () => {
    jest.runAllTimers(); await flush();
    jest.useRealTimers();
});

it('chooses the dominant cluster rather than averaging distinct icon colors', () => {
    expect(helper.dominantImagePalette([...Array(700).fill(blue), ...Array(324).fill(0xffff0000)]))
        .toEqual({ background: '#0030cf', foreground: '#ffffff' });
});

it('groups antialiased shades and ignores transparent/low-alpha pixels', () => {
    expect(helper.dominantImagePalette([...Array(400).fill(0xff1030a0), ...Array(300).fill(0xff1131a1),
        ...Array(200).fill(0xffffffff), ...Array(124).fill(0x00123456)]))
        .toEqual({ background: '#1030a0', foreground: '#ffffff' });
    expect(helper.dominantImagePalette([0, 0x7fffffff, NaN, Infinity, 1.2])).toBeUndefined();
    expect(helper.dominantImagePalette([])).toBeUndefined();
});

it.each([0x000000, 0xffffff, 0xffc900, 0xdf0070, 0x0030cf, 0x777777])(
    'chooses caption ink with at least 4.5:1 contrast for color %i', rgb => {
        const palette = helper.dominantImagePalette([0xff000000 + rgb])!;
        const channels = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255].map(channel => {
            const value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        const l = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        const contrast = palette.foreground === '#000000' ? (l + 0.05) / 0.05 : 1.05 / (l + 0.05);
        expect(contrast).toBeGreaterThanOrEqual(4.5);
    },
);

it('deduplicates concurrent tiles and reuses an image palette across later renders', async () => {
    const first = helper.getXAppPalette('https://example.com/icon.png');
    const second = helper.getXAppPalette('https://example.com/icon.png');
    expect(first).toBe(second);
    await expect(first).resolves.toMatchObject({ background: '#0030cf' });
    await helper.getXAppPalette('https://example.com/icon.png');
    expect(sample).toHaveBeenCalledTimes(1);
});

it('limits native sampling to two requests and starts the next queued image after completion', async () => {
    const resolves: Array<(pixels: number[]) => void> = [];
    sample.mockImplementation(() => new Promise(resolve => { resolves.push(resolve); }));
    const results = ['one', 'two', 'three'].map(uri => helper.getXAppPalette(uri));
    await flush(); expect(sample).toHaveBeenCalledTimes(2);
    resolves[0]([blue]); await flush(); expect(sample).toHaveBeenCalledTimes(3);
    resolves[1]([blue]); resolves[2]([blue]);
    await expect(Promise.all(results)).resolves.toHaveLength(3);
});

it('evicts the oldest palette after the bounded 128-entry cache fills', async () => {
    for (let i = 0; i < 129; i++) await helper.getXAppPalette(`icon-${i}`);
    expect(sample).toHaveBeenCalledTimes(129);
    await helper.getXAppPalette('icon-128'); expect(sample).toHaveBeenCalledTimes(129);
    await helper.getXAppPalette('icon-0'); expect(sample).toHaveBeenCalledTimes(130);
});

it.each(['reject', 'throw'])('keeps a safe fallback after native %s and retries after the failure TTL', async mode => {
    sample.mockImplementation(() => {
        if (mode === 'throw') throw new Error('Decode failed');
        return Promise.reject(new Error('Decode failed'));
    });
    await expect(helper.getXAppPalette('bad')).resolves.toBeUndefined();
    await helper.getXAppPalette('bad'); expect(sample).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(30001); sample.mockResolvedValue([blue]);
    await expect(helper.getXAppPalette('bad')).resolves.toMatchObject({ background: '#0030cf' });
    expect(sample).toHaveBeenCalledTimes(2);
});

it('times out stalled decoders so other queued icons can still get a palette', async () => {
    sample.mockImplementation(uri => uri === 'third' ? Promise.resolve([blue]) : new Promise(() => {}));
    const first = helper.getXAppPalette('first'); const second = helper.getXAppPalette('second');
    const third = helper.getXAppPalette('third');
    await flush(); jest.advanceTimersByTime(8000); await flush();
    await expect(first).resolves.toBeUndefined(); await expect(second).resolves.toBeUndefined();
    await expect(third).resolves.toMatchObject({ background: '#0030cf' });
    expect(jest.getTimerCount()).toBe(0);
});

it('returns the theme fallback when no native sampler exists', async () => {
    delete native.AppUtilsModule.getImageSample;
    await expect(helper.getXAppPalette('unavailable')).resolves.toBeUndefined();
    expect(sample).not.toHaveBeenCalled();
});
