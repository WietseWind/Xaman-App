import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, LayoutChangeEvent, NativeModules, View } from 'react-native';

import { watchAndroidKeyboardGeometry } from './androidKeyboardGeometry';

/** Native keyboardTop and measureInWindow share an origin and DP units. */
export const paneHeightAboveKeyboard = (height: number, originY: number, keyboardTop: number): number => (
    Math.max(0, Math.min(height, keyboardTop - originY))
);

/** One bounded viewport owner; this never changes input focus or app window bounds. */
export const useAndroidPaneKeyboard = (
    active: boolean,
    viewport: RefObject<View>,
    width: number,
    height: number,
) => {
    const key = active ? `${width}:${height}` : '';
    const [layout, setLayout] = useState<{ key: string; width: number; height: number }>();
    const [available, setAvailable] = useState<{ key: string; height: number }>();
    const querySignal = useRef<() => void>(() => undefined);
    const measured = active && layout?.key === key ? layout : { width, height };

    useEffect(() => {
        let alive = true;
        let revision = 0;
        let showIntent = false;
        let confirmedVisible = false;
        let releaseGeometry: (() => void) | undefined;
        const stopGeometry = () => {
            const release = releaseGeometry;
            releaseGeometry = undefined;
            release?.();
        };
        const hide = () => {
            revision += 1;
            showIntent = false;
            confirmedVisible = false;
            stopGeometry();
            if (alive) setAvailable(undefined);
        };
        const getter = NativeModules.KeyboardModule?.getWindowGeometry;
        if (!active || typeof getter !== 'function') {
            setAvailable(undefined);
            return undefined;
        }
        const startGeometry = () => {
            if (releaseGeometry) return;
            releaseGeometry = () => undefined;
            const release = watchAndroidKeyboardGeometry(() => querySignal.current());
            if (releaseGeometry) releaseGeometry = release;
            else release();
        };
        const query = () => {
            const current = ++revision;
            Promise.resolve().then(() => getter()).then((geometry) => {
                if (!alive || current !== revision) return;
                if (geometry?.visible === false) {
                    // A first Show can precede the settled inset. Keep its frame lease
                    // until visibility is confirmed or the native Hide arrives.
                    if (confirmedVisible || !showIntent) hide();
                    return;
                }
                if (geometry?.visible !== true || !Number.isFinite(geometry.keyboardTop)) return;
                confirmedVisible = true;
                showIntent = true;
                startGeometry();
                const node = viewport.current;
                node?.measureInWindow((_x, y, _width, actualHeight) => {
                    if (!alive || current !== revision || node !== viewport.current ||
                        !Number.isFinite(y) || !Number.isFinite(actualHeight) || actualHeight <= 0) return;
                    const next = paneHeightAboveKeyboard(actualHeight, y, geometry.keyboardTop);
                    setAvailable((previous) => previous?.key === key && previous.height === next
                        ? previous : { key, height: next });
                });
            }, () => undefined);
        };
        querySignal.current = query;
        const show = Keyboard.addListener('keyboardDidShow', () => {
            showIntent = true;
            startGeometry();
            query();
        });
        const hidden = Keyboard.addListener('keyboardDidHide', hide);
        query();
        return () => {
            alive = false;
            revision += 1;
            querySignal.current = () => undefined;
            stopGeometry();
            show.remove();
            hidden.remove();
        };
    }, [active, key, viewport]);

    const onLayout = useCallback((event: LayoutChangeEvent) => {
        if (!active) return;
        const next = event.nativeEvent.layout;
        if (!(next.width > 0) || !(next.height > 0)) return;
        setLayout((previous) => previous?.key === key && previous.width === next.width &&
            previous.height === next.height
            ? previous : { key, width: next.width, height: next.height });
        querySignal.current();
    }, [active, key]);

    return {
        width: measured.width,
        height: measured.height,
        availableHeight: active && available?.key === key ? available.height : measured.height,
        onLayout,
    };
};
