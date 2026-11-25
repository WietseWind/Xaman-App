package androidx.fragment.app;
public class FragmentActivity extends android.app.Activity {
    public androidx.lifecycle.Lifecycle lifecycle = new androidx.lifecycle.Lifecycle();
    public FragmentManager manager = new FragmentManager();
    public androidx.lifecycle.Lifecycle getLifecycle() { return lifecycle; }
    public FragmentManager getSupportFragmentManager() { return manager; }
}
