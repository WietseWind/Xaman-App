/*
react-native-keychain
Copyright (c) 2015 Joel Arvidsson
 */

package libs.security.vault.storage;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReactApplicationContext;

import java.util.HashSet;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.WeakHashMap;

import libs.security.vault.storage.Keychain.KnownCiphers;
import libs.security.vault.storage.cipherStorage.CipherStorage;
import libs.security.vault.storage.cipherStorage.CipherStorage.EncryptionResult;

public class PrefsStorage {
    public static final String KEYCHAIN_DATA = "RN_KEYCHAIN";

    // One lock spans every Keychain/PrefsStorage instance for this process.
    // Android shares a preferences cache; commit(false) still mutates that cache.
    static final Object STORAGE_LOCK = new Object();
    private static final String DURABILITY_BARRIER = "__xaman_durability_barrier__";
    private static final Map<SharedPreferences, PersistenceState> STATES = new WeakHashMap<>();

    private static class PersistenceState {
        boolean uncertain;
        Map<String, Object> rollback;
        final Set<String> wipeAliases = new HashSet<>();
    }

    static public class ResultSet extends CipherStorage.CipherResult<byte[]> {
        @KnownCiphers
        public final String cipherStorageName;

        public ResultSet(@KnownCiphers final String cipherStorageName, final byte[] usernameBytes, final byte[] passwordBytes) {
            super(usernameBytes, passwordBytes);

            this.cipherStorageName = cipherStorageName;
        }
    }

    @NonNull
    private final SharedPreferences prefs;

    public PrefsStorage(@NonNull final ReactApplicationContext reactContext) {
        this.prefs = reactContext.getSharedPreferences(KEYCHAIN_DATA, Context.MODE_PRIVATE);
    }

    private PersistenceState persistenceState() {
        PersistenceState state = STATES.get(prefs);
        if (state == null) {
            state = new PersistenceState();
            STATES.put(prefs, state);
        }
        return state;
    }

    // Caller holds STORAGE_LOCK. A failed commit mutates Android's cache but
    // must not turn into an implicitly successful overwrite on the next read.
    private void commitOrThrow(SharedPreferences.Editor editor) {
        final PersistenceState state = persistenceState();
        if (!state.uncertain) {
            state.rollback = new HashMap<>();
            for (Map.Entry<String, ?> entry : prefs.getAll().entrySet()) {
                final Object value = entry.getValue();
                state.rollback.put(entry.getKey(), value instanceof Set ? new HashSet<>((Set<?>) value) : value);
            }
        }
        state.uncertain = true;
        persistOrThrow(editor);
    }

    private void persistOrThrow(SharedPreferences.Editor editor) {
        // Force a full snapshot write, including on a retry whose cache already
        // contains the restored values. Do not use a no-op commit as a barrier.
        if (!editor.putString(DURABILITY_BARRIER, UUID.randomUUID().toString()).commit()) {
            throw new IllegalStateException("Unable to persist keychain storage");
        }
        final PersistenceState state = persistenceState();
        state.uncertain = false;
        state.rollback = null;
    }

    @SuppressWarnings("unchecked")
    private void requireDurableCache() {
        final PersistenceState state = persistenceState();
        if (!state.uncertain) return;
        final SharedPreferences.Editor restore = prefs.edit().clear();
        for (Map.Entry<String, Object> entry : state.rollback.entrySet()) {
            final String key = entry.getKey();
            final Object value = entry.getValue();
            if (value instanceof String) restore.putString(key, (String) value);
            else if (value instanceof Integer) restore.putInt(key, (Integer) value);
            else if (value instanceof Long) restore.putLong(key, (Long) value);
            else if (value instanceof Float) restore.putFloat(key, (Float) value);
            else if (value instanceof Boolean) restore.putBoolean(key, (Boolean) value);
            else if (value instanceof Set) restore.putStringSet(key, (Set<String>) value);
            else throw new IllegalStateException("Unsupported keychain preference value");
        }
        // Only expose the old snapshot after its restoration is acknowledged.
        // Retain it if this also fails, including an ambiguous/partially written result.
        persistOrThrow(restore);
    }

