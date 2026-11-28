package libs.ui;

import android.content.Context;

import eightbitlab.com.blurview.BlurView;

/** Preserve Yoga child frames only when the adaptive window explicitly requests it. */
public final class AdaptiveBlurView extends BlurView {
    private boolean preserveReactChildLayout;

    AdaptiveBlurView(Context context) {
        super(context);
    }

    void setPreserveReactChildLayout(boolean preserve) {
        if (preserveReactChildLayout == preserve) {
            return;
        }
        preserveReactChildLayout = preserve;
        requestLayout();
    }

    @Override
    protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
        if (!preserveReactChildLayout) {
            super.onLayout(changed, left, top, right, bottom);
        }
        // React Native already assigns each adaptive child's Yoga frame.
    }
}
