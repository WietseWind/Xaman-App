/**
 * The state of a fold phone (iPhone Duo), for JavaScript code that wants to know it or follow it.
 *
 *     import { FoldPhone } from '@common/helpers/foldPhone';
 *
 *     FoldPhone.getState().mode === 'open';                     // the open phone, the app on the whole inner screen
 *     const listener = FoldPhone.addListener((state) => { … }); // each change: opened, closed, split view, turned
 *     listener.remove();
 *
 * The values come from the native view of the screen wrapper (common/helpers/sideSafeArea.tsx), so they are known
 * from the first screen on and change while the app runs. On every other phone the mode is 'none' and no listener
 * is ever called.
 *
 * This is all JavaScript: what the app shows in the free half of the open screen
 * (components/General/IphoneDuoLeftView) can change with an over-the-air update, without a new native build.
 */

/* Types ==================================================================== */
/**
 * none:   not a fold phone
 * cover:  the closed phone (the cover screen)
 * open:   the open phone, the app on the whole inner screen: the app is a column on one half, the other half is free
 * split:  the open phone, the app in one half of the screen beside another app (split view)
 * turned: the open phone turned a quarter: the app is a box in the middle of the window
 */
export type FoldPhoneMode = 'none' | 'cover' | 'open' | 'split' | 'turned';

export type FoldPhoneState = {
    mode: FoldPhoneMode;
    // the window of the app
    window: { width: number; height: number };
    // the part of the window where the screens of the app are
    app: { left: number; top: number; width: number; height: number };
    // the part of the window that is free beside the app, in the mode 'open'; undefined in every other mode
    free?: { left: number; top: number; width: number; height: number };
};

export type FoldPhoneListener = (state: FoldPhoneState) => void;

/* State ==================================================================== */
const NONE: FoldPhoneState = Object.freeze({
    mode: 'none',
    window: { width: 0, height: 0 },
    app: { left: 0, top: 0, width: 0, height: 0 },
});

let current: FoldPhoneState = NONE;
const listeners = new Set<FoldPhoneListener>();

const same = (a: FoldPhoneState, b: FoldPhoneState): boolean => {
    return JSON.stringify(a) === JSON.stringify(b);
};

/* Helpers ==================================================================== */
/**
 * The state for a window and the place of the app in it.
 *
 * deviceScreenWidth: the width of the screen of the device (the cover screen); the window of the open phone is far
 * wider, a window in a split view is a little wider.
 */
export const foldPhoneStateFor = (
    window: { width: number; height: number },
    app: { left: number; top: number; width: number; height: number },
    deviceScreenWidth: number,
): FoldPhoneState => {
    if (!(window.width > 0) || !(app.width > 0)) {
        return NONE;
    }
    let mode: FoldPhoneMode;
    if (app.top > 0) {
        mode = 'turned';
    } else if (deviceScreenWidth > 0 && window.width > deviceScreenWidth * 1.5) {
        mode = 'open';
    } else if (deviceScreenWidth > 0 && Math.abs(window.width - deviceScreenWidth) > 1) {
        mode = 'split';
    } else {
        mode = 'cover';
    }
    const state: FoldPhoneState = { mode, window: { ...window }, app: { ...app } };
    if (mode === 'open') {
        // the free part is on the side of the app that is away from the edge of the window it is at
        const right = window.width - app.left - app.width;
        state.free =
            app.left >= right
                ? { left: 0, top: 0, width: app.left, height: window.height }
                : { left: app.left + app.width, top: 0, width: right, height: window.height };
    }
    return state;
};

/* Export ==================================================================== */
export const FoldPhone = {
    /** The state at this moment. `mode` is 'none' on every phone but a fold phone. */
    getState: (): FoldPhoneState => current,

    /** True on the open phone with the app on the whole inner screen: there is a free half to fill. */
    hasFreeArea: (): boolean => current.mode === 'open' && !!current.free && current.free.width > 0,

    /** Called with the new state each time it changes. */
    addListener: (listener: FoldPhoneListener): { remove: () => void } => {
        listeners.add(listener);
        return { remove: () => listeners.delete(listener) };
    },

    /** For the screen wrapper only: the state as the native view of a screen tells it. */
    update: (next: FoldPhoneState): void => {
        if (same(current, next)) {
            return;
        }
        current = next;
        listeners.forEach((listener) => {
            try {
                listener(current);
            } catch {
                // a listener that fails does not stop the others
            }
        });
    },
};
