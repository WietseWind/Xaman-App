package libs.ui;

import android.os.Build;
import android.view.View;
import android.view.ViewGroup;

import androidx.annotation.NonNull;

import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.ViewGroupManager;
import com.facebook.react.views.view.ReactViewGroup;

/**
 * View group whose accessibility data is sensitive (API 34+).
 * AccessibilityServices with isAccessibilityTool=false cannot read this tree.
 * Accessibility tools such as TalkBack still can.
 */
class SensitiveAccessibilityViewManager extends ViewGroupManager<SensitiveAccessibilityViewManager.SensitiveView> {
    static final String REACT_CLASS = "SensitiveAccessibilityView";

    static final class SensitiveView extends ReactViewGroup {
        SensitiveView(ThemedReactContext context) {
            super(context);
            markTree(this);
        }

        @Override
        public void addView(View child, int index) {
            super.addView(child, index);
            markTree(child);
        }

        @Override
        protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
            super.onLayout(changed, left, top, right, bottom);
            // Children can be attached after the first addView (row changes, text updates).
            markTree(this);
        }
    }

    @NonNull
    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @NonNull
    @Override
    protected SensitiveView createViewInstance(@NonNull ThemedReactContext context) {
        return new SensitiveView(context);
    }

    static void markTree(View view) {
        if (view == null || Build.VERSION.SDK_INT < 34) {
            return;
        }

        view.setAccessibilityDataSensitive(View.ACCESSIBILITY_DATA_SENSITIVE_YES);

        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                markTree(group.getChildAt(i));
            }
        }
    }
}
