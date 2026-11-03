package libs.security.authentication.Biometric;

import android.app.Activity;
import androidx.annotation.NonNull;
import androidx.lifecycle.Lifecycle;

import androidx.biometric.BiometricPrompt;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt.PromptInfo;
import androidx.fragment.app.FragmentActivity;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.bridge.UiThreadUtil;

import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;


@ReactModule(name = BiometricModule.NAME)
public class BiometricModule extends ReactContextBaseJavaModule implements LifecycleEventListener {
    // constants
    public static final String TYPE_BIOMETRICS = "Biometrics";
    // errors
    public static final String ERROR_USER_CANCEL = "USER_CANCEL";
    public static final String ERROR_NOT_SUPPORTED = "BIOMETRIC_NOT_SUPPORTED";
    public static final String ERROR_NOT_ENROLLED = "NOT_ENROLLED";
    public static final String ERROR_NOT_AVAILABLE = "NOT_AVAILABLE";
    public static final String ERROR_BIOMETRIC = "BIOMETRIC_ERROR";
    public static final String ERROR_NOT_MEET_SECURITY_REQUIREMENTS = "NOT_MEET_SECURITY_REQUIREMENTS";
    public static final String ERROR_BIOMETRIC_HAS_BEEN_CHANGED = "BIOMETRIC_HAS_BEEN_CHANGED";
    public static final String ERROR_UNABLE_REFRESH_AUTHENTICATION_KEY = "UNABLE_REFRESH_AUTHENTICATION_KEY";

    private AuthenticationRequest activeRequest;
    private volatile boolean invalidated;
    private volatile boolean hostPaused;
    private final AtomicInteger hostGeneration = new AtomicInteger();
    private final Executor callbackExecutor = UiThreadUtil::runOnUiThread;
    private final ReactApplicationContext mReactContext;

    public BiometricModule(ReactApplicationContext reactContext) {
        super(reactContext);

        mReactContext = reactContext;
        mReactContext.addLifecycleEventListener(this);
    }

    static final String NAME = "BiometricModule";

    @NonNull
    @Override
    public String getName() {
        return NAME;
    }


    public static void initialise() {
        // generate key if no key is exist
        if (!SecurityProvider.isKeyReady()) {
            SecurityProvider.generateKey();
        }
    }

    private class AuthenticationRequest {
        final Promise promise;
        final AtomicBoolean completed = new AtomicBoolean();
        BiometricPrompt prompt;

        AuthenticationRequest(Promise promise) {
            this.promise = promise;
        }

        void resolve() {
            if (completed.compareAndSet(false, true)) {
                if (activeRequest == this) activeRequest = null;
                promise.resolve(TYPE_BIOMETRICS);
            }
        }

        void reject(String code) {
            if (completed.compareAndSet(false, true)) {
                if (activeRequest == this) activeRequest = null;
                promise.reject(code, TYPE_BIOMETRICS);
            }
        }
    }

