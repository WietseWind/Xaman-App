#!/usr/bin/env python3
"""Exercise the production native vault/storage/cipher classes in an isolated APK.
Requires an explicitly selected emulator; the APK has a distinct UID and no wallet data.
Host recovery matrix remains in compile.py; this runner checks real Android Keystore,
SharedPreferences and immediate process death before/after native commit boundaries.
"""
import argparse
import importlib.util
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = 'com.xaman.vaultdurability'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--serial', required=True)
    parser.add_argument('--offline', action='store_true')
    parser.add_argument('--compat-only', action='store_true')
    parser.add_argument('--sdk', default=os.environ.get('ANDROID_HOME', str(Path.home() / 'Library/Android/sdk')))
    args = parser.parse_args()
    if not args.serial.startswith('emulator-'):
        raise SystemExit('Only a dedicated emulator is accepted')
    sdk = Path(args.sdk)
    adb = str(sdk / 'platform-tools/adb')
    def device(*command, check=True, timeout=120):
        result = subprocess.run([adb, '-s', args.serial, *command], text=True, capture_output=True, timeout=timeout)
        if check and result.returncode:
            raise RuntimeError(result.stdout + result.stderr)
        return result.stdout + result.stderr

    end = time.monotonic() + 180
    while time.monotonic() < end:
        if device('shell', 'getprop', 'sys.boot_completed', check=False).strip() == '1':
            break
        time.sleep(2)
    else:
        raise SystemExit('Dedicated emulator did not boot')
    if device('shell', 'getprop', 'ro.kernel.qemu').strip() != '1':
        raise SystemExit('Refusing a non-emulator target')

    spec = importlib.util.spec_from_file_location('vault_fixture_compiler', Path(__file__).with_name('compile.py'))
    compiler = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(compiler)
    with tempfile.TemporaryDirectory(prefix='xaman-android-vault-apk-') as temp:
        folder = Path(temp)
        sources = folder / 'src/main/java'
        for relative, source in compiler.STUBS.items():
            if not (relative.startswith('androidx/annotation/') or relative.startswith('com/facebook/react/')):
                continue
            if relative.endswith('ReactApplicationContext.java'):
                source = """package com.facebook.react.bridge;
public class ReactApplicationContext extends android.content.ContextWrapper {
public ReactApplicationContext(android.content.Context context){super(context);}
@Override public android.content.Context getApplicationContext(){return this;}
}"""
            target = sources / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(source)
        native = ROOT / 'android/app/src/main/java/libs/security/vault'
        production = set(compiler.PRODUCTION)
        production.update(str(file.relative_to(native)) for file in (native / 'cipher').glob('*.java'))
        production.update(str(file.relative_to(native)) for file in (native / 'storage/cipherStorage').glob('*.java'))
        for relative in production:
            target = sources / 'libs/security/vault' / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(native / relative, target)
        for relative in ['libs/security/providers/UniqueIdProvider.java', 'libs/security/crypto/Crypto.java']:
            target = sources / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / 'android/app/src/main/java' / relative, target)
        runner = sources / 'com/xaman/vaultdurability/Runner.java'
        runner.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / 'tests/vault-durability/android/Runner.java', runner)
        (folder / 'settings.gradle').write_text("rootProject.name = 'VaultDurabilityFixture'\n")
        (folder / 'local.properties').write_text('sdk.dir=' + str(sdk) + '\n')
        (folder / 'build.gradle').write_text("""
buildscript {
 repositories { google(); mavenCentral() }
 dependencies { classpath 'com.android.tools.build:gradle:8.6.1' }
}
apply plugin: 'com.android.application'
repositories { google(); mavenCentral() }
android {
 namespace 'com.xaman.vaultdurability'
 compileSdkVersion 34
 buildToolsVersion '34.0.0'
 defaultConfig {
  applicationId 'com.xaman.vaultdurability'
  minSdkVersion 26
  targetSdkVersion 34
  versionCode 1
  versionName 'fixture'
 }
 compileOptions {
  sourceCompatibility JavaVersion.VERSION_17
  targetCompatibility JavaVersion.VERSION_17
 }
}
""")
        (folder / 'src/main/AndroidManifest.xml').write_text("""
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
 <application android:label="Vault Durability Fixture" android:allowBackup="false" />
 <instrumentation android:name=".Runner" android:targetPackage="com.xaman.vaultdurability" />
</manifest>
""")
        print('Building isolated native Android fixture APK', flush=True)
        build = subprocess.run([str(ROOT / 'android/gradlew'), '-p', str(folder), 'assembleDebug',
                                '--console=plain', *(['--offline'] if args.offline else [])], capture_output=True, text=True, env={
                                    **os.environ, 'JAVA_HOME': os.environ.get('JAVA_HOME', '/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home')
                                })
        if build.returncode:
            raise RuntimeError('\n'.join((build.stdout + build.stderr).splitlines()[-100:]))
        apk = next((folder / 'build/outputs/apk/debug').glob('*.apk'))
        device('install', '-r', str(apk))
        def step(name, cut=0, phase='after'):
            device('shell', 'am', 'force-stop', PACKAGE)
            output = device('shell', 'am', 'instrument', '-w', '-r',
                            '-e', 'step', name, '-e', 'cut', str(cut), '-e', 'phase', phase,
                            PACKAGE + '/.Runner', check=False)
            if name != 'rekey' and 'VAULT_FIXTURE_PASSED ' + name not in output:
                raise RuntimeError(output)
            if 'VAULT_FIXTURE_FAILED' in output:
                raise RuntimeError(output)
        try:
            step('compat')
            print('Android legacy CBC read/migration/purge verified', flush=True)
            step('seed')
            step('failed-write')
            step('failed-write-check')
            print('Android failed-overwrite rollback and legacy metadata verified across restart', flush=True)
            cases = [] if args.compat_only else [(0, 'after')] + [(cut, phase) for cut in range(1, 9) for phase in ['before', 'after']]
            for cut, phase in cases:
                step('seed')
                step('rekey', cut, phase)
                step('verify', cut, phase)
                print('Android restart verified: cut=' + str(cut) + ', phase=' + phase, flush=True)
            print('Android device result: ' + str(len(cases)) + ' process-kill/restart cases passed with real Keystore/ciphers/preferences', flush=True)
        finally:
            device('uninstall', PACKAGE, check=False)

if __name__ == '__main__':
    main()
