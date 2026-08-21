package com.xrpllabs.xumm;

import com.reactnativenavigation.NavigationActivity;

import android.content.Context;
import android.content.res.Configuration;
import android.os.Bundle;
import android.view.View;

import androidx.annotation.Nullable;
import com.reactnativenavigation.react.CommandListenerAdapter;

import libs.security.authentication.Biometric.BiometricModule;

import java.util.Locale;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.WindowInsetsControllerCompat;

import android.graphics.Color;
import android.os.Build;
import android.view.Window;

public class LaunchActivity extends NavigationActivity {

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        System.setProperty("java.net.preferIPv4Stack", "true");
        System.setProperty("java.net.preferIPv6Addresses", "false");

        // check only one root activity is running at the time
        if (!isTaskRoot()) {
            finish();
            return;
        }

        // initialise required modules
        BiometricModule.initialise();

        // set splash screen
        setSplashLayout();
    }

    @Override
    public void invokeDefaultOnBackPressed() {
        navigator.handleBack(new CommandListenerAdapter());
    }

    private void setSplashLayout() {
        Window window = getWindow();
        // Draw behind system bars. Do not margin the content view: that letterbox
        // shows the window background (black) above and below the app.
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
        }
        WindowInsetsControllerCompat bars =
                new WindowInsetsControllerCompat(window, window.getDecorView());
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(false);

        seedInsetsFromResources();
        setContentView(R.layout.activity_splash);

        View rootView = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(rootView, (view, insets) -> {
            Insets navigationBars = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
            Insets statusBars = insets.getInsets(WindowInsetsCompat.Type.statusBars());
            Insets displayCutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
            SafeAreaInsets.setInsets(
                    statusBars.top,
                    navigationBars.bottom,
                    navigationBars.left,
                    navigationBars.right,
                    displayCutout.top
            );
            return insets;
        });
        ViewCompat.requestApplyInsets(rootView);
    }

    private void seedInsetsFromResources() {
        SafeAreaInsets.setInsets(
                systemDimensionPx("status_bar_height"),
                systemDimensionPx("navigation_bar_height"),
                0,
                0,
                systemDimensionPx("status_bar_height")
        );
    }

    private int systemDimensionPx(final String name) {
        int id = getResources().getIdentifier(name, "dimen", "android");
        return id > 0 ? getResources().getDimensionPixelSize(id) : 0;
    }

    @Override
    protected void attachBaseContext(Context newBase) {
        final Configuration override = new Configuration(newBase.getResources().getConfiguration());
        // disable font scaling
        override.fontScale = 1.0f;
        // A workaround for AndroidKeyStore bug in RTL languages
        override.setLocale(Locale.ENGLISH);
        
        applyOverrideConfiguration(override);
        super.attachBaseContext(newBase);
    }
}
