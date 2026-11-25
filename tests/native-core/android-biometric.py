#!/usr/bin/env python3
# Production biometric module with explicit host API doubles; no hardware biometrics.
import argparse
import json
import zipfile
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument("--android-compile", action="store_true", help="Also compile production sources against the installed Android SDK/Gradle cache")
parser.add_argument("--source-ref", help="Optional Git revision for a baseline regression check")
args = parser.parse_args()
with tempfile.TemporaryDirectory(prefix="xaman-biometric-test-") as folder:
    folder = Path(folder)
    shutil.copytree(root / "tests/native-core/biometric", folder, dirs_exist_ok=True)
    relative = "android/app/src/main/java/libs/security/authentication/Biometric/BiometricModule.java"
    source = subprocess.check_output(["git", "show", args.source_ref + ":" + relative], cwd=root, text=True) if args.source_ref else (root / relative).read_text()
    target = folder / "libs/security/authentication/Biometric/BiometricModule.java"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(source)
    java_home = Path(os.environ.get("JAVA_HOME", "/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home"))
    javac = str(java_home / "bin/javac") if java_home.exists() else shutil.which("javac")
    java = str(java_home / "bin/java") if java_home.exists() else shutil.which("java")
    subprocess.run([javac, "-d", str(folder / "classes"), *map(str, folder.rglob("*.java"))], check=True)
    subprocess.run([java, "-cp", str(folder / "classes"), "Probe"], check=True)

    if args.android_compile:
        sdk = Path(os.environ.get("ANDROID_HOME", str(Path.home() / "Library/Android/sdk")))
        android_jar = sdk / "platforms/android-36/android.jar"
        if not android_jar.exists():
            raise RuntimeError("Install the project's Android 36 SDK first")
        cache = Path(os.environ.get("GRADLE_USER_HOME", str(Path.home() / ".gradle"))) / "caches"
        api_artifacts = ("biometric-1.1.0", "fragment-", "activity-", "lifecycle-",
                         "savedstate-", "core-", "annotation-", "collection-", "loader-",
                         "viewpager-", "customview-", "react-android-", "ReactAndroid",
                         "kotlin-stdlib-", "jsr305-")
        jars = [path for path in cache.rglob("*.jar")
                if any(artifact in path.name or artifact in path.parent.parent.name
                       for artifact in api_artifacts)]
        # Prefer one transformed copy of each API artifact.
        unique = {}
        for path in jars:
            unique.setdefault(path.name, path)
        jars = list(unique.values())
        # Local/pinned React AARs are used by the app rather than a published Maven API.
        for index, aar in enumerate((root / "android/app/libs").glob("*.aar")):
            with zipfile.ZipFile(aar) as archive:
                if "classes.jar" in archive.namelist():
                    out = folder / ("aar-" + str(index) + ".jar")
                    out.write_bytes(archive.read("classes.jar"))
                    jars.append(out)
        classpath = os.pathsep.join(map(str, [android_jar, *jars]))
        real = root / "android/app/src/main/java/libs/security/authentication/Biometric"
        options = ["-proc:none", "-classpath", classpath, "-d", str(folder / "android-classes"),
                   str(real / "BiometricModule.java"), str(real / "SecurityProvider.java")]
        argfile = folder / "android-javac.args"
        argfile.write_text("\n".join(json.dumps(item) for item in options))
        subprocess.run([javac, "@" + str(argfile)], check=True, cwd=folder)
        print("Production biometric module and SecurityProvider compiled against real Android/AndroidX/React APIs")
