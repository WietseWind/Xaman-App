package com.xrpllabs.xumm;

import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.accessibility.AccessibilityManager;

/**
 * Keeps an Android 8.0–12L (API 26–32) accessibility bug from crashing the app.
 *
 * <p>An accessibility service can ask a text view where each character is on screen. The text
 * view leaves the entry of every character that isn't visible empty (null). When the screen is
 * magnified, Android's AccessibilityInteractionController then scales every entry without a null
 * check and throws on the main thread: "Attempt to invoke virtual method
 * 'void android.graphics.RectF.scale(float)' on a null object reference". Android 13 added the
 * check. Play's pre-launch report runs into it with its accessibility checks.
 *
 * <p>On those Android versions, once an accessibility service is on (the bug needs one), the main
 * thread runs its message loop inside this guard. The guard ignores exactly that exception
 * ({@link TextLocationCrash#isFrameworkBug}): Android stops handling that one accessibility
 * request and the service times out on it, which Android already allows for. Every other
 * exception is rethrown as the same object, with the stack trace it would have had without the
 * guard, so it crashes and is reported exactly as before.
 */
final class AccessibilityCrashGuard implements Runnable {
    private static final String TAG = "AccessibilityCrashGuard";

    // main thread only
    private static boolean started;

    private AccessibilityCrashGuard() {
    }

    /** From Application.onCreate() (main thread). Does nothing on Android 13 and later. */
    static void install(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || Build.VERSION.SDK_INT > Build.VERSION_CODES.S_V2) {
            return;
        }
        try {
            AccessibilityManager manager =
                    (AccessibilityManager) context.getSystemService(Context.ACCESSIBILITY_SERVICE);
            if (manager == null) {
                return;
            }
            if (manager.isEnabled()) {
                start();
            } else {
                // called on the main thread
                manager.addAccessibilityStateChangeListener(enabled -> {
                    if (enabled) {
                        start();
                    }
                });
            }
        } catch (Throwable ignore) {
            // a guard must never stop the app from starting
        }
    }

    private static void start() {
        if (started) {
            return;
        }
        started = true;
        new Handler(Looper.getMainLooper()).post(new AccessibilityCrashGuard());
    }

    @Override
    public void run() {
        while (true) {
            try {
                Looper.loop();
                return; // the main thread's loop never ends
            } catch (Throwable t) {
                if (!TextLocationCrash.isFrameworkBug(t)) {
                    TextLocationCrash.removeGuardFrames(t, getClass().getName());
                    throw t;
                }
                Log.w(TAG, "Ignored an Android 8-12L accessibility bug (null text location, fixed in Android 13)");
            }
        }
    }
}
