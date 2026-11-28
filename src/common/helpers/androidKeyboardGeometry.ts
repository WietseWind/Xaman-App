import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

type Geometry = { keyboardTop: number; visible?: boolean };
type Listener = (geometry: Geometry) => void;
type NativeObserver = { startWindowGeometryObservation: () => void; stopWindowGeometryObservation: () => void };

const listeners = new Map<object, Listener>();
let subscription: { remove: () => void } | undefined;
let nativeObserver: NativeObserver | undefined;
let generation = 0;

/** Observe only while adaptive keyboard work is active. Always requery on a signal. */
export const watchAndroidKeyboardGeometry = (listener: Listener): (() => void) => {
    const native = NativeModules.KeyboardModule;
    const start = native?.startWindowGeometryObservation;
    const stop = native?.stopWindowGeometryObservation;
    if (Platform.OS !== 'android' || typeof start !== 'function' || typeof stop !== 'function') {
        return () => undefined;
    }

    const lease = {};
    listeners.set(lease, listener);
    if (!nativeObserver) {
        const owner = { startWindowGeometryObservation: () => start(), stopWindowGeometryObservation: () => stop() };
        nativeObserver = owner;
        const currentGeneration = ++generation;
        subscription = DeviceEventEmitter.addListener('KeyboardWindowGeometryChanged', (geometry: Geometry) => {
            if (currentGeneration !== generation || nativeObserver !== owner) return;
            // A callback may release its lease. Never deliver a queued signal
            // to a listener added while this event is already being handled.
            Array.from(listeners).forEach(([key, current]) => { if (listeners.has(key)) current(geometry); });
        });
        owner.startWindowGeometryObservation();
    }
    let released = false;
    return () => {
        if (released) return;
        released = true;
        listeners.delete(lease);
        if (listeners.size || !nativeObserver) return;
        generation += 1;
        subscription?.remove();
        subscription = undefined;
        const owner = nativeObserver;
        nativeObserver = undefined;
        owner.stopWindowGeometryObservation();
    };
};
