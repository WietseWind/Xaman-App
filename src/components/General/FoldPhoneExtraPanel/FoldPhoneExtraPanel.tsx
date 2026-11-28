/**
 * The extra panel of a fold phone: the part of the open screen that is free beside the app.
 *
 * On an open fold phone with the app on the whole inner screen, the app stays a column of its phone layout on one
 * half of the window. The other half is free. This component is that half: the screen wrapper
 * (common/helpers/sideSafeArea.tsx) renders it there, once for each screen of the app (not for overlays: their
 * backdrop covers the whole window), and gives it the size of the free part, its side and the screen it is beside.
 *
 * It shows nothing for now: the free part has the background of the app.
 *
 * To fill it later, render something here. That is JavaScript only, so it can go out with an over-the-air update.
 * - `width` / `height`: the size of the free part, in points. When the phone is closed, turned or put in a split
 *   view there is no free part and this component is not rendered at all (see FoldPhone in
 *   common/helpers/foldPhone.ts for the state and its change event).
 * - `side`: where the free part is, seen from the app ('left' on the iPhone Duo: the app is beside the tab bar on
 *   the right).
 * - `screen`: the name of the screen it is beside (AppScreens), to show something that fits that screen.
 * - Sizes: take `width` and `height`, not AppSizes.screen (that is the size of the column of the app).
 *
 * Today only the iPhone Duo gives a free part. The name is general on purpose: another fold phone can use the same
 * panel when its native side tells the same values. It is not rendered on any phone without a free part.
 */
import React from 'react';

/* Types ==================================================================== */
export interface Props {
    // the size of the free part of the window
    width: number;
    height: number;
    // the side of the app on which the free part is
    side: 'left' | 'right';
    // the screen of the app that is beside it (the name it is registered with)
    screen?: string;
}

/* Component ==================================================================== */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const FoldPhoneExtraPanel: React.FC<Props> = (_props: Props) => {
    return null;
};

export default FoldPhoneExtraPanel;
