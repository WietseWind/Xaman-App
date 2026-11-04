package libs.common;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import expo.modules.updates.IUpdatesController;
import expo.modules.updates.UpdatesController;
import expo.modules.updates.db.entity.UpdateEntity;

/**
 * Over-the-air JS updates: the device-side safety net (revert to the store version, a launch
 * watchdog and a list of updates this device refuses) and launch info for crash reporting.
 */
public final class XamanOta {
    /** Launches of the same downloaded update that may end without markHealthy before the next launch reverts. */
    public static final int WATCHDOG_LIMIT = 3;
    public static final String EMBEDDED_UPDATE_ID = "embedded";

    private static final String PREFS = "XamanOta";
    private static final String KEY_REVERT_PENDING = "revertPending";
    private static final String KEY_BLOCKED = "blockedUpdateIds";
    private static final String KEY_BLOCKED_OTA_IDS = "blockedOtaIds";
    private static final String KEY_LAST_LAUNCH = "lastLaunchUpdateId";
    private static final String KEY_LAST_LAUNCH_OTA_ID = "lastLaunchOtaId";
    private static final String KEY_UNHEALTHY = "unhealthyLaunches";
    private static final String KEY_REVERTED = "revertedUpdateId";
    private static final int BLOCKED_MAX = 20;

