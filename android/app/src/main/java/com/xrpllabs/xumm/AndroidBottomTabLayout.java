package com.xrpllabs.xumm;

import android.os.Build;
import android.view.Gravity;
import android.widget.LinearLayout;

import com.aurelhubert.ahbottomnavigation.AHBottomNavigation;
import com.reactnativenavigation.views.bottomtabs.BottomTabs;
import com.reactnativenavigation.views.bottomtabs.BottomTabsContainer;

import java.lang.ref.WeakReference;

/** Fit AH's real five-item row without changing its native container or click handlers. */
final class AndroidBottomTabLayout {
    private WeakReference<BottomTabs> current;
    private boolean compact;
    private int originalWidth;
    private int originalGravity;
    private float originalScaleX;
    private float originalScaleY;
    private float originalPivotX;
    private float originalPivotY;
    private boolean originalPivotExplicit;

    void apply(BottomTabsContainer container, int visibleWidth) {
        BottomTabs tabs = container.getBottomTabs();
        if (visibleWidth <= 0 || tabs == null || tabs.getHeight() <= 0
                || !(tabs.getLayoutParams() instanceof LinearLayout.LayoutParams)) {
            return;
        }
        if (current == null || current.get() != tabs) {
            current = null;
            compact = false;
        }
        int count = tabs.getItemsCount();
        if (count <= 0) {
            return;
        }
        int minimumResource = tabs.getTitleState() == AHBottomNavigation.TitleState.ALWAYS_SHOW && count > 3
                ? com.aurelhubert.ahbottomnavigation.R.dimen.bottom_navigation_small_inactive_min_width
                : com.aurelhubert.ahbottomnavigation.R.dimen.bottom_navigation_min_width;
        int minimumWidth = (int) Math.ceil(tabs.getResources().getDimension(minimumResource) * count);
        if (minimumWidth <= 0) {
            return;
        }
        LinearLayout.LayoutParams params = (LinearLayout.LayoutParams) tabs.getLayoutParams();
        if (visibleWidth >= minimumWidth) {
            // Normal full-size phones do not acquire new layout params or pivots.
            if (!compact) {
                return;
            }
            if (params.width != originalWidth || params.gravity != originalGravity) {
                params.width = originalWidth;
                params.gravity = originalGravity;
                tabs.setLayoutParams(params);
            }
            tabs.setScaleX(originalScaleX);
            tabs.setScaleY(originalScaleY);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && !originalPivotExplicit) {
                tabs.resetPivot();
            } else {
                tabs.setPivotX(originalPivotX);
                tabs.setPivotY(originalPivotY);
            }
            compact = false;
            return;
        }
        if (!compact) {
            current = new WeakReference<>(tabs);
            originalWidth = params.width;
            originalGravity = params.gravity;
            originalScaleX = tabs.getScaleX();
            originalScaleY = tabs.getScaleY();
            originalPivotX = tabs.getPivotX();
            originalPivotY = tabs.getPivotY();
            originalPivotExplicit = Build.VERSION.SDK_INT < Build.VERSION_CODES.P || tabs.isPivotSet();
        }
        compact = true;
        int gravity = ((originalGravity < 0 ? 0 : originalGravity)
                & ~Gravity.HORIZONTAL_GRAVITY_MASK & ~Gravity.RELATIVE_LAYOUT_DIRECTION) | Gravity.RIGHT;
        if (params.width != minimumWidth || params.gravity != gravity) {
            params.width = minimumWidth;
            params.gravity = gravity;
            tabs.setLayoutParams(params);
        }
        float scale = (float) visibleWidth / minimumWidth;
        if (tabs.getPivotX() != minimumWidth) tabs.setPivotX(minimumWidth);
        if (tabs.getPivotY() != tabs.getHeight()) tabs.setPivotY(tabs.getHeight());
        if (tabs.getScaleX() != scale) tabs.setScaleX(scale);
        if (tabs.getScaleY() != scale) tabs.setScaleY(scale);
    }
}
