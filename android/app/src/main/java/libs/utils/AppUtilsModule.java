package libs.utils;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.Looper;
import android.graphics.Bitmap;
import android.view.WindowManager;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import com.facebook.common.executors.CallerThreadExecutor;
import com.facebook.common.references.CloseableReference;
import com.facebook.imagepipeline.datasource.BaseBitmapDataSubscriber;
import com.facebook.datasource.DataSource;
import com.facebook.drawee.backends.pipeline.Fresco;
import com.facebook.imagepipeline.common.ResizeOptions;
import com.facebook.imagepipeline.common.ImageDecodeOptions;
import com.facebook.imagepipeline.image.CloseableImage;
import com.facebook.imagepipeline.request.ImageRequest;
import com.facebook.imagepipeline.request.ImageRequestBuilder;
import com.facebook.react.views.imagehelper.ImageSource;

@ReactModule(name = AppUtilsModule.NAME)
public class AppUtilsModule extends ReactContextBaseJavaModule {
    protected final ReactApplicationContext reactContext;

    public AppUtilsModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    static final String NAME = "AppUtilsModule";

    /** Sample through the existing Fresco pipeline/cache, with bounded pixel/bridge work. */
    @ReactMethod
    public void getImageSample(String uri, Promise promise) {
        if (uri == null || uri.isEmpty()) { promise.resolve(Arguments.createArray()); return; }
        AtomicBoolean finished = new AtomicBoolean(false);
        try {
            ImageSource image = new ImageSource(reactContext, uri);
            ImageRequest request = ImageRequestBuilder.newBuilderWithSource(image.getUri())
                    .setResizeOptions(new ResizeOptions(32, 32))
                    .setImageDecodeOptions(ImageDecodeOptions.newBuilder()
                            .setBitmapConfig(Bitmap.Config.ARGB_8888).build()).build();
            DataSource<CloseableReference<CloseableImage>> source =
                    Fresco.getImagePipeline().fetchDecodedImage(request, reactContext);
            Handler handler = new Handler(Looper.getMainLooper());
            Runnable timeout = () -> {
                if (finished.compareAndSet(false, true)) {
                    source.close(); promise.resolve(Arguments.createArray());
                }
            };
            handler.postDelayed(timeout, 8000);
            source.subscribe(new BaseBitmapDataSubscriber() {
                @Override
                protected void onNewResultImpl(Bitmap original) {
                    if (!finished.compareAndSet(false, true)) return;
                    handler.removeCallbacks(timeout);
                    WritableArray sample = Arguments.createArray();
                    Bitmap scaled = null;
                    try {
                        if (original != null) {
                            scaled = Bitmap.createScaledBitmap(original, 32, 32, true);
                            int[] pixels = new int[1024];
                            scaled.getPixels(pixels, 0, 32, 0, 0, 32, 32);
                            for (int pixel : pixels) sample.pushDouble(pixel & 0xffffffffL);
                        }
                    } catch (Exception ignored) { sample = Arguments.createArray(); }
                    finally {
                        if (scaled != null && scaled != original) scaled.recycle();
                    }
                    promise.resolve(sample);
                }
                @Override
                protected void onFailureImpl(DataSource<CloseableReference<CloseableImage>> result) {
                    if (finished.compareAndSet(false, true)) {
                        handler.removeCallbacks(timeout); promise.resolve(Arguments.createArray());
                    }
                }
            }, CallerThreadExecutor.getInstance());
        } catch (Exception ignored) {
            if (finished.compareAndSet(false, true)) promise.resolve(Arguments.createArray());
        }
    }

    @NonNull
    @Override
    public String getName() {
        return NAME;
    }


    private String getAppBuildNumber(){
        try {
            PackageInfo pInfo = reactContext.getPackageManager().getPackageInfo(getReactApplicationContext().getPackageName(), 0);
            return Integer.toString(pInfo.versionCode);
        } catch (Exception e) {
            return "unknown";
        }
    }

    private String getAppVersion(){
        try {
            PackageInfo pInfo = reactContext.getPackageManager().getPackageInfo(getReactApplicationContext().getPackageName(), 0);
            return pInfo.versionName;
        } catch (Exception e) {
            return "unknown";
        }
    }

    private Boolean isDebug(){
        try {
            ApplicationInfo aInfo = reactContext.getApplicationContext().getApplicationInfo();
            return (aInfo.flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public Map<String, Object> getConstants() {
        final Map<String, Object> constants = new HashMap<>();
        constants.put("appVersion", this.getAppVersion());
        constants.put("buildNumber", this.getAppBuildNumber());
        constants.put("isDebug", this.isDebug());
        constants.put("isTestFlight", false);
        return constants;
    }


    /**
     * @author kristiansorens
     */
    @ReactMethod
    public void setFlagSecure(Boolean enable, Promise promise) {
        final Activity activity = getCurrentActivity();
        // Debug APK never sets FLAG_SECURE so screencap and e2e can capture the UI.
        final boolean applySecure = Boolean.TRUE.equals(enable) && !Boolean.TRUE.equals(isDebug());

        if (activity != null) {
            activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (applySecure) {
                        activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                    } else {
                        activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
                    }

                }
            });
        }

        promise.resolve(true);
    }


    @ReactMethod
    public void isFlagSecure(Promise promise) {
        if (Boolean.TRUE.equals(isDebug())) {
            promise.resolve(false);
            return;
        }

        final Activity activity = getCurrentActivity();

        if (activity != null) {
            if ((activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0) {
                promise.resolve(true);
            } else {
                promise.resolve(false);
            }
        } else {
            promise.resolve(false);
        }
    }


    @ReactMethod
    public void restartBundle() {
        PackageManager packageManager = reactContext.getPackageManager();
        Intent intent = packageManager.getLaunchIntentForPackage(reactContext.getPackageName());
        ComponentName componentName = intent.getComponent();
        Intent mainIntent = Intent.makeRestartActivityTask(componentName);
        reactContext.startActivity(mainIntent);
        Runtime.getRuntime().exit(0);
    }

    @ReactMethod
    public void exitApp() {
        android.os.Process.killProcess(android.os.Process.myPid());
        System.exit(1);
    }

    @ReactMethod
    public void timeoutEvent(final String id, final int timeout) {
        Handler handler = new Handler();
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (getReactApplicationContext().hasActiveReactInstance()) {
                    getReactApplicationContext()
                            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                            .emit("Utils.timeout", id);
                }
            }
        }, timeout);
    }

    @ReactMethod
    public void addListener(String eventName) {
        // Keep: Required for RN built in Event Emitter Calls.
    }

    @ReactMethod
    public void removeListeners(Integer count) {
        // Keep: Required for RN built in Event Emitter Calls.
    }
}
