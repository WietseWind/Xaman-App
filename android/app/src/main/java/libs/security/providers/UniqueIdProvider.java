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

    private void saveLastKnownAndroidId(@NonNull final String unique_id) {
        if (applicationContent == null) {
            return;
        }
        applicationContent.getSharedPreferences(LAST_KNOWN_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(LAST_KNOWN_ANDROID_ID, unique_id)
                .apply();
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
     * Plain prefs first so the value survives Keystore wrap-key loss.
     */
    public synchronized void persistConfirmedDeviceUniqueId(@NonNull final String unique_id) {
        if (!isUsableAndroidId(unique_id)) {
            return;
        }
        saveLastKnownAndroidId(unique_id);
        saveDeviceUniqueId(unique_id);
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
     * Order: Keychain cache, last-known plain prefs, live ANDROID_ID.
     * Deduped by padded bytes so leading-zero variants are tried once.
     */
    @NonNull
    public synchronized List<String> getDecryptCandidateIds() {
        if (applicationContent == null) {
            throw new RuntimeException("Context is required");
        }

        LinkedHashMap<String, String> uniqueByBytes = new LinkedHashMap<>();
        addDecryptCandidate(uniqueByBytes, loadDeviceUniqueId());
        addDecryptCandidate(uniqueByBytes, loadLastKnownAndroidId());
        addDecryptCandidate(uniqueByBytes, getAndroidId(applicationContent));
        return new ArrayList<>(uniqueByBytes.values());
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

        saveLastKnownAndroidId(unique_id);
        return unique_id;
    }
}
