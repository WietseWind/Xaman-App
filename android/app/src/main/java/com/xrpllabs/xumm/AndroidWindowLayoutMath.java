package com.xrpllabs.xumm;

/** Geometry shared by the fold model and the native bottom-tab column. */
public final class AndroidWindowLayoutMath {
    public static final int FULL_WIDTH = -1;
    public static final int NOT_READY = 0;
    private static final double MAX_COLUMN_WIDTH_DP = 10000.0;

    private AndroidWindowLayoutMath() {}

    public static final class PhoneBox {
        public final double widthDp;
        public final double heightDp;

        private PhoneBox(double widthDp, double heightDp) {
            this.widthDp = widthDp;
            this.heightDp = heightDp;
        }
    }

    public static PhoneBox phoneBox(int physicalWidthPx, int physicalHeightPx, double density) {
        if (physicalWidthPx <= 0 || physicalHeightPx <= 0 || !positiveFinite(density)) {
            return null;
        }
        double width = physicalWidthPx / density;
        if (width >= 600.0) {
            width /= 2.0;
        }
        double height = Math.max(physicalWidthPx, physicalHeightPx) / density;
        return positiveFinite(width) && positiveFinite(height) ? new PhoneBox(width, height) : null;
    }

    public static boolean validColumnWidth(double widthDp) {
        return positiveFinite(widthDp) && widthDp <= MAX_COLUMN_WIDTH_DP;
    }

    /** Positive pixels constrain the column; -1 restores native full width; 0 defers. */
    public static int columnWidthPx(double widthDp, double density, int parentWidthPx) {
        if (!validColumnWidth(widthDp) || !positiveFinite(density) || parentWidthPx <= 0) {
            return NOT_READY;
        }
        double pixels = widthDp * density;
        if (!positiveFinite(pixels)) {
            return NOT_READY;
        }
        if (pixels >= parentWidthPx) {
            return FULL_WIDTH;
        }
        int rounded = Math.max(1, (int) Math.round(pixels));
        return rounded >= parentWidthPx ? FULL_WIDTH : rounded;
    }

    private static boolean positiveFinite(double value) {
        return !Double.isNaN(value) && !Double.isInfinite(value) && value > 0.0;
    }
}
