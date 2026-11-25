#!/usr/bin/env python3
"""Build the actual Android persistence/manager classes with explicit host API doubles.
Only fixture data is used. The cipher/Keystore doubles model alias lifetime, not crypto strength.
The production algorithms are unchanged and are checked separately on Android.
"""
import os
import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
PRODUCTION = [
    'storage/PrefsStorage.java', 'storage/Keychain.java',
    'storage/cipherStorage/CipherStorage.java',
    'VaultManagerModule.java', 'VaultErrorCodes.java',
    'exceptions/CryptoFailedException.java', 'exceptions/KeyStoreAccessException.java',
]
STUBS = {
    'androidx/annotation/NonNull.java': 'package androidx.annotation; public @interface NonNull {}',
    'androidx/annotation/Nullable.java': 'package androidx.annotation; public @interface Nullable {}',
    'androidx/annotation/StringDef.java': 'package androidx.annotation; public @interface StringDef {String[] value();}',
    'android/content/Context.java': 'package android.content; public class Context {public static final int MODE_PRIVATE=0;}',
    'android/content/SharedPreferences.java': """package android.content; public interface SharedPreferences {
java.util.Map<String,?> getAll(); String getString(String k,String d); Editor edit();
interface Editor {Editor remove(String k);Editor putString(String k,String v);Editor putInt(String k,int v);
Editor putLong(String k,long v);Editor putFloat(String k,float v);Editor putBoolean(String k,boolean v);
Editor putStringSet(String k,java.util.Set<String> v);Editor clear();void apply();boolean commit();}
}""",
    'android/util/Base64.java': """package android.util; public class Base64 {
public static final int DEFAULT=0;
public static String encodeToString(byte[] b,int f){return java.util.Base64.getEncoder().encodeToString(b);}
public static byte[] decode(String b,int f){return java.util.Base64.getDecoder().decode(b);}
}""",
    'android/text/TextUtils.java': 'package android.text; public class TextUtils {public static boolean isEmpty(String s){return s==null||s.isEmpty();}}',
    'com/facebook/react/bridge/ReactApplicationContext.java': """package com.facebook.react.bridge;
public class ReactApplicationContext extends android.content.Context {
public android.content.SharedPreferences getSharedPreferences(String n,int m){return fixture.Fixture.prefs;}
public java.io.File getFilesDir(){return fixture.Fixture.directory.toFile();}
}""",
    'com/facebook/react/bridge/ReactContextBaseJavaModule.java': """package com.facebook.react.bridge;
public abstract class ReactContextBaseJavaModule {
private ReactApplicationContext context;
public ReactContextBaseJavaModule(ReactApplicationContext c){context=c;}
public ReactApplicationContext getReactApplicationContext(){return context;}
public abstract String getName();public java.util.Map<String,Object> getConstants(){return null;}
}""",
    'com/facebook/react/bridge/ReactMethod.java': 'package com.facebook.react.bridge; public @interface ReactMethod {}',
    'com/facebook/react/module/annotations/ReactModule.java': 'package com.facebook.react.module.annotations; public @interface ReactModule {String name();}',
    'com/facebook/react/bridge/Promise.java': 'package com.facebook.react.bridge; public interface Promise {void resolve(Object x);void reject(String c,String m);}',
    'com/facebook/react/bridge/ReadableArray.java': 'package com.facebook.react.bridge; public interface ReadableArray {java.util.ArrayList<Object> toArrayList();}',
    'com/facebook/react/bridge/WritableMap.java': """package com.facebook.react.bridge; public class WritableMap extends java.util.HashMap<String,Object> {
public void putString(String k,String v){put(k,v);}public void putBoolean(String k,boolean v){put(k,v);}
public void putInt(String k,int v){put(k,v);}}""",
    'com/facebook/react/bridge/Arguments.java': 'package com.facebook.react.bridge; public class Arguments {public static WritableMap createMap(){return new WritableMap();}}',
    'libs/security/providers/UniqueIdProvider.java': """package libs.security.providers; public class UniqueIdProvider {
public static final String UNIQUE_DEVICE_ID_KEY="fixture-device-id";
static final UniqueIdProvider INSTANCE=new UniqueIdProvider();
public static UniqueIdProvider sharedInstance(){return INSTANCE;}
public UniqueIdProvider init(Object c){return this;}
public boolean isLastKnownDeviceIdChanged(){return false;}
public void clearLastKnownAndroidId(){}
public DeviceIdUnlockReport consumeLastUnlockReport(){return null;}
public BindingHealth inspectBinding(){return new BindingHealth();}
public static class DeviceIdUnlockReport {public boolean fallbackUsed,storedDifferedFromLive;}
public static class BindingHealth {public boolean lastKnownPresent,livePresent,lastKnownMatchesLive,uniqueIdKeychainReadable;}
}""",
    'libs/security/vault/cipher/Cipher.java': """package libs.security.vault.cipher;
public class Cipher {
public static class DerivedKeys {public int version=2;public String key;public String toJSONString(){return key;}}
public static int getLatestCipherVersion(){return 2;}
public static DerivedKeys getDerivedKeys(String s){return new DerivedKeys();}
public static java.util.Map<String,Object> encrypt(String data,String key){
DerivedKeys d=new DerivedKeys();d.key=key;java.util.Map<String,Object> r=new java.util.HashMap<>();r.put("derived_keys",d);r.put("cipher",data);return r;}
public static String decrypt(String data,String key,String expected) throws Exception {
if(!key.equals(expected))throw new Exception("Wrong fixture key");return data;}
}""",
}
for cipher, name in [('Gcm', 'KeystoreAESGCM'), ('Cbc', 'KeystoreAESCBC')]:
    STUBS['libs/security/vault/storage/cipherStorage/CipherStorageKeystoreAes' + cipher + '.java'] = (
        'package libs.security.vault.storage.cipherStorage;'
        'public class CipherStorageKeystoreAes' + cipher + ' extends fixture.FixtureCipher {'
        'public String getCipherStorageName(){return "' + name + '";}}'
    )

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-ref', help='Compile production sources from an earlier Git revision')
    args = parser.parse_args()
    def read_production(source):
        if args.source_ref:
            return subprocess.check_output(
                ['git', 'show', args.source_ref + ':' + str(source.relative_to(ROOT))],
                cwd=ROOT, text=True,
            )
        return source.read_text()
    java_home = os.environ.get('JAVA_HOME', '/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home')
    javac = str(Path(java_home) / 'bin/javac') if Path(java_home).exists() else 'javac'
    with tempfile.TemporaryDirectory(prefix='xaman-durability-') as temp:
        folder = Path(temp)
        for name, source in STUBS.items():
            target = folder / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(source)
        native = ROOT / 'android/app/src/main/java/libs/security/vault'
        for relative in PRODUCTION:
            target = folder / 'libs/security/vault' / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(read_production(native / relative))
        target = folder / 'libs/security/crypto/Crypto.java'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(read_production(ROOT / 'android/app/src/main/java/libs/security/crypto/Crypto.java'))
        for source in (ROOT / 'tests/vault-durability/native').glob('*.java'):
            target = folder / 'fixture' / source.name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        classes = folder / 'classes'
        subprocess.run([javac, '-d', str(classes), *map(str, folder.rglob('*.java'))], check=True)
        subprocess.run(['node', str(ROOT / 'tests/vault-durability/run.cjs'), str(classes), java_home], cwd=ROOT, check=True)

if __name__ == '__main__':
    main()
