package libs.ui;

import android.view.View;
import android.view.ViewTreeObserver;

import java.util.Objects;

/** Read current IME geometry on real decor traversals without owning its inset callbacks. */
final class KeyboardWindowGeometryObserver {
    interface Source {
        KeyboardWindowGeometry.Result read();
    }

    interface Listener {
        void changed(KeyboardWindowGeometry.Result geometry);
    }

    private final View decor;
    private final Source source;
    private final Listener listener;
    private boolean active;
    private ViewTreeObserver tree;
    private KeyboardWindowGeometry.Result previous;

    private final ViewTreeObserver.OnGlobalLayoutListener layoutListener = this::dispatch;
    private final ViewTreeObserver.OnPreDrawListener drawListener = () -> {
        dispatch();
        return true;
    };
    private final View.OnAttachStateChangeListener attachListener = new View.OnAttachStateChangeListener() {
        @Override
        public void onViewAttachedToWindow(View view) {
            bindTree();
            dispatch();
        }

        @Override
        public void onViewDetachedFromWindow(View view) {
            unbindTree();
            previous = null;
        }
    };

    KeyboardWindowGeometryObserver(View decor, Source source, Listener listener) {
        this.decor = decor;
        this.source = source;
        this.listener = listener;
    }

    boolean isBoundTo(View view) {
        return decor == view;
    }

    void start() {
        if (active) return;
        active = true;
        decor.addOnAttachStateChangeListener(attachListener);
        bindTree();
        dispatch();
    }

    void stop() {
        active = false;
        decor.removeOnAttachStateChangeListener(attachListener);
        unbindTree();
        previous = null;
    }

    private void bindTree() {
        if (!active || !decor.isAttachedToWindow()) return;
        ViewTreeObserver next = decor.getViewTreeObserver();
        if (tree == next || !next.isAlive()) return;
        unbindTree();
        tree = next;
        tree.addOnGlobalLayoutListener(layoutListener);
        tree.addOnPreDrawListener(drawListener);
    }

    private void unbindTree() {
        if (tree != null && tree.isAlive()) {
            tree.removeOnGlobalLayoutListener(layoutListener);
            tree.removeOnPreDrawListener(drawListener);
        }
        tree = null;
    }

    private void dispatch() {
        if (!active || !decor.isAttachedToWindow()) return;
        KeyboardWindowGeometry.Result geometry;
        try {
            geometry = source.read();
        } catch (RuntimeException ignored) {
            return;
        }
        if (!active || !decor.isAttachedToWindow() || geometry == null) return;
        if (previous != null && Double.compare(previous.keyboardTop, geometry.keyboardTop) == 0
                && Objects.equals(previous.visible, geometry.visible)) return;
        previous = geometry;
        listener.changed(geometry);
    }
}
