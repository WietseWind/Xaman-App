package libs.ui;

import android.app.Activity;
import android.graphics.Rect;
import android.os.Build;
import android.view.View;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

/** A current window snapshot in the same coordinate origin as RN measureInWindow. */
final class KeyboardWindowGeometry {
    static final class Result {
        final double keyboardTop;
        final Boolean visible;

        Result(double keyboardTop, Boolean visible) {
            this.keyboardTop = keyboardTop;
            this.visible = visible;
        }
    }

    private KeyboardWindowGeometry() {}

    static Result read(Activity activity, KeyboardProvider provider) {
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            return null;
        }
        try {
            View decor = activity.getWindow().getDecorView();
            if (decor == null || !decor.isAttachedToWindow() || decor.getHeight() <= 0) {
                return null;
            }
            double density = decor.getResources().getDisplayMetrics().density;
            if (Double.isNaN(density) || Double.isInfinite(density) || density <= 0) {
                return null;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decor);
                if (insets != null) {
                    Rect frame = new Rect();
                    decor.getWindowVisibleDisplayFrame(frame);
                    int[] location = new int[2];
                    decor.getLocationOnScreen(location);
                    int imeBottom = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
                    double top = (location[1] + (double) decor.getHeight() - imeBottom - frame.top) / density;
                    if (frame.height() > 0 && imeBottom >= 0 && top > 0 && Double.isFinite(top)) {
                        return new Result(top, insets.isVisible(WindowInsetsCompat.Type.ime()));
                    }
                }
            }
            // A showing popup reports the same visible-frame origin. Its
            // visibility is unknown here; never infer it from the old heightMax.
            Rect frame = provider == null ? null : provider.getVisibleWindowFrame();
            if (frame != null && frame.height() > 0) {
                double top = frame.height() / density;
                return Double.isFinite(top) && top > 0 ? new Result(top, null) : null;
            }
        } catch (RuntimeException ignored) {
            // A disappearing window must fall back to the existing JS path.
        }
        return null;
    }
}
