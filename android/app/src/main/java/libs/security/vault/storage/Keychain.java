package libs.security.vault.storage;

import androidx.annotation.NonNull;
import androidx.annotation.StringDef;

import com.facebook.react.bridge.ReactApplicationContext;

import libs.security.vault.storage.PrefsStorage.ResultSet;
import libs.security.vault.storage.cipherStorage.CipherStorage;
import libs.security.vault.storage.cipherStorage.CipherStorage.DecryptionResult;
import libs.security.vault.storage.cipherStorage.CipherStorage.EncryptionResult;
import libs.security.vault.storage.cipherStorage.CipherStorageKeystoreAesCbc;
import libs.security.vault.exceptions.CryptoFailedException;
import libs.security.vault.exceptions.KeyStoreAccessException;
import libs.security.vault.storage.cipherStorage.CipherStorageKeystoreAesGcm;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public class Keychain {
    /**
     * Options mapping keys.
     */
    @interface Maps {
        String USERNAME = "username";
        String PASSWORD = "password";
    }

    /**
     * Supported ciphers.
     */
    @StringDef({KnownCiphers.AESCBC, KnownCiphers.AESGCM})
    public @interface KnownCiphers {
        /**
         * AES encryption.
         */

        // CBC
        String AESCBC = "KeystoreAESCBC";
        // GCM
        String AESGCM = "KeystoreAESGCM";
    }

    /**
     * Name-to-instance lookup  map.
     */
    private final Map<String, CipherStorage> cipherStorageMap = new HashMap<>();
    /**
     * Shared preferences storage.
     */
    private final PrefsStorage prefsStorage;
    //endregion

    //region Initialization

    /**
     * Default constructor.
     */
    public Keychain(@NonNull final ReactApplicationContext reactContext) {
        // create prefs storage
        prefsStorage = new PrefsStorage(reactContext);

        // add supported cipher storage
        addCipherStorageToMap(new CipherStorageKeystoreAesCbc());
        addCipherStorageToMap(new CipherStorageKeystoreAesGcm());
    }

    public void setItem(@NonNull final String alias,
                        @NonNull final String username,
                        @NonNull final String password) throws CryptoFailedException {
        synchronized (PrefsStorage.STORAGE_LOCK) {
            // get latest cipher storage
            final CipherStorage storage = getCipherStorageForEncryption();

            // encrypt with cipher storage
            final EncryptionResult result = storage.encrypt(alias, username, password);

            // set in prefs storage
            prefsStorage.storeEncryptedEntry(alias, result);
        }
    }

    public Map<String, String> getItem(@NonNull final String alias) throws CryptoFailedException {
        synchronized (PrefsStorage.STORAGE_LOCK) {
            final ResultSet resultSet = prefsStorage.getEncryptedEntry(alias);

            // no entry found for given name
            if (resultSet == null) {
                return null;
            }

            final String storageName = resultSet.cipherStorageName;

            CipherStorage cipher = getCipherStorageByName(storageName);

            final DecryptionResult decryptionResult = decryptToResult(alias, cipher, resultSet);

            Map<String, String> item = new HashMap<>();

            item.put(Maps.USERNAME, decryptionResult.username);
            item.put(Maps.PASSWORD, decryptionResult.password);

            return item;
        }
    }

    public void deleteItem(@NonNull final String alias) throws KeyStoreAccessException {
        synchronized (PrefsStorage.STORAGE_LOCK) {
            // If this fails, retain the Keystore key for the still-durable
            // ciphertext. Deleting the key first makes a failed purge permanent.
            prefsStorage.removeEntry(alias);
            // Both wrappers use the same alias namespace. Also clean up a key
            // left by a prior failed purge whose preferences retry has completed.
            getCipherStorageForEncryption().removeKey(alias);
        }
    }

    public boolean itemExist(@NonNull final String alias) {
        final ResultSet resultSet = prefsStorage.getEncryptedEntry(alias);
        return resultSet != null;
    }

    @NonNull
    public Set<String> getAllAliases() {
        return prefsStorage.getAllEntries();
    }

    /*
     * Persist an empty ciphertext store first; do not destroy any Keystore key
     * when the preferences wipe fails. Keystore cleanup remains best effort
     * when the device Keystore itself is unavailable.
     */
    public void clear() {
        synchronized (PrefsStorage.STORAGE_LOCK) {
            final Set<String> entries = prefsStorage.clearAll();
            for (String entry : entries) {
                try {
                    // CBC and GCM use the same AndroidKeyStore alias namespace.
                    getCipherStorageForEncryption().removeKey(entry);
                } catch (KeyStoreAccessException ignored) {
                    // No ciphertext remains after the acknowledged wipe.
                }
            }
        }
    }

    private void addCipherStorageToMap(@NonNull final CipherStorage cipherStorage) {
        cipherStorageMap.put(cipherStorage.getCipherStorageName(), cipherStorage);
    }

    /**
     * Try to decrypt with provided storage.
     */
    @NonNull
    private DecryptionResult decryptToResult(@NonNull final String alias,
                                             @NonNull final CipherStorage storage,
                                             @NonNull final ResultSet resultSet)
            throws CryptoFailedException {
        return storage.decrypt(alias, resultSet.username, resultSet.password);
    }

    /**
     * use the most strong cipher storage encryption
     */
    @NonNull
    CipherStorage getCipherStorageForEncryption() {
        return getCipherStorageByName(KnownCiphers.AESGCM);
    }

    /**
     * Extract cipher by it unique name. {@link CipherStorage#getCipherStorageName()}.
     */
    @NonNull
    CipherStorage getCipherStorageByName(@KnownCiphers @NonNull final String knownName) {
        return Objects.requireNonNull(cipherStorageMap.get(knownName));
    }
}
