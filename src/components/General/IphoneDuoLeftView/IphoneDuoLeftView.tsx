/**
 * The free half of the open iPhone Duo.
 *
 * On the open iPhone Duo with the app on the whole inner screen, the app is a column on the right half of the
 * window, beside the tab bar. The left half is free. This component is that half: the screen wrapper
 * (common/helpers/sideSafeArea.tsx) renders it there, once for each screen of the app (not for overlays: their
 * backdrop covers the whole window), and gives it the size of the free part and the screen it is beside.
 *
 * It shows nothing for now: the half has the background of the app.
 *
 * To fill it later, render something here. That is JavaScript only, so it can go out with an over-the-air update.
 * - `width` / `height`: the size of the free part, in points. They change when the phone is closed, turned or
 *   put in a split view: the component is then not rendered at all (see FoldPhone in common/helpers/foldPhone.ts
 *   for the state and its change event).
 * - `screen`: the name of the screen it is beside (AppScreens), to show something that fits that screen.
 * - Sizes: take `width` and `height`, not AppSizes.screen (that is the size of the column of the app).
 *
 * It is not rendered on any other phone.
 */
import React from 'react';

/* Types ==================================================================== */
export interface Props {
    // the size of the free part of the window
    width: number;
    height: number;
    // the screen of the app that is beside it (the name it is registered with)
    screen?: string;
}

/* Component ==================================================================== */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const IphoneDuoLeftView: React.FC<Props> = (_props: Props) => {
    return null;
};

export default IphoneDuoLeftView;
