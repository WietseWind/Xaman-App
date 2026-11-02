import { NativeModules } from 'react-native';

export type XAppPalette = { background: string; foreground: '#000000' | '#ffffff' };

// Cluster a small native ARGB sample, ignoring transparent pixels. Quantizing
// similar shades avoids letting antialiasing split the main icon color.
export function dominantImagePalette(pixels: number[]): XAppPalette | undefined {
    const bins = new Map<number, { weight: number; red: number; green: number; blue: number }>();
    pixels.slice(0, 1024).forEach(pixel => {
        if (!Number.isInteger(pixel)) return;
        const alpha = (pixel >>> 24) & 255;
        if (alpha < 128) return;
        const red = (pixel >>> 16) & 255; const green = (pixel >>> 8) & 255; const blue = pixel & 255;
        const key = ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4);
        const bin = bins.get(key) ?? { weight: 0, red: 0, green: 0, blue: 0 };
        bin.weight += alpha; bin.red += red * alpha; bin.green += green * alpha; bin.blue += blue * alpha;
        bins.set(key, bin);
    });
    let dominant: ReturnType<typeof bins.get>;
    bins.forEach(bin => { if (!dominant || bin.weight > dominant.weight) dominant = bin; });
    if (!dominant) return undefined;
    const rgb = [dominant.red, dominant.green, dominant.blue].map(channel => Math.round(channel / dominant!.weight));
    const background = `#${rgb.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
    const linear = rgb.map(channel => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    return { background, foreground: (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05)
        ? '#000000' : '#ffffff' };
}

// Per-URI deduplication, two concurrent samples and a bounded session cache.
// Colors come from the image, so they remain valid across theme changes.
const cache = new Map<string, { palette?: XAppPalette; expires: number }>();
const pending = new Map<string, Promise<XAppPalette | undefined>>();
const queue: Array<() => void> = [];
let active = 0;

export function getXAppPalette(uri: string): Promise<XAppPalette | undefined> {
    const cached = cache.get(uri);
    if (cached && cached.expires > Date.now()) {
        cache.delete(uri); cache.set(uri, cached);
        return Promise.resolve(cached.palette);
    }
    const existing = pending.get(uri);
    if (existing) return existing;
    const sampleImage = NativeModules.AppUtilsModule?.getImageSample;
    if (!uri || !sampleImage) return Promise.resolve(undefined);
    const result = new Promise<XAppPalette | undefined>(resolve => {
        const start = async () => {
            active++;
            let timer: ReturnType<typeof setTimeout> | undefined;
            let palette: XAppPalette | undefined;
            try {
                const pixels = await Promise.race([
                    Promise.resolve().then(() => sampleImage(uri)),
                    new Promise<undefined>(done => { timer = setTimeout(() => done(undefined), 8000); }),
                ]);
                if (Array.isArray(pixels)) palette = dominantImagePalette(pixels);
            } catch { /* A failed or unsupported icon keeps the current theme surface. */ }
            finally {
                clearTimeout(timer);
                cache.delete(uri);
                cache.set(uri, { palette, expires: palette ? Infinity : Date.now() + 30000 });
                if (cache.size > 128) cache.delete(cache.keys().next().value!);
                pending.delete(uri); active--; resolve(palette); queue.shift()?.();
            }
        };
        if (active < 2) start(); else queue.push(start);
    });
    pending.set(uri, result);
    return result;
}
