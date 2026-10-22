package com.xrpllabs.xumm;

/** The window drawable is replaced only when the navigator color actually changes. */
public final class WindowBackground {
    private WindowBackground() {}

    public static boolean changed(int background, int lastWindowBackground) {
        return background != lastWindowBackground;
    }
}
