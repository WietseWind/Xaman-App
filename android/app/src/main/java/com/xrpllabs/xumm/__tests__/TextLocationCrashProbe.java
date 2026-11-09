package com.xrpllabs.xumm;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Run by textLocationCrash.test.ts with plain javac and java. */
public class TextLocationCrashProbe {
    private static final String GUARD = "com.xrpllabs.xumm.AccessibilityCrashGuard";
    private static final String AIC = "android.view.AccessibilityInteractionController";
    private static final String BUG =
            "Attempt to invoke virtual method 'void android.graphics.RectF.scale(float)' on a null object reference";

    // the framework's crash as logged on Android 12 (API 31), from the throw to the message loop
    private static final StackTraceElement[] BUG_FRAMES = {
            frame(AIC, "applyAppScaleAndMagnificationSpecIfNeeded", 982),
            frame(AIC, "updateInfoForViewPort", 1012),
            frame(AIC, "updateInfoForViewportAndReturnFindNodeResult", 1125),
            frame(AIC, "findAccessibilityNodeInfoByAccessibilityIdUiThread", 362),
            frame(AIC, "access$500", 74),
            frame(AIC + "$PrivateHandler", "handleMessage", 1547),
            frame("android.os.Handler", "dispatchMessage", 106),
    };
    // any other crash in a message
    private static final StackTraceElement[] APP_FRAMES = {
            frame("com.xrpllabs.xumm.LaunchActivity", "m0", 28),
            frame("android.os.Handler", "handleCallback", 938),
            frame("android.os.Handler", "dispatchMessage", 99),
    };
    // the main thread's message loop: Android 12 adds Looper.loopOnce
    private static final StackTraceElement[] LOOP_12 = {
            frame("android.os.Looper", "loopOnce", 201),
            frame("android.os.Looper", "loop", 288),
    };
    private static final StackTraceElement[] LOOP_8 = {frame("android.os.Looper", "loop", 193)};
    private static final StackTraceElement[] MAIN = {
            frame("android.app.ActivityThread", "main", 7839),
            frame("java.lang.reflect.Method", "invoke", -2),
            frame("com.android.internal.os.RuntimeInit$MethodAndArgsCaller", "run", 548),
            frame("com.android.internal.os.ZygoteInit", "main", 1003),
    };
    // the guard's run(), started from a message of the main thread's own loop
    private static final StackTraceElement[] GUARD_RUN = {
            frame(GUARD, "run", 77),
            frame("android.os.Handler", "handleCallback", 938),
            frame("android.os.Handler", "dispatchMessage", 99),
    };

    private static StackTraceElement frame(String className, String method, int line) {
        return new StackTraceElement(className, method, line < 0 ? null : "Source.java", line);
    }

    private static StackTraceElement[] concat(StackTraceElement[]... parts) {
        List<StackTraceElement> all = new ArrayList<>();
        for (StackTraceElement[] part : parts) {
            all.addAll(Arrays.asList(part));
        }
        return all.toArray(new StackTraceElement[0]);
    }

    private static StackTraceElement[] insert(StackTraceElement[] frames, int at, StackTraceElement extra) {
        List<StackTraceElement> all = new ArrayList<>(Arrays.asList(frames));
        all.add(at, extra);
        return all.toArray(new StackTraceElement[0]);
    }

    private static <T extends Throwable> T withTrace(T t, StackTraceElement[] frames) {
        t.setStackTrace(frames);
        return t;
    }

    private static void check(String name, Throwable t) {
        System.out.println(name + ": " + (TextLocationCrash.isFrameworkBug(t) ? "ignored" : "rethrown"));
    }

    private static void trim(String name, StackTraceElement[] frames, StackTraceElement[] expected) {
        Throwable t = withTrace(new IllegalStateException("test"), frames);
        TextLocationCrash.removeGuardFrames(t, GUARD);
        String verdict = !Arrays.equals(t.getStackTrace(), expected) ? "WRONG"
                : Arrays.equals(frames, expected) ? "unchanged" : "as without the guard";
        System.out.println(name + ": " + verdict);
    }

    public static void main(String[] args) {
        StackTraceElement[] bug12 = concat(BUG_FRAMES, LOOP_12, GUARD_RUN, LOOP_12, MAIN);
        StackTraceElement[] bug8 = concat(BUG_FRAMES, LOOP_8, GUARD_RUN, LOOP_8, MAIN);

        check("framework bug, Android 12 as logged", withTrace(new NullPointerException(BUG), bug12));
        check("framework bug, Android 8-11", withTrace(new NullPointerException(BUG), bug8));
        check("other message", withTrace(new NullPointerException(BUG.replace("RectF", "Rect")), bug12));
        check("no message", withTrace(new NullPointerException(), bug12));
        check("not a NullPointerException", withTrace(new IllegalStateException(BUG), bug12));
        check("thrown elsewhere", withTrace(new NullPointerException(BUG),
                insert(bug12, 0, frame("android.widget.TextView", "addExtraDataToAccessibilityNodeInfo", 1))));
        check("app code on the way to the loop", withTrace(new NullPointerException(BUG),
                insert(bug12, 4, frame("com.xrpllabs.xumm.SomeView", "onSomething", 1))));
        check("library code on the way to the loop", withTrace(new NullPointerException(BUG),
                insert(bug12, 4, frame("androidx.core.view.AccessibilityDelegateCompat", "addExtraData", 1))));
        check("no message loop", withTrace(new NullPointerException(BUG), BUG_FRAMES));

        StackTraceElement[] guarded12 = concat(APP_FRAMES, LOOP_12, GUARD_RUN, LOOP_12, MAIN);
        StackTraceElement[] plain12 = concat(APP_FRAMES, LOOP_12, MAIN);
        trim("rethrown, Android 12", guarded12, plain12);
        trim("rethrown, Android 8-11", concat(APP_FRAMES, LOOP_8, GUARD_RUN, LOOP_8, MAIN),
                concat(APP_FRAMES, LOOP_8, MAIN));
        trim("no guard on the stack", plain12, plain12);
        StackTraceElement[] notUnderLoop = concat(APP_FRAMES, GUARD_RUN, LOOP_12, MAIN);
        trim("guard not running the loop", notUnderLoop, notUnderLoop);
        StackTraceElement[] noOuterLoop = concat(APP_FRAMES, LOOP_12, GUARD_RUN);
        trim("no outer loop", noOuterLoop, noOuterLoop);

        Throwable outer = withTrace(new RuntimeException("outer"), guarded12);
        Throwable cause = withTrace(new NullPointerException("cause"), guarded12);
        Throwable suppressed = withTrace(new IllegalStateException("suppressed"), guarded12);
        outer.initCause(cause);
        outer.addSuppressed(suppressed);
        TextLocationCrash.removeGuardFrames(outer, GUARD);
        boolean all = Arrays.equals(outer.getStackTrace(), plain12) && Arrays.equals(cause.getStackTrace(), plain12)
                && Arrays.equals(suppressed.getStackTrace(), plain12);
        System.out.println("cause and suppressed: " + (all ? "as without the guard" : "WRONG"));

        Throwable a = withTrace(new RuntimeException("a"), guarded12);
        Throwable b = withTrace(new RuntimeException("b"), guarded12);
        a.initCause(b);
        b.initCause(a);
        TextLocationCrash.removeGuardFrames(a, GUARD);
        boolean both = Arrays.equals(a.getStackTrace(), plain12) && Arrays.equals(b.getStackTrace(), plain12);
        System.out.println("causes in a loop: " + (both ? "as without the guard" : "WRONG"));
    }
}
