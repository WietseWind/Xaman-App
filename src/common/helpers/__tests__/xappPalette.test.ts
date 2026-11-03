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

it('lightens the dominant cluster without averaging distinct icon colors', () => {
    expect(helper.dominantImagePalette([...Array(700).fill(blue), ...Array(324).fill(0xffff0000)]))
        .toMatchObject({ background: '#476adc', foreground: '#ffffff' });
});

it('groups antialiased shades and ignores transparent/low-alpha pixels', () => {
    expect(helper.dominantImagePalette([...Array(400).fill(0xff1030a0), ...Array(300).fill(0xff1131a1),
        ...Array(200).fill(0xffffffff), ...Array(124).fill(0x00123456)]))
        .toMatchObject({ background: '#536abb', foreground: '#ffffff' });
    expect(helper.dominantImagePalette([0, 0x7fffffff, NaN, Infinity, 1.2])).toBeUndefined();
    expect(helper.dominantImagePalette([])).toBeUndefined();
});

it.each([0x000000, 0xffffff, 0xffc900, 0xdf0070, 0x0030cf, 0x777777])(
    'chooses caption ink with at least 4.5:1 contrast for color %i', rgb => {
        const palette = helper.dominantImagePalette([0xff000000 + rgb])!;
        const finalRGB = parseInt(palette.background.slice(1), 16);
        const channels = [(finalRGB >> 16) & 255, (finalRGB >> 8) & 255, finalRGB & 255].map(channel => {
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
    await expect(first).resolves.toMatchObject({ background: '#476adc' });
    await helper.getXAppPalette('https://example.com/icon.png');
    expect(sample).toHaveBeenCalledTimes(1);
});

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const lightness = (hex: string) => rgb(hex).map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a: string, b: string) =>
    (Math.max(lightness(a), lightness(b)) + 0.05) / (Math.min(lightness(a), lightness(b)) + 0.05);
const visiblySeparate = (a: string, b: string) =>
    Math.max(...rgb(a).map((channel, i) => Math.abs(channel - rgb(b)[i]))) >= 8 || contrast(a, b) >= 1.06;

it.each(['#ffffff', '#000000', '#181a21', '#030b36'])(
    'separates an almost matching tile from page %s with a small theme-aware nudge', page => {
        const original = { background: page, foreground: '#ffffff' as const };
        const resolved = helper.resolveXAppPalette(original, page);
        expect(visiblySeparate(resolved.background, page)).toBe(true);
        expect(lightness(resolved.background) > lightness(page)).toBe(page !== '#ffffff');
        expect(Math.max(...rgb(resolved.background).map((channel, i) => Math.abs(channel - rgb(page)[i]))))
            .toBeLessThanOrEqual(10);
        expect(contrast(resolved.background, resolved.foreground)).toBeGreaterThanOrEqual(4.5);
        expect(original.background).toBe(page);
    },
);

it('detects actual icon edge colors independently of its dominant center', () => {
    const pixels = Array(1024).fill(blue);
    for (let i = 8; i < 24; i++) {
        [i, 31 * 32 + i, i * 32, i * 32 + 31].forEach(index => { pixels[index] = 0xff476adc; });
    }
    const original = helper.dominantImagePalette(pixels)!;
    expect(original.background).toBe('#476adc');
    expect(original.edgeColors).toEqual(['#476adc']);
    const resolved = helper.resolveXAppPalette(original, '#030b36');
    expect(visiblySeparate(resolved.background, '#476adc')).toBe(true);
    expect(contrast(resolved.background, resolved.foreground)).toBeGreaterThanOrEqual(4.5);
});

it('separates opaque white icon edges even when the page is dark', () => {
    const original = helper.dominantImagePalette(Array(1024).fill(0xffffffff))!;
    for (const page of ['#ffffff', '#000000', '#181a21', '#030b36']) {
        const resolved = helper.resolveXAppPalette(original, page);
        expect(visiblySeparate(resolved.background, '#ffffff')).toBe(true);
        expect(visiblySeparate(resolved.background, page)).toBe(true);
    }
    expect(original.background).toBe('#ffffff');
});

it('keeps black and white surfaces near their original tone instead of introducing grey panels', () => {
    const black = helper.dominantImagePalette(Array(1024).fill(0xff000000))!;
    const white = helper.dominantImagePalette(Array(1024).fill(0xffffffff))!;
    for (const page of ['#ffffff', '#000000', '#181a21', '#030b36']) {
        const dark = helper.resolveXAppPalette(black, page);
        const light = helper.resolveXAppPalette(white, page);
        expect(Math.max(...rgb(dark.background))).toBeLessThanOrEqual(10);
        expect(Math.min(...rgb(light.background))).toBeGreaterThanOrEqual(245);
        expect(visiblySeparate(dark.background, page)).toBe(true);
        expect(visiblySeparate(light.background, page)).toBe(true);
    }
});

it('uses the themed backing behind transparent icon edges', () => {
    const pixels = Array(1024).fill(0xff0030cf);
    for (let i = 0; i < 32; i++) {
        [i, 31 * 32 + i, i * 32, i * 32 + 31].forEach(index => { pixels[index] = 0; });
    }
    const sampled = helper.dominantImagePalette(pixels)!;
    expect(sampled).toMatchObject({ transparentEdges: true, edgeColors: [] });
    const original = { ...sampled, background: '#171924' };
    const resolved = helper.resolveXAppPalette(original, '#030b36', '#171924');
    expect(visiblySeparate(resolved.background, '#171924')).toBe(true);
    expect(visiblySeparate(resolved.background, '#030b36')).toBe(true);
    expect(helper.resolveXAppPalette(original, '#030b36', '#ffffff')).toBe(original);
});

it('preserves already distinct hues, including different colors with similar luminance', () => {
    const original = { background: '#ffcc00', foreground: '#000000' as const, edgeColors: ['#0030cf'] };
    expect(helper.resolveXAppPalette(original, '#030b36')).toBe(original);
    const bluePalette = { background: '#0000ff', foreground: '#ffffff' as const, edgeColors: ['#4c4c4c'] };
    expect(contrast(bluePalette.background, '#4c4c4c')).toBeLessThan(1.06);
    expect(helper.resolveXAppPalette(bluePalette, '#181a21')).toBe(bluePalette);
});

it('keeps captions readable and the cached source unchanged across colors and theme changes', () => {
    for (const color of [0x000000, 0xffffff, 0xffc900, 0xdf0070, 0x0030cf, 0x777777, 0x181a21, 0x030b36]) {
        const original = helper.dominantImagePalette(Array(1024).fill(0xff000000 + color))!;
        const saved = JSON.stringify(original);
        for (const page of ['#ffffff', '#000000', '#181a21', '#030b36']) {
            const resolved = helper.resolveXAppPalette(original, page, page === '#ffffff' ? '#ffffff' : '#171924');
            expect(visiblySeparate(resolved.background, page)).toBe(true);
            expect(contrast(resolved.background, resolved.foreground)).toBeGreaterThanOrEqual(4.5);
        }
        expect(JSON.stringify(original)).toBe(saved);
    }
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
    await expect(helper.getXAppPalette('bad')).resolves.toMatchObject({ background: '#476adc' });
    expect(sample).toHaveBeenCalledTimes(2);
});

it('times out stalled decoders so other queued icons can still get a palette', async () => {
    sample.mockImplementation(uri => uri === 'third' ? Promise.resolve([blue]) : new Promise(() => {}));
    const first = helper.getXAppPalette('first'); const second = helper.getXAppPalette('second');
    const third = helper.getXAppPalette('third');
    await flush(); jest.advanceTimersByTime(8000); await flush();
    await expect(first).resolves.toBeUndefined(); await expect(second).resolves.toBeUndefined();
    await expect(third).resolves.toMatchObject({ background: '#476adc' });
    expect(jest.getTimerCount()).toBe(0);
});

it('returns the theme fallback when no native sampler exists', async () => {
    delete native.AppUtilsModule.getImageSample;
    await expect(helper.getXAppPalette('unavailable')).resolves.toBeUndefined();
    expect(sample).not.toHaveBeenCalled();
});
