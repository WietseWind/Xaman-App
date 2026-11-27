package com.xrpllabs.xumm;

import androidx.annotation.Nullable;

import com.google.firebase.crashlytics.FirebaseCrashlytics;

/**
 * Called from the React Native synchronous native hook before the method runs.
 * A native abort does not keep the method name in the stack, so the crash
 * report stores the last name here.
 */
public final class SyncNativeTrace {
    private SyncNativeTrace() {}

    public static void note(@Nullable String name) {
        if (name == null || name.isEmpty()) {
            return;
        }
        try {
            FirebaseCrashlytics crashlytics = FirebaseCrashlytics.getInstance();
            crashlytics.setCustomKey("sync_native", name);
            crashlytics.log("sync native " + name);
        } catch (Throwable ignore) {
            // reporting only; never break the native call
        }
    }
}
