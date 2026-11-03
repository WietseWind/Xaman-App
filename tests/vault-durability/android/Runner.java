package com.xaman.vaultdurability;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.*;
import android.os.Bundle;
import android.os.Process;
import libs.security.vault.VaultManagerModule;
import libs.security.providers.UniqueIdProvider;
import libs.security.crypto.Crypto;
import libs.security.vault.storage.PrefsStorage;
import libs.security.vault.storage.cipherStorage.CipherStorageKeystoreAesCbc;
import java.nio.charset.StandardCharsets;
import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import javax.crypto.spec.IvParameterSpec;
import com.facebook.react.bridge.ReactApplicationContext;
import java.util.*;
import org.json.*;

/** Only built into a disposable fixture APK with its own application UID. */
public class Runner extends Instrumentation {
    private Bundle arguments;
    @Override public void onCreate(Bundle args) { arguments = args; start(); }

    private void require(boolean value, String message) {
        if (!value) throw new IllegalStateException(message);
    }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            TrackedContext context = new TrackedContext(getTargetContext());
            ReactApplicationContext react = new ReactApplicationContext(context);
            UniqueIdProvider.sharedInstance().init(react);
            VaultManagerModule vault = new VaultManagerModule(react);
            SharedPreferences settings = context.getSharedPreferences("fixture-settings", 0);
            String step = arguments.getString("step", "verify");
            if (step.equals("compat")) {
                vault.clearStorage();
                // The legacy fixture includes its previously stored device ID.
                // Establish it before installing the v1 account record.
                String fixtureId = UniqueIdProvider.sharedInstance().getDeviceUniqueId();
                require(fixtureId != null, "Fixture device binding missing");
                UniqueIdProvider.sharedInstance().persistConfirmedDeviceUniqueId(fixtureId);
                String alias = "LegacyCBC";
                byte[] iv = Crypto.RandomBytes(16);
                byte[] key = Crypto.SHA256Hash("fixture-old-passphrase".getBytes(StandardCharsets.UTF_8));
                Cipher legacy = Cipher.getInstance("AES/CBC/PKCS7Padding");
                legacy.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new IvParameterSpec(iv));
                String encrypted = android.util.Base64.encodeToString(
                        legacy.doFinal("fixture-legacy-secret".getBytes(StandardCharsets.UTF_8)), android.util.Base64.NO_WRAP);
                new PrefsStorage(react).storeEncryptedEntry(alias, new CipherStorageKeystoreAesCbc().encrypt(
                        alias, Crypto.BytesToHex(iv), encrypted));
                require("fixture-legacy-secret".equals(vault.openVault(alias, "fixture-old-passphrase", true)),
                        "Legacy CBC read failed");
                vault.reKeyVault(alias, "fixture-old-passphrase", "fixture-old-passphrase");
                require("fixture-legacy-secret".equals(vault.openVault(alias, "fixture-old-passphrase", true)),
                        "Legacy migration changed secret");
                vault.purgeVault(alias);
                java.security.KeyStore hardware = java.security.KeyStore.getInstance("AndroidKeyStore");
                hardware.load(null);
                require(!hardware.containsAlias(alias), "Legacy wrapping key was not removed");
            } else if (step.equals("seed")) {
                vault.clearStorage();
                require(settings.edit().clear().commit(), "Fixture settings clear failed");
                require(context.getSharedPreferences("fixture-cut", 0).edit().clear().commit(), "Cut reset failed");
                String realmKey = vault.getStorageEncryptionKey();
                for (String name : new String[]{"A", "B"}) vault.createVault(name, "fixture-secret-" + name, "old");
                JSONObject journal = new JSONObject();
                journal.put("version", 1).put("oldKey", "old").put("newKey", "new");
                journal.put("names", new JSONArray(Arrays.asList("A", "B")));
                vault.createVault("xaman-passcode-change-v1", journal.toString(), realmKey);
                require(settings.edit().putString("hash", "old").putString("realmKey", realmKey).commit(), "Fixture settings write failed");
            } else if (step.equals("failed-write")) {
                SharedPreferences prefs = context.getSharedPreferences("RN_KEYCHAIN", 0);
                require(prefs.edit().putBoolean("legacy-bool", true).putInt("legacy-int", 9)
                        .putLong("legacy-long", 123L).putFloat("legacy-float", 1.5f)
                        .putStringSet("legacy-set", new HashSet<>(Arrays.asList("fixture"))).commit(), "Metadata seed failed");
                context.failNextCommit = true;
                boolean failed = false;
                try {
                    vault.createVault("A", "different-fixture-data", "different-key");
                } catch (IllegalStateException expected) {
                    failed = true;
                }
                require(failed, "Ambiguous failed write was acknowledged");
                VaultManagerModule second = new VaultManagerModule(react);
                require("fixture-secret-A".equals(open(second, "A", "old")), "Failed overwrite escaped through cache");
                require(open(second, "A", "different-key") == null, "Failed key became usable");
                require(prefs.getBoolean("legacy-bool", false) && prefs.getInt("legacy-int", 0) == 9
                        && prefs.getLong("legacy-long", 0) == 123L && prefs.getFloat("legacy-float", 0) == 1.5f
                        && prefs.getStringSet("legacy-set", Collections.emptySet()).contains("fixture"), "Legacy metadata changed");
            } else if (step.equals("rekey")) {
                context.cut = Integer.parseInt(arguments.getString("cut", "0"));
                context.before = arguments.getString("phase", "after").equals("before");
                vault.reKeyBatchVaults(new ArrayList<>(Arrays.asList("A", "B")), "old", "new");
                require(settings.edit().putString("hash", "new").commit(), "Fixture hash commit failed");
                // Kill immediately after the settings acknowledgement. No orderly shutdown/flush.
                Process.killProcess(Process.myPid());
                return;
            } else {
                String realmKey = vault.getStorageEncryptionKey();
                require(realmKey.equals(settings.getString("realmKey", "")), "Realm key changed after restart");
                String target = settings.getString("hash", "");
                int expectedCut = Integer.parseInt(arguments.getString("cut", "0"));
                if (expectedCut > 0) {
                    SharedPreferences observed = context.getSharedPreferences("fixture-cut", 0);
                    require(observed.getInt("cut", 0) == expectedCut, "Requested interruption was not reached");
                    require(observed.getBoolean("before", false) ==
                            arguments.getString("phase", "after").equals("before"), "Wrong interruption phase");
                    require(target.equals("old"), "Settings committed before rekey returned");
                } else {
                    require(target.equals(step.equals("failed-write-check") ? "old" : "new"),
                            "Settings do not match the acknowledged operation");
                }
                JSONObject journal = new JSONObject(vault.openVault("xaman-passcode-change-v1", realmKey, true));
                require(journal.getString("oldKey").equals("old") && journal.getString("newKey").equals("new"), "Journal damaged");
                for (String name : new String[]{"A", "B"}) {
                    String clear = open(vault, name, target);
                    if (clear == null) {
                        for (String candidate : new String[]{name, name + "_RECOVER", name + "_PASSCODE_RECOVER"}) {
                            for (String key : new String[]{target, "old", "new"}) {
                                clear = open(vault, candidate, key);
                                if (clear != null) break;
                            }
                            if (clear != null) break;
                        }
                        require(clear != null, "No recoverable vault " + name);
                        String backup = name + "_PASSCODE_RECOVER";
                        if (!vault.vaultExist(backup)) vault.createVault(backup, clear, target);
                        require(clear.equals(open(vault, backup, target)), "Recovery copy mismatch");
                        if (vault.vaultExist(name)) vault.purgeVault(name);
                        vault.createVault(name, clear, target);
                        require(clear.equals(open(vault, name, target)), "Restored vault mismatch");
                    }
                    require(("fixture-secret-" + name).equals(open(vault, name, target)), "Secret mismatch");
                }
                for (String name : new String[]{"A", "B"}) {
                    for (String copy : new String[]{name + "_PASSCODE_RECOVER", name + "_RECOVER"}) {
                        if (vault.vaultExist(copy)) vault.purgeVault(copy);
                    }
                }
                vault.purgeVault("xaman-passcode-change-v1");
                require(!vault.vaultExist("xaman-passcode-change-v1"), "Journal cleanup failed");
            }
            result.putString("stream", "VAULT_FIXTURE_PASSED " + step);
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("stream", "VAULT_FIXTURE_FAILED " + error);
            finish(Activity.RESULT_CANCELED, result);
        }
    }

    private String open(VaultManagerModule vault, String name, String key) {
        try { return vault.openVault(name, key, true); } catch (Exception error) { return null; }
    }

    private static class TrackedContext extends ContextWrapper {
        final Map<String, SharedPreferences> cache = new HashMap<>();
        int cut, commits; boolean before, failNextCommit;
        TrackedContext(Context base) { super(base); }
        @Override public Context getApplicationContext() { return this; }
        @Override public SharedPreferences getSharedPreferences(String name, int mode) {
            if (!name.equals("RN_KEYCHAIN")) return super.getSharedPreferences(name, mode);
            if (!cache.containsKey(name)) cache.put(name, new TrackedPreferences(super.getSharedPreferences(name, mode), this));
            return cache.get(name);
        }
        void boundary(boolean isBefore) {
            if (isBefore) commits++;
            if (cut > 0 && commits == cut && before == isBefore) {
                if (!super.getSharedPreferences("fixture-cut", 0).edit()
                        .putInt("cut", cut).putBoolean("before", before).commit()) {
                    throw new IllegalStateException("Cut observation could not persist");
                }
                Process.killProcess(Process.myPid());
            }
        }
    }

    private static class TrackedPreferences implements SharedPreferences {
        final SharedPreferences prefs; final TrackedContext context;
        TrackedPreferences(SharedPreferences p, TrackedContext c) { prefs = p; context = c; }
        public Map<String, ?> getAll() { return prefs.getAll(); }
        public String getString(String k, String d) { return prefs.getString(k, d); }
        public Set<String> getStringSet(String k, Set<String> d) { return prefs.getStringSet(k, d); }
        public int getInt(String k, int d) { return prefs.getInt(k, d); }
        public long getLong(String k, long d) { return prefs.getLong(k, d); }
        public float getFloat(String k, float d) { return prefs.getFloat(k, d); }
        public boolean getBoolean(String k, boolean d) { return prefs.getBoolean(k, d); }
        public boolean contains(String k) { return prefs.contains(k); }
        public void registerOnSharedPreferenceChangeListener(OnSharedPreferenceChangeListener l) { prefs.registerOnSharedPreferenceChangeListener(l); }
        public void unregisterOnSharedPreferenceChangeListener(OnSharedPreferenceChangeListener l) { prefs.unregisterOnSharedPreferenceChangeListener(l); }
        public Editor edit() { return new TrackedEditor(prefs.edit(), context); }
    }

    private static class TrackedEditor implements SharedPreferences.Editor {
        final SharedPreferences.Editor editor; final TrackedContext context;
        TrackedEditor(SharedPreferences.Editor e, TrackedContext c) { editor = e; context = c; }
        public SharedPreferences.Editor putString(String k, String v) { editor.putString(k, v); return this; }
        public SharedPreferences.Editor putStringSet(String k, Set<String> v) { editor.putStringSet(k, v); return this; }
        public SharedPreferences.Editor putInt(String k, int v) { editor.putInt(k, v); return this; }
        public SharedPreferences.Editor putLong(String k, long v) { editor.putLong(k, v); return this; }
        public SharedPreferences.Editor putFloat(String k, float v) { editor.putFloat(k, v); return this; }
        public SharedPreferences.Editor putBoolean(String k, boolean v) { editor.putBoolean(k, v); return this; }
        public SharedPreferences.Editor remove(String k) { editor.remove(k); return this; }
        public SharedPreferences.Editor clear() { editor.clear(); return this; }
        public boolean commit() {
            context.boundary(true);
            boolean ok = editor.commit();
            context.boundary(false);
            if (context.failNextCommit) {
                context.failNextCommit = false;
                return false;
            }
            return ok;
        }
        public void apply() { editor.apply(); }
    }
}
