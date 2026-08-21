package com.xrpllabs.xumm;

import com.reactnativenavigation.NavigationActivity;

import android.app.ActivityManager;
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
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.view.ViewGroup;
import android.view.Window;

import androidx.coordinatorlayout.widget.CoordinatorLayout;

public class LaunchActivity extends NavigationActivity {

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        System.setProperty("java.net.preferIPv4Stack", "true");
        System.setProperty("java.net.preferIPv6Addresses", "false");

        finishOtherXamanTasks();
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

    /**
     * Keep one recents entry. Empty taskAffinity plus a NEW_TASK start used
     * to open a second Xaman next to the existing one.
     */
    private void finishOtherXamanTasks() {
        ActivityManager manager = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        if (manager == null) {
            return;
        }
        int current = getTaskId();
        for (ActivityManager.AppTask task : manager.getAppTasks()) {
            ActivityManager.RecentTaskInfo info = task.getTaskInfo();
            if (info == null) {
                continue;
            }
            int otherId = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? info.taskId : info.id;
            if (otherId != current) {
                task.finishAndRemoveTask();
            }
        }
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+ keeps a solid-color system splash. Remove it so the
            // pattern + logo layout can show while React Native loads.
            getSplashScreen().setOnExitAnimationListener(splash -> splash.remove());
        }

        View rootView = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(rootView, (view, insets) -> {
            Insets navigationBars = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
            Insets displayCutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
            SafeAreaInsets.setInsets(
                    topContentInsetPx(),
                    navigationBars.bottom,
                    navigationBars.left,
                    navigationBars.right,
                    displayCutout.top
            );
            applyNavigatorNavInset();
            return insets;
        });
        ViewCompat.requestApplyInsets(rootView);
        rootView.getViewTreeObserver().addOnGlobalLayoutListener(this::applyNavigatorNavInset);
    }

    /**
     * RNN ignores navigation-bar insets on API 35+. Pad the navigator root so every
     * screen (tabs, send, settings) sits above the virtual home control, like iOS.
     * Do not pad the splash layout.
     */
    private void applyNavigatorNavInset() {
        ViewGroup content = findViewById(android.R.id.content);
        if (content == null) {
            return;
        }
        WindowInsetsCompat windowInsets = ViewCompat.getRootWindowInsets(content);
        int bottom = 0;
        if (windowInsets != null) {
            bottom = windowInsets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom;
        }
        if (bottom <= 0) {
            bottom = SafeAreaInsets.getSafeAreaBottom();
        }
        int background = resolveNavigatorBackgroundColor();
        boolean navigatorHasContent = false;
        for (int i = 0; i < content.getChildCount(); i++) {
            View child = content.getChildAt(i);
            if (!(child instanceof CoordinatorLayout)) {
                continue;
            }
            if (child.getPaddingBottom() != bottom) {
                child.setPadding(child.getPaddingLeft(), child.getPaddingTop(), child.getPaddingRight(), bottom);
            }
            // RNN stacks empty CoordinatorLayouts on top of the splash. White
            // here hid the boot image. Keep them clear until app UI is attached.
            if (child instanceof ViewGroup && ((ViewGroup) child).getChildCount() > 0) {
                navigatorHasContent = true;
                child.setBackgroundColor(background);
            } else {
                child.setBackgroundColor(Color.TRANSPARENT);
            }
        }
        if (navigatorHasContent) {
            getWindow().setBackgroundDrawable(new ColorDrawable(background));
        }
    }

    private int resolveNavigatorBackgroundColor() {
        int tabsId = getResources().getIdentifier("bottomTabs", "id", getPackageName());
        if (tabsId != 0) {
            View tabs = findViewById(tabsId);
            if (tabs != null) {
                Drawable background = tabs.getBackground();
                if (background instanceof ColorDrawable) {
                    int color = ((ColorDrawable) background).getColor();
                    if (Color.alpha(color) == 0xFF) {
                        return color;
                    }
                }
            }
        }
        return Color.WHITE;
    }

    private void seedInsetsFromResources() {
        int top = topContentInsetPx();
        SafeAreaInsets.setInsets(
                top,
                systemDimensionPx("navigation_bar_height"),
                0,
                0,
                top
        );
    }

    /**
     * Punch-hole devices inflate status_bar_height / statusBars.top to the
     * camera cutout (~52dp). Clock and wifi sit in the classic 24dp icon bar.
     * Pad that bar plus 8dp so titles sit close to the status icons, like iOS.
     */
    private int topContentInsetPx() {
        float density = getResources().getDisplayMetrics().density;
        int classic = Math.round(24f * density);
        int extra = Math.round(8f * density);
        int resource = systemDimensionPx("status_bar_height");
        int iconBar = resource;
        if (iconBar <= 0 || iconBar > classic + extra) {
            iconBar = classic;
        }
        return iconBar + extra;
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
