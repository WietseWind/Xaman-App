# Only for Detox e2e release builds (-DtestBuildType=release, see build.gradle), never for store builds.
#
# The release test APK leaves out every library the app already ships and uses the app's copy at
# runtime, but the app's R8 strips and renames what the app itself does not use:
#   NoClassDefFoundError: org.junit.runner.notification.RunListener
#   NoClassDefFoundError: org.apache.commons.lang3.StringUtils
# Keep the libraries both APKs share (app:dependencies, releaseRuntimeClasspath vs
# releaseAndroidTestRuntimeClasspath). The app's own code is still shrunk as in a store build.

# junit 4.12 + hamcrest-core come with com.madgag.spongycastle:prov
-keep class org.junit.** { *; }
-keep class junit.** { *; }
-keep class org.hamcrest.** { *; }
-dontwarn org.junit.**
-dontwarn junit.**
-dontwarn org.hamcrest.**

-keep class org.apache.commons.lang3.** { *; }
-keep class com.google.common.** { *; }
-keep class javax.inject.** { *; }
-keep class kotlin.** { *; }
-keep class kotlinx.coroutines.** { *; }
-keep class androidx.tracing.** { *; }
-keep class androidx.concurrent.futures.** { *; }

# what those libraries reference but Android does not have
-dontwarn com.google.errorprone.annotations.**
-dontwarn com.google.j2objc.annotations.**
-dontwarn org.checkerframework.**
-dontwarn javax.annotation.**
-dontwarn javax.lang.model.**
-dontwarn sun.misc.Unsafe
-dontwarn java.lang.ClassValue
-dontwarn kotlinx.coroutines.debug.**
