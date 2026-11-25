package libs.common;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

/**
 * Device-side safety net for over-the-air updates, see {@link XamanOta}.
 */
public class OtaRecoveryModule extends ReactContextBaseJavaModule {
    OtaRecoveryModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return "OtaRecoveryModule";
    }

    /** The running bundle reached a usable screen: reset the launch watchdog. */
    @ReactMethod
    public void markHealthy() {
        XamanOta.markHealthy(getReactApplicationContext());
    }

    /** Revert to the store version on the next launch, and never accept updateId (or update otaId) again. */
    @ReactMethod
    public void scheduleRevert(@Nullable String updateId, double otaId, Promise promise) {
        XamanOta.scheduleRevert(getReactApplicationContext(), updateId, (long) otaId);
        promise.resolve(true);
    }

    @ReactMethod
    public void getState(Promise promise) {
        ReactApplicationContext context = getReactApplicationContext();

        WritableArray blocked = Arguments.createArray();
        for (String id : XamanOta.blockedUpdateIds(context)) {
            blocked.pushString(id);
        }
        WritableArray blockedOtaIds = Arguments.createArray();
        for (String otaId : XamanOta.blockedOtaIds(context)) {
            blockedOtaIds.pushDouble(Double.parseDouble(otaId));
        }

        WritableMap state = Arguments.createMap();
        state.putArray("blockedUpdateIds", blocked);
        state.putArray("blockedOtaIds", blockedOtaIds);
        String reverted = XamanOta.takeRevertedUpdateId(context);
        if (reverted == null) {
            state.putNull("revertedUpdateId");
        } else {
            state.putString("revertedUpdateId", reverted);
        }
        state.putBoolean("revertPending", XamanOta.isRevertPending(context));
        state.putInt("unhealthyLaunches", XamanOta.unhealthyLaunches(context));
        state.putInt("watchdogLimit", XamanOta.WATCHDOG_LIMIT);
        state.putBoolean("automatedTest", XamanOta.isAutomatedTest());
        promise.resolve(state);
    }
}
