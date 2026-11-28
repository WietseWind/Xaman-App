import { createContext } from 'react';

/** Whether an adaptive Android screen has free space beside its phone layout. */
export const AndroidWindowFreeAreaContext = createContext(false);

/** Visible Android window in the unscaled coordinates of its phone column. */
export type AndroidWindowSurround = {
    left: number;
    width: number;
    height: number;
    columnWidth: number;
    scale: number;
    /** Actual Android multi-window pane; dimensions are unscaled live DP. */
    fullPane?: boolean;
};

export const AndroidWindowSurroundContext = createContext<AndroidWindowSurround | undefined>(undefined);
