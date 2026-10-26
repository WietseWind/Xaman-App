package androidx.biometric;
public class BiometricPrompt {
    public static final int ERROR_USER_CANCELED=1, ERROR_NEGATIVE_BUTTON=2, ERROR_HW_NOT_PRESENT=3,
        ERROR_HW_UNAVAILABLE=4, ERROR_NO_BIOMETRICS=5;
    public static PromptInfo shown;
    public static int count, failure;
    public static boolean autoSucceed = true;
    public static final java.util.List<BiometricPrompt> instances = new java.util.ArrayList<>();
    public static class AuthenticationResult {}
    public static class AuthenticationCallback {
        public void onAuthenticationError(int code, CharSequence message) {}
        public void onAuthenticationSucceeded(AuthenticationResult result) {}
        public void onAuthenticationFailed() {}
    }
    public static class PromptInfo {
        public int allowed = BiometricManager.Authenticators.BIOMETRIC_WEAK;
        public static class Builder {
            PromptInfo info = new PromptInfo();
            public Builder setAllowedAuthenticators(int allowed) { info.allowed=allowed; return this; }
            public Builder setConfirmationRequired(boolean value) { return this; }
            public Builder setNegativeButtonText(String value) { return this; }
            public Builder setTitle(String value) { return this; }
            public PromptInfo build() {
                if (failure==2) throw new IllegalArgumentException("fixture builder failure");
                return info;
            }
        }
    }
    final AuthenticationCallback callback;
    final java.util.concurrent.Executor executor;
    public int cancellations;
    public BiometricPrompt(Object activity, java.util.concurrent.Executor executor, AuthenticationCallback callback) {
        if (failure==1) throw new IllegalStateException("fixture constructor failure");
        this.callback=callback; this.executor=executor; instances.add(this);
    }
    public void authenticate(PromptInfo info) {
        if (failure==3) throw new IllegalStateException("fixture authenticate failure");
        shown=info; count++;
        if (autoSucceed) succeed();
    }
    public void succeed() { executor.execute(() -> callback.onAuthenticationSucceeded(new AuthenticationResult())); }
    public void error() { executor.execute(() -> callback.onAuthenticationError(ERROR_USER_CANCELED, "fixture")); }
    public void fail() { executor.execute(() -> callback.onAuthenticationFailed()); }
    public void cancelAuthentication() {
        cancellations++;
        if (failure==4) throw new IllegalStateException("fixture cancellation failure");
        error();
    }
}
