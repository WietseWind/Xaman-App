package com.facebook.react.bridge;
public class UiThreadUtil {
    public static boolean defer;
    public static final java.util.List<Runnable> queue = new java.util.ArrayList<>();
    public static void runOnUiThread(Runnable runnable) {
        if (defer) queue.add(runnable);
        else runnable.run();
    }
    public static void flush() {
        defer = false;
        while (!queue.isEmpty()) queue.remove(0).run();
    }
}
