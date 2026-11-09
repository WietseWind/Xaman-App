package com.xrpllabs.xumm;

import android.content.Intent;
import android.content.Context;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.google.android.gms.security.ProviderInstaller;
import com.google.android.gms.security.ProviderInstaller.ProviderInstallListener;

import com.facebook.react.PackageList;
import com.facebook.react.ReactInstanceEventListener;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.modules.network.OkHttpClientProvider;

// External Dependencies
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.firebase.crashlytics.FirebaseCrashlytics;
import com.reactnativenavigation.NavigationApplication;
import com.reactnativenavigation.react.NavigationReactNativeHost;

import expo.modules.updates.IUpdatesController;
import expo.modules.updates.UpdatesController;

// Local Libs
import libs.security.SecurityPackage;
import libs.notification.LocalNotificationPackage;
import libs.common.CommonPackage;
import libs.common.HTTPClientFactory;
import libs.common.XamanOta;
import libs.utils.UtilsPackage;
import libs.ui.UIPackage;

import java.util.List;
import java.util.Map;

public class ApplicationLoader extends NavigationApplication {
    public static volatile Context applicationContext;
    private static ApplicationLoader applicationLoaderInstance;

    private final ReactNativeHost mReactNativeHost =
            new NavigationReactNativeHost(this) {
                @Override
                protected String getJSMainModuleName() {
                    return "index";
                }

                @Override
                public boolean getUseDeveloperSupport() {
                    return BuildConfig.DEBUG;
                }

                @Override
                protected List<ReactPackage> getPackages() {
                    List<ReactPackage> packages = new PackageList(this).getPackages();
                    // Local Libs
                    packages.add(new UtilsPackage());
                    packages.add(new UIPackage());
                    packages.add(new LocalNotificationPackage());
                    packages.add(new CommonPackage());
                    packages.add(new SecurityPackage());
                    return packages;
                }

                // Over-the-air updates. react-native-navigation owns this host, so these are the
                // hooks Expo's ReactNativeHostWrapper would add (expo-updates UpdatesPackage).
                @Override
                protected ReactInstanceManager createReactInstanceManager() {
                    // picks the bundle to launch; with launchWaitMs 0 this only reads local state
                    UpdatesController.initialize(ApplicationLoader.this);
                    ReactInstanceManager manager = super.createReactInstanceManager();
                    reportOtaLaunch();
                    UpdatesController.getInstance().onDidCreateDevSupportManager(manager.getDevSupportManager());
                    manager.addReactInstanceEventListener(new ReactInstanceEventListener() {
                        @Override
                        public void onReactContextInitialized(@NonNull ReactContext context) {
                            UpdatesController.getInstance().onDidCreateReactInstance(context);
                            // watchdog: JS started for a screen. A process started only for a
                            // background service never gets here and does not count.
                            XamanOta.countLaunch(ApplicationLoader.this);
                        }
                    });
                    return manager;
                }

                @Nullable
                @Override
                protected String getJSBundleFile() {
                    IUpdatesController updates = UpdatesController.getInstance();
                    String file = updates.isActiveController() ? updates.getLaunchAssetFile() : null;
                    return file != null ? file : super.getJSBundleFile();
                }

                @Nullable
                @Override
                protected String getBundleAssetName() {
                    IUpdatesController updates = UpdatesController.getInstance();
                    String asset = updates.isActiveController() ? updates.getBundleAssetName() : null;
                    return asset != null ? asset : super.getBundleAssetName();
                }
            };

    /**
     * Attribute crashes to the running bundle (store version or a downloaded update) before
     * any JS runs.
     */
    private void reportOtaLaunch() {
        try {
            Map<String, Object> launch = XamanOta.launchedUpdateInfo();
            FirebaseCrashlytics crashlytics = FirebaseCrashlytics.getInstance();
            crashlytics.setCustomKey("ota_update_id", String.valueOf(launch.get("updateId")));
            crashlytics.setCustomKey("ota_id", ((Number) launch.get("otaId")).longValue());
            crashlytics.setCustomKey("ota_runtime", String.valueOf(launch.get("runtimeVersion")));
            crashlytics.setCustomKey("ota_embedded", Boolean.TRUE.equals(launch.get("isEmbedded")));
        } catch (Throwable ignore) {
            // reporting only; never block the launch
        }
    }

    @NonNull
    @Override
    public ReactNativeHost getReactNativeHost() {
        return mReactNativeHost;
    }

    @Override
    public void onCreate() {
        // cache crated instance
        applicationLoaderInstance = this;

        // cache application context
        try {
            applicationContext = getApplicationContext();
        } catch (Throwable ignore) {

        }

        // over-the-air updates: apply a pending revert to the store version (or a tripped
        // watchdog) before expo-updates starts in super.onCreate()
        XamanOta.prepareBeforeStart(this);

        // super
        super.onCreate();

        // Android 8.0–12L: a framework accessibility bug must not crash the app
        AccessibilityCrashGuard.install(this);

        // Force IPv4 for network connections to fix WebSocket issues on IPv6 networks
        System.setProperty("java.net.preferIPv4Stack", "true");
        System.setProperty("java.net.preferIPv6Addresses", "false");

        // try again to assign applicationContext if not set yet
        if (applicationContext == null) {
            applicationContext = getApplicationContext();
        }

        // update security provider
        upgradeSecurityProvider();
        // replace default http client
        OkHttpClientProvider.setOkHttpClientFactory(new HTTPClientFactory());
    }

    /**
     * Update Security providers
     */
    private void upgradeSecurityProvider() {
        ProviderInstaller.installIfNeededAsync(this, new ProviderInstallListener() {
            @Override
            public void onProviderInstalled() {
            }

            @Override
            public void onProviderInstallFailed(int errorCode, Intent recoveryIntent) {
                GoogleApiAvailability.getInstance().showErrorNotification(ApplicationLoader.this, errorCode);
            }
        });
    }
}