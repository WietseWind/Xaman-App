package fixture;

import android.content.SharedPreferences;
import com.facebook.react.bridge.*;
import libs.security.vault.VaultManagerModule;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/** Fault controller for actual PrefsStorage, Keychain and VaultManagerModule.
 * Disk and Keystore state survive a child JVM halt; the preferences cache does not. */
public class Fixture {
    public static Path directory;
    public static Properties keys;
    public static Prefs prefs;
    private static VaultManagerModule manager;
    private static int killEvent, failCommit;
    private static boolean fullAfterFailure, failAfterWrite, throwCommit;
    private static final List<String> events = new ArrayList<>();

    public static void event(String stage) {
        events.add(stage);
        if (killEvent > 0 && events.size() == killEvent) Runtime.getRuntime().halt(77);
    }

    static Properties read(Path path) throws IOException {
        Properties result = new Properties();
        if (Files.exists(path)) try (InputStream input = Files.newInputStream(path)) { result.load(input); }
        return result;
    }

    static void save(Path path, Properties value) {
        try {
            Path temp = path.resolveSibling(path.getFileName() + ".next");
            try (FileOutputStream output = new FileOutputStream(temp.toFile())) {
                value.store(output, "Fixture data only"); output.getFD().sync();
            }
            Files.move(temp, path, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) { throw new IllegalStateException(e); }
    }

    public static void saveKeys() { save(directory.resolve("keys"), keys); }

    public static class Prefs implements SharedPreferences {
        private final Map<String, String> memory = new HashMap<>();
        private int commits;

        Prefs() throws IOException {
            Properties disk = read(directory.resolve("prefs"));
            for (String key : disk.stringPropertyNames()) memory.put(key, disk.getProperty(key));
        }

        public Map<String, ?> getAll() { return new HashMap<>(memory); }
        public String getString(String key, String fallback) { return memory.getOrDefault(key, fallback); }
        public Editor edit() { return new Edit(); }

        private void persist() {
            Properties snapshot = new Properties(); snapshot.putAll(memory);
            save(directory.resolve("prefs"), snapshot);
        }

        class Edit implements Editor {
            private final Map<String, String> put = new HashMap<>();
            private final Set<String> remove = new HashSet<>();
            private boolean clear;

            public Editor remove(String key) { remove.add(key); return this; }
            public Editor putString(String key, String value) { put.put(key, value); return this; }
            public Editor clear() { clear = true; return this; }
            public Editor putInt(String k, int v) { throw new UnsupportedOperationException("String fixture only"); }
            public Editor putLong(String k, long v) { throw new UnsupportedOperationException("String fixture only"); }
            public Editor putFloat(String k, float v) { throw new UnsupportedOperationException("String fixture only"); }
            public Editor putBoolean(String k, boolean v) { throw new UnsupportedOperationException("String fixture only"); }
            public Editor putStringSet(String k, Set<String> v) { throw new UnsupportedOperationException("String fixture only"); }
            private void update() {
                if (clear) memory.clear();
                for (String key : remove) memory.remove(key);
                memory.putAll(put);
            }
            public void apply() { update(); event("apply:unflushed"); }
            public boolean commit() {
                update(); commits++; event("commit:before");
                boolean fails = failCommit > 0 && (commits == failCommit || (fullAfterFailure && commits >= failCommit));
                if (fails && !failAfterWrite) {
                    event("commit:failed");
                    if (throwCommit) throw new IllegalStateException("Injected preference I/O failure");
                    return false;
                }
                persist(); event("commit:after");
                if (fails && throwCommit) throw new IllegalStateException("Injected ambiguous preference I/O failure");
                return !fails;
            }
        }
    }

    static class Result implements Promise {
        boolean settled, failed;
        String value;
        public void resolve(Object result) { settled = true; value = String.valueOf(result); }
        public void reject(String code, String message) { settled = true; failed = true; value = code + ": " + message; }
    }

    private static String invoke(String command, String[] args) throws Exception {
        switch (command) {
            case "create": {
                Result result = new Result(); manager.createVault(args[0], args[1], args[2], result);
                if (!result.settled) throw new IllegalStateException("Native promise did not settle");
                if (result.failed) throw new IllegalStateException(result.value);
                return result.value;
            }
            case "open": return manager.openVault(args[0], args[1], true);
            case "exists": return String.valueOf(manager.vaultExist(args[0]));
            case "purge": {
                Result result = new Result(); manager.purgeVault(args[0], result);
                if (result.failed) throw new IllegalStateException(result.value); return result.value;
            }
            case "rekey": {
                ArrayList<String> names = new ArrayList<>(Arrays.asList(args[0].split(",")));
                return String.valueOf(manager.reKeyBatchVaults(names, args[1], args[2]));
            }
            case "storageKey": {
                Result result = new Result(); manager.getStorageEncryptionKey(result);
                if (result.failed) throw new IllegalStateException(result.value); return result.value;
            }
            case "clear": {
                Result result = new Result(); manager.clearStorage(result);
                if (result.failed) throw new IllegalStateException(result.value); return result.value;
            }
            case "newManager": manager = new VaultManagerModule(new ReactApplicationContext()); return "true";
            case "keyExists": return String.valueOf(keys.containsKey(args[0]));
            case "flushFixtureSeed": prefs.persist(); return "true";
            case "trace": return String.join("\n", events);
            case "race": {
                libs.security.vault.storage.Keychain first = new libs.security.vault.storage.Keychain(new ReactApplicationContext());
                libs.security.vault.storage.Keychain second = new libs.security.vault.storage.Keychain(new ReactApplicationContext());
                java.util.concurrent.atomic.AtomicReference<Throwable> failure = new java.util.concurrent.atomic.AtomicReference<>();
                Thread writer = new Thread(() -> {
                    try { for (int i = 0; i < 30; i++) first.setItem("Race", "fixture-user", "fixture-password"); }
                    catch (Throwable e) { failure.set(e); }
                });
                Thread remover = new Thread(() -> {
                    try { for (int i = 0; i < 30; i++) second.deleteItem("Race"); }
                    catch (Throwable e) { failure.set(e); }
                });
                Thread reader = new Thread(() -> {
                    try { for (int i = 0; i < 60; i++) {
                        Map<String, String> item = second.getItem("Race");
                        if (item != null && !"fixture-password".equals(item.get("password"))) throw new IllegalStateException("Torn read");
                    }} catch (Throwable e) { failure.set(e); }
                });
                writer.start(); remover.start(); reader.start(); writer.join(); remover.join(); reader.join();
                if (failure.get() != null) throw new IllegalStateException(failure.get());
                return "true";
            }
            case "fault":
                killEvent = Integer.parseInt(args[0]); failCommit = Integer.parseInt(args[1]);
                fullAfterFailure = Boolean.parseBoolean(args[2]); failAfterWrite = Boolean.parseBoolean(args[3]);
                throwCommit = args.length > 4 && Boolean.parseBoolean(args[4]);
                prefs.commits = 0; events.clear(); return "true";
            default: throw new IllegalArgumentException(command);
        }
    }

    private static String encode(String value) {
        return Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    public static void main(String[] args) throws Exception {
        directory = Paths.get(args[0]); Files.createDirectories(directory);
        keys = read(directory.resolve("keys")); prefs = new Prefs();
        manager = new VaultManagerModule(new ReactApplicationContext());
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
            for (String line; (line = reader.readLine()) != null;) {
                String[] parts = line.split("\t", -1);
                String[] values = new String[parts.length - 2];
                for (int i = 2; i < parts.length; i++) values[i - 2] = new String(Base64.getDecoder().decode(parts[i]), StandardCharsets.UTF_8);
                try {
                    System.out.println(parts[0] + "\tok\t" + encode(invoke(parts[1], values)));
                } catch (Exception error) {
                    System.out.println(parts[0] + "\terror\t" + encode(error.toString()));
                }
                System.out.flush();
            }
        }
    }
}
