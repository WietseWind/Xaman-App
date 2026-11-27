package libs.ui;

import android.app.Activity;
import android.view.View;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.common.LifecycleState;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.uimanager.DisplayMetricsHolder;


@ReactModule(name = KeyboardModule.NAME)
public class KeyboardModule extends ReactContextBaseJavaModule {
    private static final String KEYBOARD_DID_SHOW_EVENT = "KeyboardShow";
    private static final String KEYBOARD_DID_HIDE_EVENT = "KeyboardHide";

    private int lastKeyboardHeight = 0;
    private KeyboardProvider keyboardProvider;
    private boolean geometryObservationWanted;
    private boolean geometryLifecycleRegistered;
    private Activity geometryActivity;
    private KeyboardWindowGeometryObserver geometryObserver;
    private final LifecycleEventListener geometryLifecycle = new LifecycleEventListener() {
        @Override
        public void onHostResume() {
            UiThreadUtil.runOnUiThread(() -> bindWindowGeometryObserver());
        }

        @Override
        public void onHostPause() {
            UiThreadUtil.runOnUiThread(() -> clearWindowGeometryObserver());
        }

        @Override
        public void onHostDestroy() {
            UiThreadUtil.runOnUiThread(() -> clearWindowGeometryObserver());
        }
    };

    KeyboardModule(ReactApplicationContext context) {
        super(context);

        DisplayMetricsHolder.initDisplayMetricsIfNotInitialized(context);
    }

    public static final String NAME = "KeyboardModule";

    @NonNull
    @Override
    public String getName() {
        return NAME;
    }

    void emit(int height) {
        if (height == lastKeyboardHeight) {
            return;
        }
        lastKeyboardHeight = height;
        // keyboard hide
        if (height == 0) {
            this.sendEvent(KEYBOARD_DID_HIDE_EVENT, null);
        } else {
            // keyboard show
            WritableMap endCoordinates = Arguments.createMap();
            endCoordinates.putInt("height", height);

            WritableMap params = Arguments.createMap();
            params.putMap("endCoordinates", endCoordinates);
            this.sendEvent(KEYBOARD_DID_SHOW_EVENT, params);
        }
    }


    @ReactMethod
    public void getWindowGeometry(Promise promise) {
        UiThreadUtil.runOnUiThread(() -> {
            if (geometryObservationWanted) bindWindowGeometryObserver();
            KeyboardWindowGeometry.Result geometry = KeyboardWindowGeometry.read(getCurrentActivity(), keyboardProvider);
            if (geometry == null) {
                promise.resolve(null);
                return;
            }
            WritableMap result = Arguments.createMap();
            result.putDouble("keyboardTop", geometry.keyboardTop);
            if (geometry.visible != null) {
                result.putBoolean("visible", geometry.visible);
            }
            promise.resolve(result);
        });
    }

    @ReactMethod
    public void startWindowGeometryObservation() {
        UiThreadUtil.runOnUiThread(() -> {
            geometryObservationWanted = true;
            if (!geometryLifecycleRegistered) {
                geometryLifecycleRegistered = true;
                getReactApplicationContext().addLifecycleEventListener(geometryLifecycle);
            }
            bindWindowGeometryObserver();
        });
    }

    @ReactMethod
    public void stopWindowGeometryObservation() {
        UiThreadUtil.runOnUiThread(this::stopWindowGeometryObservationOnUiThread);
    }

    private void stopWindowGeometryObservationOnUiThread() {
        geometryObservationWanted = false;
        clearWindowGeometryObserver();
        if (geometryLifecycleRegistered) {
            geometryLifecycleRegistered = false;
            getReactApplicationContext().removeLifecycleEventListener(geometryLifecycle);
        }
    }

    private void clearWindowGeometryObserver() {
        if (geometryObserver != null) geometryObserver.stop();
        geometryObserver = null;
        geometryActivity = null;
    }

    private void bindWindowGeometryObserver() {
        if (!geometryObservationWanted) return;
        if (getReactApplicationContext().getLifecycleState() != LifecycleState.RESUMED) {
            clearWindowGeometryObserver();
            return;
        }
        final Activity activity = getCurrentActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed() || activity.getWindow() == null) {
            clearWindowGeometryObserver();
            return;
        }
        final View decor = activity.getWindow().getDecorView();
        if (decor == null) {
            clearWindowGeometryObserver();
            return;
        }
        if (geometryActivity == activity && geometryObserver != null && geometryObserver.isBoundTo(decor)) return;
        clearWindowGeometryObserver();
        geometryActivity = activity;
        geometryObserver = new KeyboardWindowGeometryObserver(decor, () -> {
            if (!geometryObservationWanted || geometryActivity != activity || getCurrentActivity() != activity
                    || getReactApplicationContext().getLifecycleState() != LifecycleState.RESUMED) return null;
            return KeyboardWindowGeometry.read(activity, keyboardProvider);
        }, (geometry) -> {
            if (!geometryObservationWanted || geometryActivity != activity || getCurrentActivity() != activity
                    || getReactApplicationContext().getLifecycleState() != LifecycleState.RESUMED) return;
            WritableMap result = Arguments.createMap();
            result.putDouble("keyboardTop", geometry.keyboardTop);
            if (geometry.visible != null) result.putBoolean("visible", geometry.visible);
            sendEvent("KeyboardWindowGeometryChanged", result);
        });
        geometryObserver.start();
    }

    @Override
    public void invalidate() {
        UiThreadUtil.runOnUiThread(this::stopWindowGeometryObservationOnUiThread);
        super.invalidate();
    }

    @ReactMethod
    public void startKeyboardListener() {
        UiThreadUtil.runOnUiThread(() -> {
            if (keyboardProvider != null) {
                return;
            }
            final Activity wActivity = getCurrentActivity();
            if (wActivity == null) {
                return;
            }
            keyboardProvider = new KeyboardProvider(wActivity).init();
            keyboardProvider.setHeightListener(height -> {
                int value = Math.round(height / DisplayMetricsHolder.getScreenDisplayMetrics().density);
                emit(value);
            });

        });
    }


    @ReactMethod
    public void stopKeyboardListen() {
        UiThreadUtil.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (keyboardProvider != null) {
                    keyboardProvider.dismiss();
                    keyboardProvider = null;
                }
            }
        });
    }

    @ReactMethod
    public void addListener(String eventName) {
        // Keep: Required for RN built in Event Emitter Calls.
    }

    @ReactMethod
    public void removeListeners(Integer count) {
        // Keep: Required for RN built in Event Emitter Calls.
    }


    private void sendEvent(String event, Object payload) {
        if (getReactApplicationContext().hasActiveReactInstance()) {
            getReactApplicationContext()
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(event, payload);
        }
    }
}

