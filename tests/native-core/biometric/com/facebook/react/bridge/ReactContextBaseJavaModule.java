package com.facebook.react.bridge;
public abstract class ReactContextBaseJavaModule {
    public ReactContextBaseJavaModule(ReactApplicationContext context) {}
    public abstract String getName();
    public void invalidate() {}
}