    private XamanOta() {
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /**
     * Must run before expo-updates initializes. Wipes every downloaded update when a revert is
     * pending or the watchdog tripped, so expo-updates launches the bundle shipped with the app.
     */
    public static void prepareBeforeStart(@NonNull Context context) {
        SharedPreferences prefs = prefs(context);
        String last = prefs.getString(KEY_LAST_LAUNCH, EMBEDDED_UPDATE_ID);
        boolean watchdogTripped = !EMBEDDED_UPDATE_ID.equals(last) && prefs.getInt(KEY_UNHEALTHY, 0) >= WATCHDOG_LIMIT;
        if (!prefs.getBoolean(KEY_REVERT_PENDING, false) && !watchdogTripped) {
            return;
        }

        SharedPreferences.Editor editor = prefs.edit();
        if (watchdogTripped) {
            block(prefs, editor, last, prefs.getLong(KEY_LAST_LAUNCH_OTA_ID, 0L));
            editor.putString(KEY_REVERTED, last);
        }
        // expo-updates keeps downloaded updates in filesDir/.expo-internal and its state in updates.db
        deleteRecursive(new File(context.getFilesDir(), ".expo-internal"));
        context.deleteDatabase("updates.db");
        editor.putBoolean(KEY_REVERT_PENDING, false)
                .putInt(KEY_UNHEALTHY, 0)
                .putString(KEY_LAST_LAUNCH, EMBEDDED_UPDATE_ID)
                .commit();
    }

    /**
     * Counts a launch for the watchdog. Call only when React Native starts JS for a screen: a
     * process started for a background service (push, Firebase jobs) runs no JS and must not count.
     */
    public static void countLaunch(@NonNull Context context) {
        Map<String, Object> info = launchedUpdateInfo();
        String id = (String) info.get("updateId");
        SharedPreferences prefs = prefs(context);
        String last = prefs.getString(KEY_LAST_LAUNCH, EMBEDDED_UPDATE_ID);
        int unhealthy = prefs.getInt(KEY_UNHEALTHY, 0);

        int next;
        if (EMBEDDED_UPDATE_ID.equals(id)) {
            next = 0;
        } else if (id.equals(last)) {
            next = unhealthy + 1;
        } else {
            next = 1;
        }
        prefs.edit()
                .putInt(KEY_UNHEALTHY, next)
                .putString(KEY_LAST_LAUNCH, id)
                .putLong(KEY_LAST_LAUNCH_OTA_ID, ((Number) info.get("otaId")).longValue())
                .commit();
    }

    /** The update expo-updates picked for this launch: crash reporting and the version shown. */
    public static Map<String, Object> launchedUpdateInfo() {
        Map<String, Object> info = new HashMap<>();
        info.put("updateId", EMBEDDED_UPDATE_ID);
        info.put("otaId", 0L);
        info.put("isEmbedded", true);
        info.put("runtimeVersion", "");
        try {
            IUpdatesController controller = UpdatesController.getInstance();
            if (!controller.isActiveController()) {
                return info;
            }
            IUpdatesController.UpdatesModuleConstants constants = controller.getConstantsForModule();
            if (constants.getRuntimeVersion() != null) {
                info.put("runtimeVersion", constants.getRuntimeVersion());
            }
            UpdateEntity launched = constants.getLaunchedUpdate();
            UpdateEntity embedded = constants.getEmbeddedUpdate();
            if (launched == null || (embedded != null && launched.getId().equals(embedded.getId()))) {
                return info;
            }
            info.put("updateId", launched.getId().toString().toLowerCase(Locale.ROOT));
            info.put("isEmbedded", false);
            JSONObject extra = launched.getManifest().optJSONObject("extra");
            JSONObject xaman = extra != null ? extra.optJSONObject("xaman") : null;
            if (xaman != null) {
                info.put("otaId", xaman.optLong("otaId", 0L));
            }
        } catch (Throwable ignored) {
            // crash reporting info only; never block the launch
        }
        return info;
    }

    /** The running bundle reached a usable screen: reset the watchdog. */
    public static void markHealthy(@NonNull Context context) {
        prefs(context).edit().putInt(KEY_UNHEALTHY, 0).apply();
    }

    /**
     * Revert to the store version on the next launch, and never accept updateId (or any other copy
     * of update otaId) again.
     */
    public static void scheduleRevert(@NonNull Context context, @Nullable String updateId, long otaId) {
        SharedPreferences prefs = prefs(context);
        SharedPreferences.Editor editor = prefs.edit();
        if (updateId != null && !updateId.isEmpty() && !EMBEDDED_UPDATE_ID.equals(updateId)) {
            block(prefs, editor, updateId, otaId);
            editor.putString(KEY_REVERTED, updateId);
        }
        editor.putBoolean(KEY_REVERT_PENDING, true).commit();
    }

    public static boolean isRevertPending(@NonNull Context context) {
        return prefs(context).getBoolean(KEY_REVERT_PENDING, false);
    }

    public static List<String> blockedUpdateIds(@NonNull Context context) {
        return split(prefs(context).getString(KEY_BLOCKED, ""));
    }

    /** The same update can come back under a new uuid (a re-issued GA pointer): block its number too. */
    public static List<String> blockedOtaIds(@NonNull Context context) {
        return split(prefs(context).getString(KEY_BLOCKED_OTA_IDS, ""));
    }

    public static int unhealthyLaunches(@NonNull Context context) {
        return prefs(context).getInt(KEY_UNHEALTHY, 0);
    }

    /** Running under Detox / Espresso: e2e runs test the build itself, not a published update. */
    public static boolean isAutomatedTest() {
        try {
            Class.forName("androidx.test.espresso.Espresso");
            return true;
        } catch (ClassNotFoundException e) {
            return false;
        }
    }

    /** The update this device reverted since the last call, if any. Reported once. */
    @Nullable
    public static String takeRevertedUpdateId(@NonNull Context context) {
        SharedPreferences prefs = prefs(context);
        String id = prefs.getString(KEY_REVERTED, null);
        prefs.edit().remove(KEY_REVERTED).commit();
        return id;
    }

    private static void block(SharedPreferences prefs, SharedPreferences.Editor editor, String updateId, long otaId) {
        editor.putString(KEY_BLOCKED, withAdded(prefs.getString(KEY_BLOCKED, ""), updateId));
        if (otaId > 0) {
            editor.putString(KEY_BLOCKED_OTA_IDS, withAdded(prefs.getString(KEY_BLOCKED_OTA_IDS, ""), String.valueOf(otaId)));
        }
    }

    private static List<String> split(String joined) {
        List<String> values = new ArrayList<>();
        for (String value : joined.split(",")) {
            if (!value.isEmpty()) {
                values.add(value);
            }
        }
        return values;
    }

    private static String withAdded(String joined, String value) {
        List<String> values = split(joined);
        values.remove(value);
        values.add(value);
        if (values.size() > BLOCKED_MAX) {
            values = new ArrayList<>(values.subList(values.size() - BLOCKED_MAX, values.size()));
        }
        return String.join(",", values);
    }

    private static void deleteRecursive(File file) {
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : Arrays.asList(children)) {
                deleteRecursive(child);
            }
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }
}
