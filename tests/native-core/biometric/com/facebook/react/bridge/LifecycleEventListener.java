package com.facebook.react.bridge;
public interface LifecycleEventListener {
    void onHostResume();
    void onHostPause();
    void onHostDestroy();
}
