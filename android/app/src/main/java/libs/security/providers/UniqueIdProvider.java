package libs.security.providers;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import android.provider.Settings;
import android.text.TextUtils;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReactApplicationContext;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import libs.security.crypto.Crypto;
import libs.security.vault.storage.Keychain;

public class UniqueIdProvider {
    private static final String UNIQUE_DEVICE_ID_KEY = "device-unique-id";
    private static final String LAST_KNOWN_PREFS = "xaman_device_id";
    private static final String LAST_KNOWN_ANDROID_ID = "last_known_android_id";

    private Context applicationContent;
    private Keychain keychain;
    private DeviceIdUnlockReport lastUnlockReport;

    public static class DeviceIdUnlockReport {
        public boolean fallbackUsed;
        public boolean storedDifferedFromLive;
    }

    public synchronized UniqueIdProvider init(final ReactApplicationContext context) {
        if (context == null) {
            throw new IllegalArgumentException("Context is required");
        }

        applicationContent = context.getApplicationContext();
        keychain = new Keychain(context);

        return this;
    }

    public static UniqueIdProvider sharedInstance() {
        return SingletonHolder.instance;
    }

    private static class SingletonHolder {
        static final UniqueIdProvider instance = new UniqueIdProvider();
    }


    @SuppressLint("HardwareIds")
    private static String getAndroidId(Context context) {
        return Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ANDROID_ID);
    }


    private void saveDeviceUniqueId(String unique_id) {
        try{
            keychain.setItem(UNIQUE_DEVICE_ID_KEY, "", unique_id);
        } catch (Exception e) {
            // ignore
        }
    }

    @Nullable
    private  String loadDeviceUniqueId() {
        try{
            Map<String, String> item = keychain.getItem(UNIQUE_DEVICE_ID_KEY);

            if (item != null) {
                return Objects.requireNonNull(item.get("password"));
            }
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    void saveLastKnownAndroidId(@NonNull final String unique_id) {
        saveLastKnownAndroidId(unique_id, false);
    }

    /**
     * @param durable commit() so last-known is on disk before a following Keychain wrap write.
     *                apply() is enough for opportunistic backfill.
     */
    private void saveLastKnownAndroidId(@NonNull final String unique_id, final boolean durable) {
        if (applicationContent == null) {
            return;
        }
        SharedPreferences.Editor editor = applicationContent
                .getSharedPreferences(LAST_KNOWN_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(LAST_KNOWN_ANDROID_ID, unique_id);
        if (durable) {
            editor.commit();
        } else {
            editor.apply();
        }
    }

    @Nullable
    String loadLastKnownAndroidId() {
        if (applicationContent == null) {
            return null;
        }
        SharedPreferences prefs = applicationContent.getSharedPreferences(LAST_KNOWN_PREFS, Context.MODE_PRIVATE);
        String value = prefs.getString(LAST_KNOWN_ANDROID_ID, null);
        return TextUtils.isEmpty(value) ? null : value;
    }

    /**
     * Persist an ANDROID_ID that produced a successful vault encrypt or decrypt.
     * Plain prefs first (commit) so last-known survives if Keystore wrap write fails or the process dies.
     * Skip writes when the stored bytes already match.
     */
    public synchronized void persistConfirmedDeviceUniqueId(@NonNull final String unique_id) {
        if (!isUsableAndroidId(unique_id)) {
            return;
        }
        byte[] incoming = toDeviceIdBytes(unique_id);
        if (incoming == null) {
            return;
        }
        if (!Arrays.equals(incoming, toDeviceIdBytes(loadLastKnownAndroidId()))) {
            saveLastKnownAndroidId(unique_id, true);
        }
        if (!Arrays.equals(incoming, toDeviceIdBytes(loadDeviceUniqueId()))) {
            saveDeviceUniqueId(unique_id);
        }
    }

    /**
     * True only when a previous-boot last-known ANDROID_ID exists and live ANDROID_ID bytes differ.
     * False when there is nothing stored to compare.
     */
    public synchronized boolean isLastKnownDeviceIdChanged() {
        if (applicationContent == null) {
            return false;
        }
        byte[] stored = toDeviceIdBytes(loadLastKnownAndroidId());
        byte[] live = toDeviceIdBytes(getAndroidId(applicationContent));
        if (stored == null || live == null) {
            return false;
        }
        return !Arrays.equals(stored, live);
    }

    private static boolean isUsableAndroidId(@Nullable final String unique_id) {
        if (TextUtils.isEmpty(unique_id) || unique_id.equalsIgnoreCase("android_id")) {
            return false;
        }
        for (int i = 0; i < unique_id.length(); i++) {
            if (Character.digit(unique_id.charAt(i), 16) < 0) {
                return false;
            }
        }
        return true;
    }

    @Nullable
    public static byte[] toDeviceIdBytes(@Nullable final String deviceUniqueId) {
        if (!isUsableAndroidId(deviceUniqueId)) {
            return null;
        }

        StringBuilder uniqueId = new StringBuilder(deviceUniqueId);
        while (uniqueId.length() < 16) {
            uniqueId.insert(0, "0");
        }
        if ((uniqueId.length() & 0x01) != 0) {
            uniqueId.insert(0, "0");
        }

        try {
            return Crypto.HexToBytes(uniqueId.toString());
        } catch (RuntimeException e) {
            return null;
        }
    }

    /**
     * Candidate ANDROID_ID values for Cipher V2 decrypt, first match wins.
     * Order: live ANDROID_ID, Keychain cache, last-known plain prefs.
     * Live first so a stored-id success is a real fallback after live fail.
     * Deduped by padded bytes so leading-zero variants are tried once.
     */
    @NonNull
    public synchronized List<String> getDecryptCandidateIds() {
        if (applicationContent == null) {
            return new ArrayList<>();
        }

        LinkedHashMap<String, String> uniqueByBytes = new LinkedHashMap<>();
        addDecryptCandidate(uniqueByBytes, getAndroidId(applicationContent));
        addDecryptCandidate(uniqueByBytes, loadDeviceUniqueId());
        addDecryptCandidate(uniqueByBytes, loadLastKnownAndroidId());
        return new ArrayList<>(uniqueByBytes.values());
    }

    @Nullable
    public synchronized String getLiveAndroidId() {
        if (applicationContent == null) {
            return null;
        }
        String live = getAndroidId(applicationContent);
        return isUsableAndroidId(live) ? live : null;
    }

    public synchronized void clearLastUnlockReport() {
        lastUnlockReport = null;
    }

    /**
     * Record a successful Cipher V2 decrypt. fallbackUsed is true only when live id
     * failed and a stored id then succeeded, and stored != live.
     */
    public synchronized void recordDecryptSuccess(
            @NonNull final String winningDeviceId,
            final boolean liveDecryptFailed
    ) {
        DeviceIdUnlockReport report = new DeviceIdUnlockReport();
        byte[] liveBytes = toDeviceIdBytes(getLiveAndroidId());
        byte[] storedBytes = toDeviceIdBytes(loadLastKnownAndroidId());
        if (storedBytes == null) {
            storedBytes = toDeviceIdBytes(loadDeviceUniqueId());
        }
        byte[] winningBytes = toDeviceIdBytes(winningDeviceId);
        report.storedDifferedFromLive = liveBytes != null
                && storedBytes != null
                && !Arrays.equals(liveBytes, storedBytes);
        report.fallbackUsed = liveDecryptFailed
                && report.storedDifferedFromLive
                && winningBytes != null
                && liveBytes != null
                && !Arrays.equals(winningBytes, liveBytes);
        lastUnlockReport = report;
    }

    @Nullable
    public synchronized DeviceIdUnlockReport consumeLastUnlockReport() {
        DeviceIdUnlockReport report = lastUnlockReport;
        lastUnlockReport = null;
        return report;
    }

    private static void addDecryptCandidate(
            @NonNull final LinkedHashMap<String, String> uniqueByBytes,
            @Nullable final String unique_id
    ) {
        byte[] bytes = toDeviceIdBytes(unique_id);
        if (bytes == null) {
            return;
        }
        String bytesHex = Crypto.BytesToHex(bytes);
        if (!uniqueByBytes.containsKey(bytesHex)) {
            uniqueByBytes.put(bytesHex, unique_id);
        }
    }

    @Nullable
    public synchronized byte[] getDeviceUniqueIdBytes() {
        return toDeviceIdBytes(getDeviceUniqueId());
    }

    @SuppressLint("HardwareIds")
    @Nullable
    public synchronized String getDeviceUniqueId() {
        // check if context is already initiated
        if (applicationContent == null) {
            throw new RuntimeException("Context is required");
        }

        String unique_id = loadDeviceUniqueId();
        if (isUsableAndroidId(unique_id)) {
            if (loadLastKnownAndroidId() == null) {
                saveLastKnownAndroidId(unique_id);
            }
            return unique_id;
        }

        unique_id = loadLastKnownAndroidId();
        if (isUsableAndroidId(unique_id)) {
            return unique_id;
        }

        unique_id = getAndroidId(applicationContent);
        if (!isUsableAndroidId(unique_id)) {
            return null;
        }

        return unique_id;
    }

    public static class BindingHealth {
        public boolean lastKnownPresent;
        public boolean livePresent;
        public boolean lastKnownMatchesLive;
        public boolean uniqueIdKeychainReadable;
    }

    @NonNull
    public synchronized BindingHealth inspectBinding() {
        BindingHealth health = new BindingHealth();
        String live = getLiveAndroidId();
        String lastKnown = loadLastKnownAndroidId();
        health.livePresent = isUsableAndroidId(live);
        health.lastKnownPresent = isUsableAndroidId(lastKnown);
        health.lastKnownMatchesLive = health.livePresent
                && health.lastKnownPresent
                && Arrays.equals(toDeviceIdBytes(live), toDeviceIdBytes(lastKnown));
        health.uniqueIdKeychainReadable = isUsableAndroidId(loadDeviceUniqueId());
        return health;
    }
}
