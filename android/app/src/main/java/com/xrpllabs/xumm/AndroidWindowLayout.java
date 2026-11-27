package com.xrpllabs.xumm;

import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.hardware.display.DisplayManager;
import android.os.Build;
import android.view.Display;

import java.lang.ref.WeakReference;

/** Public hardware/display APIs only. The phone model is stable for this process. */
public final class AndroidWindowLayout {
    private static boolean initialized;
    private static AndroidWindowLayoutMath.PhoneBox phoneBox;
    private static AndroidWindowLayoutMath.PhoneBox ordinaryWindowBox;
    private static WeakReference<Activity> currentActivity;

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
            currentActivity = new WeakReference<>((Activity) context);
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
}
