import { Dimensions, NativeEventEmitter, NativeModules, Platform } from 'react-native';

export type AndroidMultiWindowState = {
    isInMultiWindowMode: boolean;
    width: number;
    height: number;
    /** Current window-local system bar/cutout inset, in DP. Older native builds omit it. */
    topInset?: number;
    revision: number;
};

type Listener = (state: AndroidMultiWindowState) => void;

/** An explicit native capability; window shape never identifies split mode. */
export const supportsAndroidMultiWindowLayout = (): boolean => (
    Platform.OS === 'android' && NativeModules.DeviceUtilsModule?.supportsAndroidMultiWindowLayout === true
);

export const parseAndroidMultiWindowState = (value: unknown): AndroidMultiWindowState | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const state = value as AndroidMultiWindowState;
    if (typeof state.isInMultiWindowMode !== 'boolean' ||
        ![state.width, state.height].every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0) ||
        (state.topInset !== undefined && (typeof state.topInset !== 'number' ||
            !Number.isFinite(state.topInset) || state.topInset < 0 || state.topInset > state.height)) ||
        !Number.isSafeInteger(state.revision) || state.revision < 0) return undefined;
    return {
        isInMultiWindowMode: state.isInMultiWindowMode,
        width: state.width,
        height: state.height,
        ...(state.topInset !== undefined ? { topInset: state.topInset } : {}),
        revision: state.revision,
    };
};

let current: AndroidMultiWindowState | undefined;
let generation = 0;
const listeners = new Map<object, Listener>();
let nativeSubscription: { remove: () => void } | undefined;
let dimensionsSubscription: { remove: () => void } | undefined;
let requestPending = false;
let requestAgain = false;

export const getAndroidMultiWindowState = (): AndroidMultiWindowState | undefined => {
    if (!supportsAndroidMultiWindowLayout()) return undefined;
    if (!current) current = parseAndroidMultiWindowState(NativeModules.DeviceUtilsModule.androidWindowState);
    return current;
};

const accept = (value: unknown, owner: number) => {
    if (owner !== generation || listeners.size === 0) return;
    const state = parseAndroidMultiWindowState(value);
    if (!state || (current && state.revision <= current.revision)) return;
    const changed = !current || state.isInMultiWindowMode !== current.isInMultiWindowMode ||
        state.width !== current.width || state.height !== current.height || state.topInset !== current.topInset;
    current = state;
    if (changed) {
        // A listener may release a lease or mount another screen. Do not
        // deliver this in-flight event to a newly acquired subscription.
        Array.from(listeners).forEach(([lease, listener]) => {
            if (listeners.has(lease)) listener(state);
        });
    }
};

const refresh = (owner: number) => {
    if (owner !== generation || listeners.size === 0) return;
    if (requestPending) { requestAgain = true; return; }
    const getter = NativeModules.DeviceUtilsModule?.getAndroidWindowState;
    if (typeof getter !== 'function') return;
    requestPending = true;
    Promise.resolve().then(() => getter()).then((value) => accept(value, owner), () => undefined)
        .finally(() => {
            if (owner !== generation) return;
            requestPending = false;
            if (requestAgain) {
                requestAgain = false;
                refresh(owner);
            }
        });
};

/** One native listener/query for all mounted screens, including detached stacks. */
export const subscribeAndroidMultiWindowState = (listener: Listener): { remove: () => void } => {
    if (!supportsAndroidMultiWindowLayout()) return { remove: () => undefined };
    getAndroidMultiWindowState();
    const lease = {};
    listeners.set(lease, listener);
    if (listeners.size === 1) {
        generation += 1;
        const owner = generation;
        nativeSubscription = new NativeEventEmitter(NativeModules.DeviceUtilsModule)
            .addListener('androidWindowStateChanged', (value) => accept(value, owner));
        dimensionsSubscription = Dimensions.addEventListener('change', () => refresh(owner));
        refresh(owner);
    }
    let removed = false;
    return {
        remove: () => {
            if (removed) return;
            removed = true;
            listeners.delete(lease);
            if (listeners.size === 0) {
                generation += 1;
                nativeSubscription?.remove();
                dimensionsSubscription?.remove();
                nativeSubscription = undefined;
                dimensionsSubscription = undefined;
                requestPending = false;
                requestAgain = false;
            }
        },
    };
};