    private void biometricAuthenticate(final String reason, final Promise promise) {
        final int generation = hostGeneration.get();
        try {
            UiThreadUtil.runOnUiThread(() -> {
                final AuthenticationRequest request = new AuthenticationRequest(promise);
                if (invalidated || hostPaused || generation != hostGeneration.get() || activeRequest != null) {
                    request.reject(ERROR_NOT_AVAILABLE);
                    return;
                }

                try {
                    Activity activity = mReactContext.getCurrentActivity();
                    if (!(activity instanceof FragmentActivity)) {
                        request.reject(ERROR_NOT_AVAILABLE);
                        return;
                    }
                    FragmentActivity fragmentActivity = (FragmentActivity) activity;
                    if (fragmentActivity.isFinishing() || fragmentActivity.isDestroyed()
                            || !fragmentActivity.getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)
                            || fragmentActivity.getSupportFragmentManager().isStateSaved()) {
                        request.reject(ERROR_NOT_AVAILABLE);
                        return;
                    }

                    activeRequest = request;
                    request.prompt = new BiometricPrompt(fragmentActivity, callbackExecutor,
                            new BiometricPrompt.AuthenticationCallback() {
                                @Override
                                public void onAuthenticationError(int code, @NonNull CharSequence message) {
                                    request.reject(getBiometricError(code));
                                }

                                @Override
                                public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                                    request.resolve();
                                }
                            });

                    PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                            .setConfirmationRequired(false)
                            .setNegativeButtonText("Cancel")
                            .setTitle(reason)
                            .build();
                    request.prompt.authenticate(promptInfo);
                } catch (RuntimeException error) {
                    request.reject(ERROR_BIOMETRIC);
                }
            });
        } catch (RuntimeException error) {
            promise.reject(ERROR_BIOMETRIC, TYPE_BIOMETRICS);
        }
    }

    private void cancelActiveAuthentication() {
        UiThreadUtil.runOnUiThread(() -> {
            AuthenticationRequest request = activeRequest;
            if (request == null) return;
            // Settle first: cancellation can synchronously or asynchronously call back.
            request.reject(ERROR_NOT_AVAILABLE);
            if (request.prompt != null) {
                try {
                    request.prompt.cancelAuthentication();
                } catch (RuntimeException ignored) {
                    // The caller is already settled even if a detached prompt cannot cancel.
                }
            }
        });
    }

    @Override
    public void onHostResume() {
        hostPaused = false;
    }

    @Override
    public void onHostPause() {
        hostPaused = true;
        hostGeneration.incrementAndGet();
        cancelActiveAuthentication();
    }

    @Override
    public void onHostDestroy() {
        hostPaused = true;
        hostGeneration.incrementAndGet();
        cancelActiveAuthentication();
    }

    @Override
    public void invalidate() {
        invalidated = true;
        mReactContext.removeLifecycleEventListener(this);
        cancelActiveAuthentication();
        super.invalidate();
    }

    public static String getBiometricError(int errorCode) {
        switch (errorCode) {
            case BiometricPrompt.ERROR_USER_CANCELED:
            case BiometricPrompt.ERROR_NEGATIVE_BUTTON:
                return ERROR_USER_CANCEL;
            case BiometricPrompt.ERROR_HW_NOT_PRESENT:
                return ERROR_NOT_SUPPORTED;
            case BiometricPrompt.ERROR_HW_UNAVAILABLE:
                return ERROR_NOT_AVAILABLE;
            case BiometricPrompt.ERROR_NO_BIOMETRICS:
                return ERROR_NOT_ENROLLED;
            default:
                return ERROR_BIOMETRIC;
        }
    }

    private String getSensorErrors() {
        BiometricManager biometricManager = BiometricManager.from(mReactContext);
        int authResult = biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);

        // can authorize with biometrics
        if (authResult == BiometricManager.BIOMETRIC_SUCCESS) {
            // if sensor is available but the key is not generated
            // or KeyguardSecure is not available return error
            if (!SecurityProvider.isKeyReady() || !SecurityProvider.isKeyguardSecure(mReactContext)) {
                return ERROR_NOT_MEET_SECURITY_REQUIREMENTS;
            }

            // everything seems fine
            return null;
        } else {
            if (authResult == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE) {
                return ERROR_NOT_SUPPORTED;
            } else if (authResult == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
                return ERROR_NOT_ENROLLED;
            } else if (authResult == BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE) {
                return ERROR_NOT_AVAILABLE;
            }
            return ERROR_BIOMETRIC;
        }
    }

    @ReactMethod
    public void authenticate(String reason, final Promise promise) {
        // check for any error before starting authentication
        String error = getSensorErrors();

        // there is an error
        if (error != null) {
            promise.reject(error, "");
            return;
        }

        // before authentication check for finger print change
        // we can do this before authentication but for consonant with iOS we check after auth
        if (SecurityProvider.checkDeviceBiometricChanged()) {
            promise.reject(ERROR_BIOMETRIC_HAS_BEEN_CHANGED, TYPE_BIOMETRICS);
            return;
        }

        // start authentication process
        biometricAuthenticate(reason, promise);
    }

    @ReactMethod
    public void isSensorAvailable(final Promise promise) {
        String error = getSensorErrors();

        // there is error
        if (error != null) {
            promise.reject(error, "");
        } else {
            // can authorize
            promise.resolve(TYPE_BIOMETRICS);
        }
    }

    @ReactMethod
    public void refreshAuthenticationKey(final Promise promise) {
        // remove old invalidated key
        SecurityProvider.deleteInvalidKey();

        // generate new key
        SecurityProvider.generateKey();

        // check if new key is ready
        if (SecurityProvider.isKeyReady()) {
            promise.resolve(true);
            return;
        }
        promise.reject(ERROR_UNABLE_REFRESH_AUTHENTICATION_KEY, "");
    }
}