    @Nullable
    public ResultSet getEncryptedEntry(@NonNull final String service) {
        synchronized (STORAGE_LOCK) {
            requireDurableCache();
            final byte[] username = getBytesForUsername(service);
            final byte[] password = getBytesForPassword(service);
            final String cipher = getCipherStorageName(service);
            if (username == null || password == null || cipher == null) {
                return null;
            }
            return new ResultSet(cipher, username, password);
        }
    }

    public void removeEntry(@NonNull final String service) {
        synchronized (STORAGE_LOCK) {
            requireDurableCache();
            // A failed removal can hide the entry in Android's cache. Retain
            // its alias so a subsequent full wipe still cleans its wrapping key.
            persistenceState().wipeAliases.add(service);
            commitOrThrow(prefs.edit()
                    .remove(getKeyForUsername(service))
                    .remove(getKeyForPassword(service))
                    .remove(getKeyForCipherStorage(service)));
        }
    }

    /**
     * Persist the empty store before any Keystore keys are deleted. A wipe may
     * retry directly even if persisting a previous, larger snapshot failed.
     * Keep the aliases across failed wipe attempts for subsequent key cleanup.
     */
    public Set<String> clearAll() {
        synchronized (STORAGE_LOCK) {
            final PersistenceState state = persistenceState();
            state.wipeAliases.addAll(getAllEntriesUnchecked());
            if (state.rollback != null) {
                for (String key : state.rollback.keySet()) {
                    if (isKeyForUsername(key)) state.wipeAliases.add(getAliasForUsername(key));
                }
            }
            commitOrThrow(prefs.edit().clear());
            final Set<String> aliases = new HashSet<>(state.wipeAliases);
            state.wipeAliases.clear();
            return aliases;
        }
    }

    public void storeEncryptedEntry(@NonNull final String service, @NonNull final EncryptionResult result) {
        synchronized (STORAGE_LOCK) {
            requireDurableCache();
            persistenceState().wipeAliases.add(service);
            commitOrThrow(prefs.edit()
                    .putString(getKeyForUsername(service), Base64.encodeToString(result.username, Base64.DEFAULT))
                    .putString(getKeyForPassword(service), Base64.encodeToString(result.password, Base64.DEFAULT))
                    .putString(getKeyForCipherStorage(service), result.cipherName));
        }
    }

    public Set<String> getAllEntries() {
        synchronized (STORAGE_LOCK) {
            requireDurableCache();
            return getAllEntriesUnchecked();
        }
    }

    private Set<String> getAllEntriesUnchecked() {
        final Set<String> result = new HashSet<>();
        for (String key : prefs.getAll().keySet()) {
            if (isKeyForUsername(key)) {
                result.add(getAliasForUsername(key));
            }
        }
        return result;
    }

    @Nullable
    private byte[] getBytesForUsername(@NonNull final String service) {
        final String key = getKeyForUsername(service);

        return getBytes(key);
    }

    @Nullable
    private byte[] getBytesForPassword(@NonNull final String service) {
        String key = getKeyForPassword(service);
        return getBytes(key);
    }

    @Nullable
    private String getCipherStorageName(@NonNull final String service) {
        String key = getKeyForCipherStorage(service);

        return this.prefs.getString(key, null);
    }

    @NonNull
    public static String getKeyForUsername(@NonNull final String service) {
        return service + ":" + "u";
    }

    @NonNull
    public static String getKeyForPassword(@NonNull final String service) {
        return service + ":" + "p";
    }

    @NonNull
    public static String getKeyForCipherStorage(@NonNull final String service) {
        return service + ":" + "c";
    }

    public static boolean isKeyForUsername(@NonNull final String key) {
        return key.endsWith(":u");
    }

    public static String getAliasForUsername(@NonNull final String key) {
        if (!key.endsWith(":u")) {
            return null;
        }

        return key.replace(":u", "");
    }

    @Nullable
    private byte[] getBytes(@NonNull final String key) {
        String value = this.prefs.getString(key, null);

        if (value != null) {
            return Base64.decode(value, Base64.DEFAULT);
        }

        return null;
    }
}
