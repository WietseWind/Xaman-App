import { NativeModules } from 'react-native';

export type XAppPalette = {
    background: string;
    foreground: '#000000' | '#ffffff';
    edgeColors?: string[];
    transparentEdges?: boolean;
};
type RGB = [number, number, number];

const hexColor = (rgb: number[]) => `#${rgb.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
const luminance = (rgb: number[]) => {
    const linear = rgb.map(channel => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
};
const paletteForRGB = (rgb: number[]): XAppPalette => {
    const lightness = luminance(rgb);
    return { background: hexColor(rgb), foreground: (lightness + 0.05) / 0.05 >= 1.05 / (lightness + 0.05)
        ? '#000000' : '#ffffff' };
};

// Cluster a small native ARGB sample, ignoring transparent pixels. Quantizing
// similar shades avoids letting antialiasing split the main icon color.
function dominantRGB(pixels: number[]): RGB | undefined {
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
    return [dominant.red, dominant.green, dominant.blue].map(channel => Math.round(channel / dominant!.weight)) as RGB;
}

export function dominantImagePalette(pixels: number[]): XAppPalette | undefined {
    const source = dominantRGB(pixels);
    if (!source) return undefined;
    // Give colorful artwork a clearer light tint, but keep near-neutral icons
    // close to their source so black/white tiles do not become grey panels.
    const chroma = Math.max(...source) - Math.min(...source);
    const tint = 0.03 + 0.25 * Math.min(1, chroma / 48);
    const rgb = source.map(value => Math.round(value + (255 - value) * tint));
    // Native samples are 32x32. Inspect the middle of each edge, avoiding the
    // rounded corners. Transparent edges reveal the icon's themed backing.
    const sides = pixels.length >= 1024 ? [0, 1, 2, 3].map(side => Array.from({ length: 16 }, (_, n) => {
        const i = n + 8;
        return pixels[[i, 31 * 32 + i, i * 32, i * 32 + 31][side]];
    })) : [pixels];
    const edgeColors = [...new Set(sides.map(dominantRGB).filter((value): value is RGB => !!value).map(hexColor))];
    return { ...paletteForRGB(rgb), edgeColors,
        transparentEdges: sides.some(side => side.some(pixel => ((pixel >>> 24) & 255) < 255)) };
}

const readRGB = (color: string): RGB | undefined => {
    let hex = color.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(channel => channel + channel).join('');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return undefined;
    return [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16)) as RGB;
};

// Equal brightness alone does not mean equal color. Require both a small RGB
// difference and low luminance contrast before nudging a surface.
const separation = (a: number[], b: number[]) => {
    const distance = Math.max(...a.map((channel, i) => Math.abs(channel - b[i])));
    const x = luminance(a); const y = luminance(b);
    const contrast = (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    return Math.max(distance / 8, (contrast - 1) / 0.06);
};

// Resolve at render time so the URI cache stays independent of the theme.
// Keep the page distinct first, then separate matching icon edges using the
// smallest useful nudge, capped at 4% toward white/black to retain the hue.
export function resolveXAppPalette(palette: XAppPalette, pageColor: string, iconBacking?: string): XAppPalette {
    const rgb = readRGB(palette.background); const page = readRGB(pageColor);
    if (!rgb || !page) return palette;
    const edges = (palette.edgeColors ?? []).map(readRGB).filter((value): value is RGB => !!value);
    const backing = iconBacking && readRGB(iconBacking);
    if (palette.transparentEdges && backing) edges.push(backing);
    const edgeScore = (candidate: number[]) => Math.min(...edges.map(edge => separation(candidate, edge)));
    const pageNear = separation(rgb, page) < 1;
    if (!pageNear && edgeScore(rgb) >= 1) return palette;
    const darkPage = luminance(page) < 0.5;
    const preferred = pageNear ? (darkPage ? 255 : 0) : (darkPage ? 0 : 255);
    let best: number[] | undefined = pageNear ? undefined : rgb;
    let bestScore = best ? edgeScore(best) : -Infinity;
    for (let step = 1; step <= 4; step++) {
        for (const target of [preferred, 255 - preferred]) {
            const candidate = rgb.map(value => Math.round(value + (target - value) * step / 100));
            if (separation(candidate, page) < 1) continue;
            const score = edgeScore(candidate);
            if (score >= 1) return { ...palette, ...paletteForRGB(candidate) };
            if (score > bestScore) { best = candidate; bestScore = score; }
        }
    }
    return best && best !== rgb ? { ...palette, ...paletteForRGB(best) } : palette;
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
