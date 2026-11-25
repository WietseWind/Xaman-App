package com.facebook.react.bridge;
public class ReactApplicationContext {
    public android.app.Activity activity;
    public final java.util.List<LifecycleEventListener> listeners = new java.util.ArrayList<>();
    public android.app.Activity getCurrentActivity() { return activity; }
    public void addLifecycleEventListener(LifecycleEventListener listener) { listeners.add(listener); }
    public void removeLifecycleEventListener(LifecycleEventListener listener) { listeners.remove(listener); }
}
