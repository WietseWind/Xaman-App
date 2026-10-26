package fixture;

import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.HashSet;
import libs.security.vault.storage.cipherStorage.CipherStorage;
import libs.security.vault.exceptions.CryptoFailedException;
import libs.security.vault.exceptions.KeyStoreAccessException;

/** Explicit hardware-wrap double: detects deleted/replaced aliases.
 * Not a cipher implementation or a cryptographic-strength test. */
public abstract class FixtureCipher implements CipherStorage {
    public EncryptionResult encrypt(String alias, String user, String password) throws CryptoFailedException {
        try {
            String generation = Fixture.keys.getProperty(alias);
            if (generation == null) {
                generation = java.util.UUID.randomUUID().toString();
                Fixture.event("key-create:before");
                Fixture.keys.setProperty(alias, generation);
                Fixture.saveKeys();
                Fixture.event("key-create:after");
            }
            return new EncryptionResult(encode(generation, user), encode(generation, password), getCipherStorageName());
        } catch (Exception e) {
            throw new CryptoFailedException("Fixture wrap failure", e);
        }
    }

    public DecryptionResult decrypt(String alias, byte[] user, byte[] password) throws CryptoFailedException {
        String generation = Fixture.keys.getProperty(alias);
        if (generation == null) throw new CryptoFailedException("Fixture Keystore alias missing", null);
        return new DecryptionResult(decode(generation, user), decode(generation, password));
    }

    public void removeKey(String alias) throws KeyStoreAccessException {
        Fixture.event("key-delete:before");
        Fixture.keys.remove(alias);
        Fixture.saveKeys();
        Fixture.event("key-delete:after");
    }

    public Set<String> getAllKeys() {
        return new HashSet<>(Fixture.keys.stringPropertyNames());
    }

    private byte[] encode(String generation, String value) {
        return (generation + ":" + value).getBytes(StandardCharsets.UTF_8);
    }

    private String decode(String generation, byte[] bytes) throws CryptoFailedException {
        String value = new String(bytes, StandardCharsets.UTF_8);
        if (!value.startsWith(generation + ":")) throw new CryptoFailedException("Fixture wrapping key replaced", null);
        return value.substring(generation.length() + 1);
    }
}
