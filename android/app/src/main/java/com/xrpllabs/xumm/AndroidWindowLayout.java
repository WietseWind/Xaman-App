package com.xrpllabs.xumm;

import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.graphics.Rect;
import android.hardware.display.DisplayManager;
import android.os.Build;
import android.view.Display;
import android.view.View;

import java.lang.ref.WeakReference;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArraySet;

/** Public hardware/display APIs only. The phone model is stable for this process. */
public final class AndroidWindowLayout {
    private static boolean initialized;
    private static AndroidWindowLayoutMath.PhoneBox phoneBox;
    private static AndroidWindowLayoutMath.PhoneBox ordinaryWindowBox;
    private static WeakReference<Activity> currentActivity;
    private static WindowState currentWindowState;
    private static long windowStateRevision;
    private static final CopyOnWriteArraySet<WindowStateListener> windowStateListeners = new CopyOnWriteArraySet<>();

    public interface WindowStateListener {
        void onWindowStateChanged(WindowState state);
    }

    public static final class WindowState {
        public final boolean isInMultiWindowMode;
        public final double width;
        public final double height;
        public final long revision;

        private WindowState(boolean multiWindow, double width, double height, long revision) {
            this.isInMultiWindowMode = multiWindow;
            this.width = width;
            this.height = height;
            this.revision = revision;
        }

        public Map<String, Object> toMap() {
            Map<String, Object> result = new HashMap<>();
            result.put("isInMultiWindowMode", isInMultiWindowMode);
            result.put("width", width);
            result.put("height", height);
            result.put("revision", (double) revision);
            return result;
        }
    }

    private AndroidWindowLayout() {}

    public static boolean isFoldCapable(Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return false;
        }
        try {
            if (context.getPackageManager().hasSystemFeature(PackageManager.FEATURE_SENSOR_HINGE_ANGLE)) {
                return true;
            }
            SensorManager sensors = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
            return sensors != null && sensors.getDefaultSensor(Sensor.TYPE_HINGE_ANGLE) != null;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    public static synchronized void initialize(Context context) {
        // LaunchActivity calls this before React starts. Refresh this reference
        // even when the process model is already cached after Activity recreation.
        if (context instanceof Activity) {
            if (currentActivity == null || currentActivity.get() != context) {
                currentWindowState = null;
            }
            currentActivity = new WeakReference<>((Activity) context);
            refreshWindowState((Activity) context);
        }
        if (initialized) {
            return;
        }
        if (!isFoldCapable(context)) {
            initialized = true;
            return;
        }
        try {
            DisplayManager displays = (DisplayManager) context.getSystemService(Context.DISPLAY_SERVICE);
            Display display = displays == null ? null : displays.getDisplay(Display.DEFAULT_DISPLAY);
            if (display == null) {
                return;
            }
            Display.Mode mode = display.getMode();
            AndroidWindowLayoutMath.PhoneBox candidate = AndroidWindowLayoutMath.phoneBox(
                    mode.getPhysicalWidth(), mode.getPhysicalHeight(),
                    context.getResources().getDisplayMetrics().density);
            if (candidate != null) {
                phoneBox = candidate;
                initialized = true;
            }
        } catch (RuntimeException ignored) {
            // If the display is not ready yet, DeviceUtils can retry before exporting constants.
        }
    }

    /** A cold ordinary split uses its full display model, but keeps ordinary identity and rotation. */
    public static synchronized AndroidWindowLayoutMath.PhoneBox windowBox(Context context) {
        Activity activity = currentActivity == null ? null : currentActivity.get();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N || activity == null
                || activity.isFinishing() || activity.isDestroyed() || !activity.isInMultiWindowMode()
                || isFoldCapable(context)) {
            return null;
        }
        if (ordinaryWindowBox != null) {
            return ordinaryWindowBox;
        }
        try {
            DisplayManager displays = (DisplayManager) context.getSystemService(Context.DISPLAY_SERVICE);
            Display display = displays == null ? null : displays.getDisplay(Display.DEFAULT_DISPLAY);
            if (display == null) {
                return null;
            }
            Display.Mode mode = display.getMode();
            ordinaryWindowBox = AndroidWindowLayoutMath.windowBox(
                    mode.getPhysicalWidth(), mode.getPhysicalHeight(),
                    context.getResources().getDisplayMetrics().density);
            return ordinaryWindowBox;
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    public static synchronized AndroidWindowLayoutMath.PhoneBox phoneBox(Context context) {
        initialize(context);
        return phoneBox;
    }

    public static synchronized WindowState currentWindowState() {
        Activity activity = currentActivity == null ? null : currentActivity.get();
        return live(activity) ? currentWindowState : null;
    }

    public static void addWindowStateListener(WindowStateListener listener) {
        windowStateListeners.add(listener);
    }

    public static void removeWindowStateListener(WindowStateListener listener) {
        windowStateListeners.remove(listener);
    }

    /** UI-thread callers read one real Activity state, never a shape-based split guess. */
    public static WindowState refreshWindowState(Activity activity) {
        WindowState changed = null;
        WindowState result;
        synchronized (AndroidWindowLayout.class) {
            if (!live(activity) || currentActivity == null || currentActivity.get() != activity) {
                return null;
            }
            try {
                int width;
                int height;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    Rect bounds = activity.getWindowManager().getCurrentWindowMetrics().getBounds();
                    width = bounds.width();
                    height = bounds.height();
                } else {
                    View decor = activity.getWindow() == null ? null : activity.getWindow().getDecorView();
                    if (decor == null || !decor.isAttachedToWindow()) return null;
                    width = decor.getWidth();
                    height = decor.getHeight();
                }
                double density = activity.getResources().getDisplayMetrics().density;
                if (width <= 0 || height <= 0 || !Double.isFinite(density) || density <= 0) return null;
                boolean multiWindow = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N
                        && activity.isInMultiWindowMode();
                double widthDp = width / density;
                double heightDp = height / density;
                WindowState previous = currentWindowState;
                if (previous == null || previous.isInMultiWindowMode != multiWindow
                        || previous.width != widthDp || previous.height != heightDp) {
                    changed = new WindowState(multiWindow, widthDp, heightDp, ++windowStateRevision);
                    currentWindowState = changed;
                }
                result = currentWindowState;
            } catch (RuntimeException ignored) {
                return null;
            }
        }
        if (changed != null) {
            for (WindowStateListener listener : windowStateListeners) {
                if (currentWindowState() != changed) break;
                listener.onWindowStateChanged(changed);
            }
        }
        return result;
    }

    private static boolean live(Activity activity) {
        return activity != null && !activity.isFinishing() && !activity.isDestroyed();
    }

    public static synchronized void clearActivity(Activity activity) {
        if (currentActivity != null && currentActivity.get() == activity) {
            currentActivity.clear();
            currentWindowState = null;
        }
    }
}
