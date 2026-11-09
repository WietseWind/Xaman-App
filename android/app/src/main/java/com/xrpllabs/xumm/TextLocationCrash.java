package com.xrpllabs.xumm;

import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;

/**
 * The Android 8.0–12L accessibility crash that {@link AccessibilityCrashGuard} ignores, and the
 * cleanup of everything the guard rethrows. Plain Java, so it is tested with javac
 * (__tests__/textLocationCrash.test.ts).
 */
final class TextLocationCrash {
    static final String CONTROLLER = "android.view.AccessibilityInteractionController";
    static final String METHOD = "applyAppScaleAndMagnificationSpecIfNeeded";
    static final String MESSAGE = "android.graphics.RectF.scale(float)";
    static final String LOOPER = "android.os.Looper";

    private TextLocationCrash() {
    }

    /**
     * True only for the framework's NullPointerException on a null text location: thrown in
     * AccessibilityInteractionController, with only Android framework code between the throw and
     * the message loop, so no app or library code was cut off.
     */
    static boolean isFrameworkBug(Throwable t) {
        if (!(t instanceof NullPointerException)) {
            return false;
        }
        String message = t.getMessage();
        if (message == null || !message.contains(MESSAGE)) {
            return false;
        }
        StackTraceElement[] frames = t.getStackTrace();
        if (frames.length == 0
                || !CONTROLLER.equals(frames[0].getClassName())
                || !METHOD.equals(frames[0].getMethodName())) {
            return false;
        }
        for (StackTraceElement frame : frames) {
            String className = frame.getClassName();
            if (LOOPER.equals(className)) {
                return true;
            }
            if (!className.startsWith("android.") && !className.startsWith("com.android.internal.")) {
                return false;
            }
        }
        return false;
    }

    /**
     * Gives an exception, its causes and its suppressed exceptions the stack traces they would have
     * had without the guard.
     */
    static void removeGuardFrames(Throwable t, String guardClass) {
        try {
            Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<Throwable, Boolean>());
            removeGuardFrames(t, guardClass, seen);
        } catch (Throwable ignore) {
            // best effort: the exception is then rethrown as it is
        }
    }

    private static void removeGuardFrames(Throwable t, String guardClass, Set<Throwable> seen) {
        if (t == null || !seen.add(t)) {
            return;
        }
        StackTraceElement[] frames = t.getStackTrace();
        StackTraceElement[] trimmed = withoutGuardFrames(frames, guardClass);
        if (trimmed != frames) {
            t.setStackTrace(trimmed);
        }
        removeGuardFrames(t.getCause(), guardClass, seen);
        for (Throwable suppressed : t.getSuppressed()) {
            removeGuardFrames(suppressed, guardClass, seen);
        }
    }

    /**
     * The guard runs Looper.loop() from a message of the main thread's own loop, so a trace reads
     * [... Looper.loop, guard.run, Handler.handleCallback, Handler.dispatchMessage, (Looper.loopOnce,)
     * Looper.loop, ActivityThread.main ...]. Drops the guard's frame down to and including that
     * outer Looper.loop. Returns the same array when the trace doesn't look like that.
     */
    static StackTraceElement[] withoutGuardFrames(StackTraceElement[] frames, String guardClass) {
        int guard = -1;
        for (int i = 0; i < frames.length; i++) {
            if (guardClass.equals(frames[i].getClassName())) {
                guard = i;
                break;
            }
        }
        if (guard < 1 || !isLoop(frames[guard - 1])) {
            return frames;
        }
        int outerLoop = -1;
        for (int i = guard + 1; i < frames.length; i++) {
            if (isLoop(frames[i])) {
                outerLoop = i;
                break;
            }
        }
        if (outerLoop < 0) {
            return frames;
        }
        StackTraceElement[] trimmed = new StackTraceElement[frames.length - (outerLoop - guard + 1)];
        System.arraycopy(frames, 0, trimmed, 0, guard);
        System.arraycopy(frames, outerLoop + 1, trimmed, guard, frames.length - outerLoop - 1);
        return trimmed;
    }

    private static boolean isLoop(StackTraceElement frame) {
        return LOOPER.equals(frame.getClassName()) && "loop".equals(frame.getMethodName());
    }
}
